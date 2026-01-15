'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserContext } from '@/context/UserContext'
import { validateRedirect } from '@/utils/validateRedirect'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'

type FormValues = {
  email: string
  password: string
  name: string
  role: string
}

export default function RegisterPage() {
  const form = useForm<FormValues>({
    defaultValues: {
      email: '',
      password: '',
      name: '',
      role: 'customer',
    },
  })

  const router = useRouter()

  const [error, setError] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)

  const searchParams = useSearchParams()

  const next = searchParams.get('next')
  
  // If registering from a guest invite URL, automatically set role to 'guest'
  // Support both old format (/guest/invite) and new short format (/i/)
  const isGuestInvite = Boolean(next?.includes('/guest/invite') || next?.startsWith('/i/'))
  
  // Set default role based on whether this is a guest invite
  React.useEffect(() => {
    form.setValue('role', isGuestInvite ? 'guest' : 'customer')
  }, [isGuestInvite, form])

  const { handleAuthChange } = useUserContext()

  const handleRegister = async (values: FormValues) => {
    try {
      const res = await fetch(`/api/users/register`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(values),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Registration failed')
      }

      const validatedNext = validateRedirect(next)

      if (validatedNext) {
        router.push(`/login?next=${validatedNext}&registered=true`)
        return
      }

      handleAuthChange()
      router.push('/login?registered=true')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'An error occurred during registration')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 font-sans text-zinc-950">
      <div className="w-full max-w-[450px] bg-white border border-zinc-200 rounded-xl shadow-sm p-8 md:p-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">
            Create an account
          </h1>
          <p className="text-zinc-500 text-base">
            Register to get started
          </p>
        </div>

        {/* Error Alert */}
        {error && <div className="mb-6 bg-red-100 text-red-700 p-3 rounded-md">{error}</div>}

        {/* Form */}
        <form onSubmit={form.handleSubmit(handleRegister)} className="grid gap-4">
          <div className="grid gap-2">
            <label
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              htmlFor="name"
            >
              Name
            </label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              autoComplete="name"
              {...form.register('name')}
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                autoCapitalize="none"
                {...form.register('password')}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 pr-10 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            className="w-full mt-2 h-10 bg-zinc-900 text-white hover:bg-zinc-800"
            type="submit"
          >
            Create Account
          </Button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-zinc-900 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
