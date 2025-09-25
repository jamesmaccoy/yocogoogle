'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserContext } from '@/context/UserContext'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import { useForm } from 'react-hook-form'
import { useSubscription } from '@/hooks/useSubscription'
import { validateRedirect } from '@/utils/validateRedirect'

type FormValues = {
  email: string
  password: string
}

export default function EmailPasswordForm() {
  const form = useForm<FormValues>({
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const [error, setError] = React.useState<string | null>(null)
  const { handleAuthChange } = useUserContext()
  const { isSubscribed, isLoading: isSubscriptionLoading } = useSubscription()

  const handleLogin = async (values: FormValues) => {
    try {
      const res = await fetch(`/api/users/login`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(values),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error('Invalid email or password')
      }

      handleAuthChange()

      const validatedNext = validateRedirect(next)

      if (validatedNext) {
        router.push(validatedNext)
        return
      }

      // After successful login, check subscription status
      if (!isSubscribed && !isSubscriptionLoading) {
        router.push('/subscribe')
      } else {
        router.push('/bookings')
      }
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-3">
      {error && <div className="bg-red-100 text-red-700 p-3 rounded-md my-3">{error}</div>}
      <Input
        type="email"
        placeholder="Email Address"
        autoComplete="email"
        {...form.register('email')}
      />
      <Input
        type="password"
        placeholder="Password"
        autoComplete="password"
        {...form.register('password')}
      />
      <Button className="w-full" type="submit">
        Login
      </Button>
    </form>
  )
}
