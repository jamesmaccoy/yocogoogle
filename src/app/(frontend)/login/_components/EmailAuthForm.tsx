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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 items-center">
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
      <Button type="submit" className="w-full" disabled={loading || value.length < 6}>
        Verify OTP
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
        <form onSubmit={form.handleSubmit(handleSendEmail)} className="space-y-3">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-md my-3">{error}</div>}
          <Input
            type="email"
            placeholder="Email Address"
            autoComplete="email"
            {...form.register('email', { required: true })}
          />
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Login Link'}
          </Button>
        </form>
      )}
      {step === 'otp' && (
        <div>
          <div className="mb-4 text-center">
            <p className="font-medium">We&apos;ve sent a login link and code to:</p>
            <p className="font-mono text-primary">{email}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Enter the 6-digit code from your email to continue.
            </p>
          </div>
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-md my-3">{error}</div>}
          <div className="flex items-center justify-center">
            <OtpInput onSubmit={handleVerifyOtp} loading={loading} />
          </div>
        </div>
      )}
    </div>
  )
}
