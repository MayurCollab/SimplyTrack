import { Link, useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import api from '@/lib/api'
import { Logo } from '@/components/shared/Logo'

export default function RegisterPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useAppForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { orgName: '', name: '', email: '' },
  })

  async function onSubmit(values) {
    try {
      const { data } = await api.post('/auth/register', values)
      if (data.devOtp) {
        toast.success(`Dev OTP: ${data.devOtp}`, { duration: 15000 })
      } else {
        toast.success('OTP sent to your email')
      }
      navigate(`/verify-otp?purpose=register&email=${encodeURIComponent(values.email)}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="xl" showText={false} className="mb-4" />
          <h1 className="text-2xl font-semibold text-foreground">SimplyTrack</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Register your organization. You&apos;ll be the Owner.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="orgName" required>
              Organization name
            </Label>
            <Input id="orgName" placeholder="Acme Accounting" {...register('orgName')} />
            {errors.orgName && (
              <p className="mt-1 text-xs text-destructive">{errors.orgName.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="name" required>
              Your name
            </Label>
            <Input id="name" placeholder="Jane Doe" {...register('name')} />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="jane@firm.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Continue'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
