'use client'

import React from 'react'
import EmailPasswordForm from './_components/EmailPasswordForm'
import EmailAuthForm from './_components/EmailAuthForm'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function LoginPage() {
  const [mode, setMode] = React.useState<'password' | 'email'>('password')

  return (
    <div className="container my-20">
      <div className="border max-w-[450px] mx-auto p-10 rounded-md bg-card">
        <div className="space-y-2 text-center mb-6">
          <h1 className="font-bold text-3xl">Login</h1>
          <p className="text-muted-foreground text-lg">Login as a customer</p>
        </div>
        <div className="flex gap-2 mb-6">
          <Button
            variant={mode === 'password' ? 'default' : 'outline'}
            className="w-1/2"
            onClick={() => setMode('password')}
          >
            Password Login
          </Button>
          <Button
            variant={mode === 'email' ? 'default' : 'outline'}
            className="w-1/2"
            onClick={() => setMode('email')}
          >
            Email Link / OTP
          </Button>
        </div>
        {mode === 'password' ? <EmailPasswordForm /> : <EmailAuthForm />}
        <div className="mt-5">
          <p className="text-center text-sm tracking-wide font-medium">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
