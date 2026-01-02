'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useUserContext } from '@/context/UserContext'
import { useYoco } from '@/providers/Yoco'
import { useSubscription } from '@/hooks/useSubscription'
import type { YocoProduct } from '@/lib/yocoService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

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
    <Badge className="bg-green-100 text-green-800">Active</Badge>
  ) : (
    <Badge variant="outline">Inactive</Badge>
  )

  const renderTransactionStatus = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const renderTransaction = (transaction: YocoTransaction) => {
    const created = transaction.createdAt ? format(new Date(transaction.createdAt), 'PP') : 'Unknown'
    const expires = transaction.expiresAt ? format(new Date(transaction.expiresAt), 'PP') : 'Manual review'

    return (
      <div key={transaction.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{created}</p>
            <p className="font-medium">{transaction.packageName || 'Subscription payment'}</p>
          </div>
          {renderTransactionStatus(transaction.status)}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <p>
            Amount: <span className="font-medium text-foreground">{transaction.currency || 'ZAR'}{' '}{transaction.amount?.toFixed(2) || '0.00'}</span>
          </p>
          <p>
            Plan: <span className="font-medium text-foreground">{transaction.plan || 'n/a'}</span>
          </p>
          <p>
            Entitlement: <span className="font-medium text-foreground">{transaction.entitlement || 'none'}</span>
          </p>
          <p>
            Expires: <span className="font-medium text-foreground">{expires}</span>
          </p>
        </div>
        {transaction.paymentUrl && transaction.status === 'pending' && (
          <Button asChild variant="link" className="gap-2 p-0 h-auto">
            <a href={transaction.paymentUrl} target="_blank" rel="noopener noreferrer">
              Resume payment
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    )
  }

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
    <div className="container py-16 sm:py-24">
      <div className="mx-auto max-w-3xl text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Choose your Simple Plek access</h1>
        <p className="mt-4 text-lg leading-7 text-muted-foreground">
          Unlock curated spaces, community events, and pro hosting features with secure Yoco payments. Review your history below for manual verification.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm">
          Subscription status: {activeSubscriptionBadge}
        </div>
      </div>

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-primary/30">
          <CardHeader>
            <Badge className="w-fit bg-primary text-primary-foreground">Standard Access</Badge>
            <CardTitle className="text-2xl">Garden Community</CardTitle>
            <CardDescription>
              Weekly membership to curated simple pleks with flexible bookings and virtual wine experiences.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              {loadingProducts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading pricing...
                </div>
              ) : standardProduct ? (
                <div>
                  <div className="text-4xl font-bold text-foreground">
                    R{standardProduct.price.toFixed(2)}
                    <span className="text-base font-normal text-muted-foreground">
                      {' '}
                      / {typeof latestTokenUsage?.total === 'number' ? `${latestTokenUsage.total} tokens` : 'tokens'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {latestTokenUsage
                      ? `Prompt ${typeof latestTokenUsage.prompt === 'number' ? latestTokenUsage.prompt : '—'} • Response ${typeof latestTokenUsage.candidates === 'number' ? latestTokenUsage.candidates : '—'}${typeof latestTokenUsage.cached === 'number' ? ` • Cached ${latestTokenUsage.cached}` : ''}`
                      : 'Token usage appears here after your first AI request.'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Standard plan currently unavailable.</p>
              )}
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>• Book pleks for weekly retreats and gatherings</li>
              <li>• Virtual wine curation with local makers</li>
              <li>• Member pricing on hosted add-ons</li>
              <li>• Supports CID greening & community events</li>
            </ul>
            <Button
              onClick={() => handleSubscribe(standardProduct)}
              disabled={!standardProduct || paymentLoading}
              className="w-full"
            >
              {paymentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {subscriptionStatus.isSubscribed && subscriptionStatus.entitlements.includes('standard')
                ? 'Standard access active'
                : 'Subscribe with Yoco'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-200">
          <CardHeader>
            <Badge className="w-fit bg-cyan-300 text-cyan-900">Pro Hosting</Badge>
            <CardTitle className="text-2xl">Annual Pro Plek</CardTitle>
            <CardDescription>
              Unlock pro masterclasses, host pricing tools, and annual access to the Simple Plek garden network.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              {loadingProducts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading pricing...
                </div>
              ) : proProduct ? (
                <div>
                  <div className="text-4xl font-bold text-foreground">
                    R{proProduct.price.toFixed(2)}
                    <span className="text-base font-normal text-muted-foreground"> / {proProduct.period}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Includes {proProduct.periodCount} {proProduct.period}{proProduct.periodCount > 1 ? 's' : ''} of pro hosting</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pro plan currently unavailable.</p>
              )}
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>• Publish and manage hosted masterclasses</li>
              <li>• Annual access to garden community events</li>
              <li>• Pro-level entitlements for revenue share</li>
              <li>• Unlocks admin/host upgrades inside Simple Plek</li>
            </ul>
            <Button
              onClick={() => handleSubscribe(proProduct)}
              disabled={!proProduct || paymentLoading}
              className="w-full bg-cyan-600 hover:bg-cyan-200"
            >
              {paymentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {subscriptionStatus.isSubscribed && subscriptionStatus.entitlements.some((entitlement) => entitlement.includes('pro'))
                ? 'Pro access active'
                : 'Upgrade to Pro with Yoco'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-12">
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>
            Track every Yoco checkout request. Use this list for manual verification if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTransactions ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching transactions...
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscription payments recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {transactions.map(renderTransaction)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}