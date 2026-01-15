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

  const COLORS = {
    teal: 'rgb(45, 212, 191)',
    tealDark: 'rgb(22, 78, 99)',
  }

  return (
    <form onSubmit={form.handleSubmit(handleLogin)} className="grid gap-4">
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
          {...form.register('email')}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="grid gap-2">
        <label
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          htmlFor="password"
        >
          Password
        </label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          autoCapitalize="none"
          {...form.register('password')}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <Button
        className="w-full mt-2 h-10"
        type="submit"
        style={{
          backgroundColor: COLORS.teal,
          color: COLORS.tealDark,
        }}
      >
        Sign In with Email
      </Button>
    </form>
  )
}
