'use client'

import React from 'react'
import EmailPasswordForm from './_components/EmailPasswordForm'
import EmailAuthForm from './_components/EmailAuthForm'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2Icon, Command, Quote } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Tab = 'password' | 'email'

function TabButton({
  isActive,
  onClick,
  label,
}: {
  isActive: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center h-9 text-sm font-medium rounded-md transition-all duration-200
        ${isActive 
          ? 'bg-primary text-primary-foreground shadow-sm' 
          : 'bg-secondary/50 text-secondary-foreground hover:bg-secondary/70'}
      `}
    >
      {label}
    </button>
  )
}

export default function LoginPage() {
  const [mode, setMode] = React.useState<Tab>('password')
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
            className="text-sm font-medium hover:text-zinc-900 transition-colors text-primary"
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

        <div className="w-full max-w-[450px] space-y-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">
              Welcome back
            </h1>
            <p className="text-zinc-500 text-base">
              Login to access your account
            </p>
          </div>

          {/* Success Alert */}
          {registered && (
            <Alert className="mb-6 border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2Icon className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Registration successful! Please log in with your email and password.
              </AlertDescription>
            </Alert>
          )}

          {/* Tab Navigation */}
          <div className="relative flex bg-zinc-100/80 p-1 rounded-lg mb-8 border border-zinc-200/50">
            <TabButton
              isActive={mode === 'password'}
              onClick={() => setMode('password')}
              label="Email"
            />
            <TabButton
              isActive={mode === 'email'}
              onClick={() => setMode('email')}
              label="One time pin"
            />
          </div>

          {/* Form Component */}
          {mode === 'password' ? <EmailPasswordForm /> : <EmailAuthForm />}

          {/* Footer */}
          <div className="mt-6 space-y-3">
            <p className="text-center text-sm text-zinc-500">
              Don&apos;t have an account?{' '}
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                Register now
              </Link>
            </p>
            <p className="text-center text-xs text-zinc-400">
              By continuing, you agree to our{' '}
              <Link
                href="/terms-of-service"
                className="hover:text-zinc-600 underline underline-offset-2"
              >
                Terms of Service
              </Link>
              {' '}and{' '}
              <Link
                href="/privacy-policy"
                className="hover:text-zinc-600 underline underline-offset-2"
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
