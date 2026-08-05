import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { verifyOtpSchema } from '@/lib/schemas'
import { useAppForm } from '@/hooks/useAppForm'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import { Logo } from '@/components/shared/Logo'

export default function VerifyOtpPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)

  const email = params.get('email') || ''
  const purpose = params.get('purpose') === 'register' ? 'register' : 'login'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useAppForm({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { otp: '' },
  })

  const backLink = useMemo(
    () => (purpose === 'register' ? '/register' : '/login'),
    [purpose]
  )

  async function onSubmit(values) {
    if (!email) {
      toast.error('Missing email. Start from login or register.')
      return
    }

    try {
      const { data } = await api.post('/auth/verify-otp', {
        email,
        otp: values.otp,
        purpose,
      })
      setAuth({ user: data.user, accessToken: data.accessToken })
      toast.success('Verified successfully')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" showText={false} className="mb-4" />
          <h1 className="text-2xl font-semibold text-foreground">Enter OTP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-foreground">{email || 'your email'}</span>.
            Valid for 5 minutes.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="otp" required>
              One-time password
            </Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="tracking-[0.35em] tabular-nums"
              {...register('otp')}
            />
            {errors.otp && (
              <p className="mt-1 text-xs text-destructive">{errors.otp.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying…' : 'Verify & continue'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Wrong email?{' '}
          <Link to={backLink} className="font-medium text-primary hover:underline">
            Go back
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Without SMTP configured, the OTP is printed in the backend terminal.
        </p>
      </div>
    </div>
  )
}
