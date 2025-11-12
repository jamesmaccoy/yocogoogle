'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserContext } from '@/context/UserContext'
import { validateRedirect } from '@/utils/validateRedirect'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import { useForm } from 'react-hook-form'

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

  const searchParams = useSearchParams()

  const next = searchParams.get('next')

  const { handleAuthChange } = useUserContext()

  const handleRegister = async (values: FormValues) => {
    try {
      const res = await fetch(`/api/users`, {
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
    <div className="container my-20">
      <div className="border max-w-[450px] mx-auto p-10 rounded-md bg-card">
        {error && <div className="bg-red-100 text-red-700 p-3 rounded-md my-3">{error}</div>}
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl">Register</h1>
          <p className="text-muted-foreground text-lg">Register as a customer</p>
        </div>
        <form onSubmit={form.handleSubmit(handleRegister)} className="mt-5 space-y-3">
          <Input type="text" placeholder="Name" autoComplete="name" {...form.register('name')} />
          <Input
            type="email"
            placeholder="Email Address"
            autoComplete="email"
            {...form.register('email')}
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete="new-password"
            {...form.register('password')}
          />

          <Button className="w-full" type="submit">
            Register
          </Button>
        </form>

        <div className="mt-5">
          <p className="text-center text-sm tracking-wide font-medium">
            Already have an account?{' '}
            <Link href="/register" className="text-primary underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
