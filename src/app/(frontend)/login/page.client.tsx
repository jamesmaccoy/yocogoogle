'use client'

import React from 'react'
import EmailPasswordForm from './_components/EmailPasswordForm'
import EmailAuthForm from './_components/EmailAuthForm'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2Icon, Command, Quote } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// Brand colors from design
const COLORS = {
  teal: 'rgb(45, 212, 191)',
  tealDark: 'rgb(22, 78, 99)',
  gray: 'rgb(201, 201, 207)',
  text: 'rgb(2, 8, 23)',
}

export default function LoginPage() {
  const [mode, setMode] = React.useState<'password' | 'email'>('password')
  const searchParams = useSearchParams()
  const registered = searchParams.get('registered') === 'true'

  return (
    <div className="w-full min-h-screen grid lg:grid-cols-2">
      {/* Left Side - Marketing / Hero */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-900 p-10 text-white relative overflow-hidden">
        {/* Background Image/Pattern */}
        <div className="absolute inset-0 bg-zinc-900">
          <img
            src="https://www.simpleplek.co.za/api/media/file/studio-2.jpg?q=80&w=2564&auto=format&fit=crop"
            alt="Abstract background"
            className="w-full h-full object-cover opacity-100"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2 text-lg font-medium">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
            <Command className="h-5 w-5" />
          </div>
          Retro pop up market down in the studio
        </div>

        {/* Testimonial */}
        <div className="relative z-10 max-w-md">
          <blockquote className="space-y-2">
            <div className="flex gap-2 text-zinc-400 mb-4">
              <Quote className="h-8 w-8 rotate-180 opacity-50" />
            </div>
            <p className="text-xl font-medium leading-relaxed">
              "Life is a series of experiences some real some fantasy but you don't have to decide which are which as long as you know there are some things you can always count on"
            </p>
            <footer className="text-sm text-zinc-400 mt-4">
              Frank Rob
              <span className="block text-xs text-zinc-500 mt-1">
                Art Director 1962-1965, See poster in the out house
              </span>
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="relative flex flex-col items-center justify-center p-8 bg-white">
        {/* Top Right Register Link */}
        <div className="absolute right-8 top-8">
          <Link
            href="/register"
            className="text-sm font-medium hover:text-zinc-900 transition-colors"
            style={{
              color: COLORS.tealDark,
            }}
          >
            Register
          </Link>
        </div>

        {/* Mobile Logo (visible only on small screens) */}
        <div className="lg:hidden absolute top-8 left-8 flex items-center gap-2 font-medium">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Command className="h-4 w-4" />
          </div>
          SimplePlek
        </div>

        <div className="w-full max-w-[400px] space-y-8">
          {/* Header */}
          <div className="flex flex-col space-y-2 text-center">
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{
                color: COLORS.text,
              }}
            >
              Login
            </h1>
            <p className="text-sm text-zinc-500">
              Enter your email below to login to your account
            </p>
          </div>

          {/* Success Alert */}
          {registered && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2Icon className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Registration successful! Please log in with your email and password.
              </AlertDescription>
            </Alert>
          )}

          {/* Auth Method Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`
                flex items-center justify-center h-9 text-sm font-medium rounded-md transition-all duration-200
                ${mode === 'password' ? 'shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}
              `}
              style={{
                backgroundColor: mode === 'password' ? COLORS.teal : 'transparent',
                color: mode === 'password' ? COLORS.tealDark : undefined,
              }}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => setMode('email')}
              className={`
                flex items-center justify-center h-9 text-sm font-medium rounded-md transition-all duration-200
                ${mode === 'email' ? 'shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}
              `}
              style={{
                backgroundColor: mode === 'email' ? 'white' : 'transparent',
                color: mode === 'email' ? COLORS.text : undefined,
              }}
            >
              Email Link / OTP
            </button>
          </div>

          {/* Form Component */}
          {mode === 'password' ? <EmailPasswordForm /> : <EmailAuthForm />}

          {/* Footer Links */}
          <p className="px-8 text-center text-sm text-zinc-500">
            By clicking continue, you agree to our{' '}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-zinc-900"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-zinc-900"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
