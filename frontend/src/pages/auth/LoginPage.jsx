import { Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import api from '@/lib/api'
import { Logo } from '@/components/shared/Logo'

export default function LoginPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useAppForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values) {
    try {
      const { data } = await api.post('/auth/login', values)
      if (data.devOtp) {
        toast.success(`Dev OTP: ${data.devOtp}`, { duration: 15000 })
      } else {
        toast.success('OTP sent to your email')
      }
      navigate(`/verify-otp?purpose=login&email=${encodeURIComponent(values.email)}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send OTP')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="xl" showText={false} className="mb-4" />
          <h1 className="text-2xl font-semibold text-foreground">SimplyTrack</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your work email - we&apos;ll send a one-time code.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@firm.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send OTP'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New firm?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an organization
          </Link>
        </p>
      </div>
    </div>
  )
}
