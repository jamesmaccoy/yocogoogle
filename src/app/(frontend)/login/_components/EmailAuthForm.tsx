'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { useUserContext } from '@/context/UserContext'

type EmailFormValues = {
  email: string
}

function OtpInput({ onSubmit, loading }: { onSubmit: (otp: string) => void; loading: boolean }) {
  const [value, setValue] = React.useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    onSubmit(value)
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="flex justify-center">
        <InputOTP maxLength={6} onChange={(v) => setValue(v)}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button
        type="submit"
        className="w-full h-10"
        disabled={loading || value.length < 6}
        variant="default"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Verifying...
          </span>
        ) : (
          'Verify OTP'
        )}
      </Button>
    </form>
  )
}

export default function EmailAuthForm() {
  const [step, setStep] = React.useState<'email' | 'otp'>('email')
  const [email, setEmail] = React.useState('')
  const [authRequestId, setAuthRequestId] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')

  const { handleAuthChange } = useUserContext()

  const form = useForm<EmailFormValues>({
    defaultValues: { email: '' },
  })

  const handleSendEmail = async (values: EmailFormValues) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/authRequests/magic', {
        method: 'POST',
        body: JSON.stringify({ email: values.email }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to send email')

      const data = await res.json()

      setEmail(data.email)
      setAuthRequestId(data.authRequestId)
      setStep('otp')
    } catch (err: any) {
      setError(err.message || 'Failed to send email')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (otp: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/authRequests/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, otp, requestId: authRequestId }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Invalid OTP')
      // Optionally: handleAuthChange()
      // Optionally: validateRedirect
      handleAuthChange()
      router.push(next && typeof next === 'string' ? next : '/bookings')
    } catch (err: any) {
      setError(err.message || 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {step === 'email' && (
        <form onSubmit={form.handleSubmit(handleSendEmail)} className="grid gap-4">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-md">{error}</div>}
          <div className="grid gap-2">
            <label
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              htmlFor="email"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              {...form.register('email', { required: true })}
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button
            className="w-full mt-2 h-10"
            type="submit"
            disabled={loading}
            variant="default"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Sending...
              </span>
            ) : (
              'Send Login Link'
            )}
          </Button>
        </form>
      )}
      {step === 'otp' && (
        <div className="grid gap-4">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-zinc-900">
              We&apos;ve sent a login link and code to:
            </p>
            <p className="text-sm font-mono text-primary font-semibold">{email}</p>
            <p className="text-sm text-zinc-500 mt-3">
              Enter the 6-digit code from your email to continue.
            </p>
          </div>
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-md">{error}</div>}
          <OtpInput onSubmit={handleVerifyOtp} loading={loading} />
        </div>
      )}
    </div>
  )
}
