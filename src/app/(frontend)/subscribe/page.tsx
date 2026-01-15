'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useUserContext } from '@/context/UserContext'
import { useYoco } from '@/providers/Yoco'
import { useSubscription } from '@/hooks/useSubscription'
import type { YocoProduct } from '@/lib/yocoService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ContentPreview } from '@/components/subscribe/ContentPreview'
import { PricingSection } from '@/components/subscribe/PricingSection'
import { TransactionFeed, type Transaction } from '@/components/subscribe/TransactionFeed'
import { NotificationToast } from '@/components/subscribe/NotificationToast'

type YocoTransaction = {
  id: string
  intent: 'booking' | 'subscription' | 'product'
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  packageName?: string
  amount?: number
  currency?: string
  entitlement?: 'none' | 'standard' | 'pro'
  plan?: 'free' | 'standard' | 'pro'
  createdAt?: string
  completedAt?: string
  expiresAt?: string
  paymentUrl?: string
}

type TokenUsageSummary = {
  total: number | null
  prompt: number | null
  candidates: number | null
  cached: number | null
  thoughts: number | null
  timestamp: number
}

const periodToDays = (product: YocoProduct) => {
  switch (product.period) {
    case 'day':
      return product.periodCount
    case 'week':
      return product.periodCount * 7
    case 'month':
      return product.periodCount * 30
    case 'year':
      return product.periodCount * 365
    default:
      return 30
  }
}

export default function SubscribePage() {
  const router = useRouter()
  const { currentUser } = useUserContext()
  const { createPaymentLink, isInitialized } = useYoco()
  const subscriptionStatus = useSubscription()

  const [products, setProducts] = useState<YocoProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [transactions, setTransactions] = useState<YocoTransaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [latestTokenUsage, setLatestTokenUsage] = useState<TokenUsageSummary | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      const response = await fetch('/api/yoco/products', { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Failed to load products')
      }
      const data = await response.json()
      setProducts(data.products || [])
    } catch (err) {
      console.error('Failed to fetch Yoco products:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch products')
    } finally {
      setLoadingProducts(false)
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    if (!currentUser) return
    setLoadingTransactions(true)
    try {
      const response = await fetch('/api/yoco/transactions', { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Failed to load transactions')
      }
      const data = await response.json()
      setTransactions(data.transactions || [])
    } catch (err) {
      console.error('Failed to fetch transactions:', err)
    } finally {
      setLoadingTransactions(false)
    }
  }, [currentUser])

  useEffect(() => {
    if (isInitialized) {
      fetchProducts()
      fetchTransactions()
    }
  }, [fetchProducts, fetchTransactions, isInitialized])

  useEffect(() => {
    if (!subscriptionStatus.isLoading && subscriptionStatus.isSubscribed) {
      router.replace('/bookings')
    }
  }, [subscriptionStatus.isLoading, subscriptionStatus.isSubscribed, router])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const isSuccess = params.get('success') === 'true'
    const transactionId = params.get('transactionId')

    const finalize = async () => {
      if (isSuccess && transactionId) {
        try {
          const response = await fetch('/api/yoco/transactions/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ transactionId }),
          })

          if (!response.ok) {
            const data = await response.json().catch(() => ({}))
            throw new Error(data.error || 'Failed to confirm transaction')
          }

          setSuccessMessage('Payment confirmed. Your subscription has been updated.')
          fetchTransactions()
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('yoco:subscription-updated'))
          }
        } catch (err) {
          console.error('Failed to confirm transaction:', err)
          setError(err instanceof Error ? err.message : 'Failed to confirm payment')
        } finally {
          router.replace('/subscribe')
        }
      }
    }

    finalize()
  }, [fetchTransactions, router])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const readStoredUsage = (): TokenUsageSummary | null => {
      try {
        const stored = window.localStorage.getItem('ai:lastTokenUsage')
        if (!stored) return null
        const parsed = JSON.parse(stored)
        if (!parsed || typeof parsed !== 'object') return null
        return parsed as TokenUsageSummary
      } catch (storageError) {
        console.warn('Failed to load stored AI token usage', storageError)
        return null
      }
    }

    const initialUsage = readStoredUsage()
    if (initialUsage) {
      setLatestTokenUsage(initialUsage)
    }

    const handleTokenUsage = (event: Event) => {
      const customEvent = event as CustomEvent<TokenUsageSummary>
      if (customEvent.detail) {
        setLatestTokenUsage(customEvent.detail)
      }
    }

    window.addEventListener('aiTokenUsage', handleTokenUsage as EventListener)

    return () => {
      window.removeEventListener('aiTokenUsage', handleTokenUsage as EventListener)
    }
  }, [])

  const standardProduct = useMemo(
    () => products.find((product) => product.entitlement !== 'pro'),
    [products],
  )

  const proProduct = useMemo(
    () => products.find((product) => product.entitlement === 'pro'),
    [products],
  )

  const handleSubscribe = useCallback(
    async (product: YocoProduct | undefined) => {
      if (!product || paymentLoading) return
      if (!currentUser) {
        router.push('/login?redirect=/subscribe')
        return
      }

      setPaymentLoading(true)
      setError(null)
      setSuccessMessage(null)

      try {
        const metadata = {
          intent: 'subscription' as const,
          entitlement: (product.entitlement as 'pro' | 'standard' | 'none') || 'none',
          plan: (product.entitlement === 'pro' ? 'pro' : 'standard') as 'pro' | 'standard',
          periodDays: periodToDays(product),
        }

        const paymentLink = await createPaymentLink(product.id, currentUser.name || currentUser.email || undefined, metadata)

        if (!paymentLink?.url) {
          throw new Error('Unable to start checkout')
        }

        window.location.href = paymentLink.url
      } catch (err) {
        console.error('Error creating payment link:', err)
        setError(err instanceof Error ? err.message : 'Failed to create payment link')
      } finally {
        setPaymentLoading(false)
      }
    },
    [createPaymentLink, currentUser, paymentLoading, router],
  )

  const activeSubscriptionBadge = subscriptionStatus.isSubscribed ? (
    <Badge className="bg-green-100 text-green-800 border-transparent">Active</Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-500 border-slate-200">Inactive</Badge>
  )

  // Transform transactions for TransactionFeed component
  const transformedTransactions: Transaction[] = transactions.map((tx) => ({
    id: tx.id,
    createdAt: tx.createdAt,
    packageName: tx.packageName,
    status: tx.status,
    amount: tx.amount,
    currency: tx.currency,
    plan: tx.plan,
    entitlement: tx.entitlement,
    expiresAt: tx.expiresAt,
    paymentUrl: tx.paymentUrl,
  }))

  // Get latest pending transaction for notification
  const latestPendingTransaction = transactions.find((tx) => tx.status === 'pending')

  if (!isInitialized || subscriptionStatus.isLoading) {
    return (
      <div className="container py-16">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading subscription data...
        </div>
      </div>
    )
  }

  if (subscriptionStatus.isSubscribed) {
    return (
      <div className="container py-16">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-green-500" />
          <h1 className="text-2xl font-semibold text-foreground">Subscription Active</h1>
          <p className="mt-2 text-muted-foreground">
            You already have an active Simple Plek membership. Head over to your bookings to start planning your stay.
          </p>
          <Button className="mt-6" onClick={() => router.push('/bookings')}>
            Go to bookings
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-white font-[GeistSans] text-[#020817]">
      <NotificationToast transaction={latestPendingTransaction} />

      <div className="mx-auto max-w-[1376px] px-4 py-16 sm:px-8 sm:py-24">
        {/* Header Section */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <Badge className="mb-6 bg-slate-100 text-slate-600 border-slate-200">
            Secure Payments by Yoco
          </Badge>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-[#020817] sm:text-5xl">
            Choose your Simple Plek access
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-slate-500">
            Unlock curated spaces, community events, and pro hosting features.
            Join the garden community today.
          </p>

          <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
            <span>Subscription status:</span>
            {activeSubscriptionBadge}
          </div>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="mx-auto mb-8 max-w-2xl rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>
                <p className="font-medium">Something went wrong</p>
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mx-auto mb-8 max-w-2xl rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <p>{successMessage}</p>
            </div>
          </div>
        )}

        {/* Content Preview (Privacy/Teaser) */}
        <div className="mx-auto mb-16 max-w-4xl">
          <div className="mb-4 flex items-center justify-between px-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Member Exclusive Content
            </h2>
            <span className="text-xs text-slate-400">Preview</span>
          </div>
          <ContentPreview />
        </div>

        {/* Pricing Cards */}
        <div className="mx-auto mb-20 max-w-5xl">
          <PricingSection
            standardProduct={standardProduct}
            proProduct={proProduct}
            loadingProducts={loadingProducts}
            paymentLoading={paymentLoading}
            latestTokenUsage={latestTokenUsage}
            subscriptionStatus={subscriptionStatus}
            onSubscribe={handleSubscribe}
          />
        </div>

        {/* Transaction Feed */}
        <div className="mx-auto max-w-4xl rounded-xl bg-slate-50 p-6 sm:p-8">
          <TransactionFeed transactions={transformedTransactions} loading={loadingTransactions} />
        </div>
      </div>
    </div>
  )
}