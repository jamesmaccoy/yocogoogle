'use client'

import React from 'react'
import EmailPasswordForm from './_components/EmailPasswordForm'
import EmailAuthForm from './_components/EmailAuthForm'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2Icon } from 'lucide-react'
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 font-sans text-zinc-950">
      <div className="w-full max-w-[450px] bg-white border border-zinc-200 rounded-xl shadow-sm p-8 md:p-10">
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
        <p className="mt-6 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-zinc-900 hover:underline"
          >
            Register now
          </Link>
        </p>
      </div>
    </div>
  )
}
