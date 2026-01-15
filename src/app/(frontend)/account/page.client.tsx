'use client'

import React, { useEffect, useState } from 'react'
import { User } from '@/payload-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Settings, User as UserIcon, Crown, Calendar, FileText, Edit3, Loader2, AlertCircle, CheckCircle2, ArrowUpDown, Filter, Eye, Download, MoreHorizontal, Send, Sparkles, CreditCard, Activity } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { EditPostsLink } from '@/components/EditPostsLink'
import { Switch } from '@/components/ui/switch'
import Link from 'next/link'

type YocoTransaction = {
  id: string
  packageName?: string
  status?: 'completed' | 'pending' | 'failed' | 'cancelled'
  amount?: number
  currency?: string
  createdAt?: string
  expiresAt?: string
  category?: string
}

type AvailableProduct = {
  id: string
  title: string
  description: string
  price: number
  currency: string
  period: string
  periodCount: number
  category: string
  features: string[]
  entitlement: string
  icon?: string
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface AccountClientProps {
  user: User | null
}

export default function AccountClient({ user }: AccountClientProps) {
  const { isSubscribed, isLoading } = useSubscription()
  const [transactions, setTransactions] = useState<YocoTransaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [activeTransaction, setActiveTransaction] = useState<YocoTransaction | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [messages, setMessages] = useState<Message[]>([{
    id: '1',
    role: 'assistant',
    content: `Hi ${user?.name || 'there'}! I can help you with bookings, subscriptions, or any questions about your account. What would you like to know?`,
    timestamp: new Date()
  }])
  const [inputValue, setInputValue] = useState('')
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [availableProducts, setAvailableProducts] = useState<AvailableProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [activeProducts, setActiveProducts] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'features' | 'transactions' | 'activity'>('features')

  useEffect(() => {
    const loadTransactions = async () => {
      if (!user) return
      setLoadingTransactions(true)
      try {
        const response = await fetch('/api/yoco/transactions', { credentials: 'include' })
        if (!response.ok) return
        const data = await response.json()
        const allTransactions = data.transactions || []
        setTransactions(allTransactions)
        const current = allTransactions.find((tx: YocoTransaction) => {
          if (tx.status !== 'completed') return false
          if (!tx.expiresAt) return true
          return new Date(tx.expiresAt) > new Date()
        })
        setActiveTransaction(current || null)
      } catch (error) {
        console.error('Failed to fetch Yoco transactions:', error)
      } finally {
        setLoadingTransactions(false)
      }
    }

    loadTransactions()
  }, [user])

  useEffect(() => {
    const loadProducts = async () => {
      if (!user) return
      setLoadingProducts(true)
      try {
        const response = await fetch('/api/packages/available-products', { credentials: 'include' })
        if (!response.ok) return
        const products = await response.json()
        setAvailableProducts(products || [])
        
        // Determine which products are active based on subscription
        const activeSet = new Set<string>()
        if (isSubscribed) {
          // Add products that match user's entitlement
          products.forEach((product: AvailableProduct) => {
            if (product.entitlement === 'standard' || product.entitlement === 'pro') {
              activeSet.add(product.id)
            }
          })
        }
        setActiveProducts(activeSet)
      } catch (error) {
        console.error('Failed to fetch available products:', error)
      } finally {
        setLoadingProducts(false)
      }
    }

    loadProducts()
  }, [user, isSubscribed])

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">You need to be logged in to view this page.</p>
        </div>
      </div>
    )
  }

  const userRoles = Array.isArray(user.role) ? (user.role as string[]) : user.role ? [user.role] : []
  const isHost = userRoles.includes('host')
  const isAdmin = userRoles.includes('admin')
  const isCustomer = userRoles.includes('customer')

  // Infer subscription tier from transaction history
  const inferSubscriptionTier = (transactions: YocoTransaction[]): string => {
    const hasLuxuryBooking = transactions.some(t => (t.amount || 0) > 10000 && t.status === 'completed')
    const hasMultipleSubscriptions = transactions.filter(t => t.status === 'completed').length >= 2
    const totalSpent = transactions
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0)
    
    if (hasLuxuryBooking && totalSpent > 15000) return 'Premium'
    if (hasMultipleSubscriptions || totalSpent > 500) return 'Member'
    if (isSubscribed) return 'Member'
    return 'Basic'
  }

  const tier = inferSubscriptionTier(transactions)

  // Filter and sort transactions
  const filteredTransactions = transactions
    .filter(t => statusFilter === 'all' || t.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
      } else {
        const amountA = a.amount || 0
        const amountB = b.amount || 0
        return sortOrder === 'asc' ? amountA - amountB : amountB - amountA
      }
    })

  const toggleSort = (column: 'date' | 'amount') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoadingAI) return
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoadingAI(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `User account context: ${user?.name}, ${user?.email}, Roles: ${userRoles.join(', ')}, Subscription: ${isSubscribed ? 'Active' : 'None'}, Tier: ${tier}. Transactions: ${transactions.length} total, ${transactions.filter(t => t.status === 'completed').length} completed. User question: ${inputValue}`,
          context: 'account-page'
        }),
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || 'I apologize, but I couldn\'t generate a response. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('AI chat error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoadingAI(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
      pending: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
      failed: 'bg-red-500/10 text-red-700 border-red-500/20',
      cancelled: 'bg-gray-500/10 text-gray-700 border-gray-500/20'
    }
    return styles[status] || styles.pending
  }

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      Premium: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
      Member: 'bg-cyan-700 text-cyan-300 border-transparent',
      Basic: 'bg-gray-500/10 text-gray-700 border-gray-500/20'
    }
    return styles[tier] || styles.Basic
  }

  const getUserInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      const parts = name.split(' ').filter(Boolean)
      if (parts.length >= 2) {
        const first = parts[0]?.[0]
        const last = parts[parts.length - 1]?.[0]
        if (first && last) {
          return (first + last).toUpperCase()
        }
      }
      const firstChar = name[0]
      if (firstChar) {
        return firstChar.toUpperCase()
      }
    }
    if (email) {
      const firstChar = email[0]
      if (firstChar) {
        return firstChar.toUpperCase()
      }
    }
    return 'U'
  }

  const handleCancelMembership = async () => {
    if (!activeTransaction) return
    setCancelLoading(true)
    setCancelError(null)
    setCancelSuccess(null)
    try {
      const response = await fetch('/api/yoco/subscriptions/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ transactionId: activeTransaction.id }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to cancel membership')
      }
      setCancelSuccess('Membership cancellation requested. Access will be downgraded shortly.')
      setActiveTransaction(null)
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id === activeTransaction.id
            ? { ...tx, status: 'cancelled', expiresAt: tx.expiresAt || new Date().toISOString() }
            : tx,
        ),
      )
      window.dispatchEvent(new Event('yoco:subscription-updated'))
    } catch (error) {
      console.error('Failed to cancel membership:', error)
      setCancelError(error instanceof Error ? error.message : 'Failed to cancel membership.')
    } finally {
      setCancelLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Account</h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Manage your account and access your features
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white rounded-full">
                {getUserInitials(user.name, user.email)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Search Hero */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="text-center mb-8">
            <div className="inline-flex h-12 w-12 items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl mb-4">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              AI Assistant
            </h2>
            <p className="text-gray-600">
              Ask anything about your bookings, payments, or account features
            </p>
          </div>

          <div className="relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask about bookings, payments, features..."
              className="h-14 w-full text-base text-gray-900 bg-white border border-gray-300 rounded-xl px-5 pr-14 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              disabled={isLoadingAI}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoadingAI}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center text-white bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>

          {messages.length > 0 && (
            <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {messages[messages.length - 1]?.content || 'Hi! I can help you with bookings, subscriptions, or any questions about your account. What would you like to know?'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <nav className="flex gap-8">
            {[
              {
                id: 'features' as const,
                label: 'Features',
                icon: Settings,
              },
              {
                id: 'transactions' as const,
                label: 'Transactions',
                icon: CreditCard,
              },
              {
                id: 'activity' as const,
                label: 'Quick Actions',
                icon: Activity,
              },
            ].map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-1 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {activeTab === 'features' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Account Info Card */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Account Information
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Your profile and subscription details
                    </p>
                  </div>
                  <div className={`inline-flex items-center text-xs font-medium border rounded-full px-3 py-1 ${getTierBadge(tier)}`}>
                    {tier} Tier
                  </div>
                </div>

                <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
                  <div className="flex h-16 w-16 items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-xl font-semibold text-white rounded-full">
                    {getUserInitials(user.name, user.email)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{user.name || 'No name set'}</div>
                    <div className="text-sm text-gray-600">{user.email}</div>
                    <div className="flex items-center gap-2 mt-2">
                      {userRoles.map((role) => (
                        <div
                          key={role}
                          className={`flex items-center text-xs font-medium border rounded-full px-2 py-0.5 ${
                            role === 'admin'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : role === 'host'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                          }`}
                        >
                          {role === 'admin' && <Crown className="mr-1 h-3 w-3" />}
                          {role === 'host' && <Crown className="mr-1 h-3 w-3" />}
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  {isSubscribed && activeTransaction ? (
                    <Button
                      variant="destructive"
                      onClick={handleCancelMembership}
                      disabled={cancelLoading}
                      className="w-full"
                    >
                      {cancelLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        'Cancel Subscription'
                      )}
                    </Button>
                  ) : (
                    <Link href="/subscribe" className="block">
                      <Button className="w-full bg-gray-900 hover:bg-gray-800">
                        Manage Subscription
                      </Button>
                    </Link>
                  )}
                  {cancelError && (
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4" />
                      <span>{cancelError}</span>
                    </div>
                  )}
                  {cancelSuccess && (
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-green-50 p-2 text-xs text-green-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4" />
                      <span>{cancelSuccess}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Available Features */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Available Features
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      title: 'Booking Estimates',
                      desc: 'Get pricing estimates',
                    },
                    {
                      title: 'Plek Booking',
                      desc: 'Book available spaces',
                    },
                    {
                      title: 'Edit Posts/Pleks',
                      desc: 'Manage listings',
                    },
                    {
                      title: 'Create Blog Posts',
                      desc: 'Publish content',
                    },
                    {
                      title: 'Manage Pleks',
                      desc: 'Property management',
                    },
                    {
                      title: 'Luxury Hosting',
                      desc: 'Premium packages',
                    },
                    {
                      title: 'Concierge Service',
                      desc: '24/7 support',
                    },
                    {
                      title: 'Priority Booking',
                      desc: 'Early access',
                    },
                  ].map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex-shrink-0 h-2 w-2 bg-green-500 rounded-full mt-1.5"></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {feature.title}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {feature.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Resources
                </h3>
                <div className="space-y-2">
                  {[
                    {
                      label: 'Documentation',
                      href: '#',
                    },
                    {
                      label: 'API Reference',
                      href: '#',
                    },
                    {
                      label: 'Support Center',
                      href: '#',
                    },
                    {
                      label: 'Community',
                      href: '#',
                    },
                  ].map((link, idx) => (
                    <a
                      key={idx}
                      href={link.href}
                      className="block text-sm text-gray-600 hover:text-gray-900 transition-colors py-1"
                    >
                      {link.label} →
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Transaction History
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    View and manage your payment history
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`flex items-center gap-1.5 h-9 text-xs font-medium rounded-lg px-3 transition-colors ${
                      statusFilter === 'all'
                        ? 'text-white bg-gray-900'
                        : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('completed')}
                    className={`h-9 text-xs font-medium rounded-lg px-3 transition-colors ${
                      statusFilter === 'completed'
                        ? 'text-white bg-gray-900'
                        : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Completed
                  </button>
                  <button
                    onClick={() => setStatusFilter('pending')}
                    className={`h-9 text-xs font-medium rounded-lg px-3 transition-colors ${
                      statusFilter === 'pending'
                        ? 'text-white bg-gray-900'
                        : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Pending
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-600 px-6 py-3">
                      Description
                    </th>
                    <th className="text-left text-xs font-medium text-gray-600 px-6 py-3">
                      <button
                        onClick={() => toggleSort('date')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Date <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left text-xs font-medium text-gray-600 px-6 py-3">
                      <button
                        onClick={() => toggleSort('amount')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Amount <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left text-xs font-medium text-gray-600 px-6 py-3">
                      Status
                    </th>
                    <th className="text-right text-xs font-medium text-gray-600 px-6 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingTransactions ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-600 mx-auto" />
                      </td>
                    </tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                        No transactions found.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {transaction.packageName || 'Subscription payment'}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {transaction.category || 'Payment'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {transaction.createdAt
                            ? new Date(transaction.createdAt).toLocaleDateString('en-GB')
                            : 'Unknown date'}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {transaction.currency || 'ZAR'} {transaction.amount?.toFixed(2) ?? '0.00'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 ${
                              transaction.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : transaction.status === 'completed'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-gray-50 text-gray-700 border border-gray-200'
                            }`}
                          >
                            {transaction.status || 'pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button className="h-8 w-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                              <Eye className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                              <Download className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredTransactions.length} of {transactions.length} transactions
              </p>
              <Link
                href="/subscribe"
                className="text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                View all transactions →
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: 'Browse Properties',
                desc: 'View available spaces',
                icon: Calendar,
                color: 'blue',
                href: '/posts',
              },
              {
                title: 'My Bookings',
                desc: 'View your schedule',
                icon: Calendar,
                color: 'purple',
                href: '/bookings',
                show: isHost || isAdmin,
              },
              {
                title: 'Manage Pleks',
                desc: 'Admin dashboard',
                icon: FileText,
                color: 'green',
                href: '/plek/adminPage',
                show: isHost || isAdmin,
              },
              {
                title: 'Edit Posts',
                desc: 'Manage content',
                icon: Edit3,
                color: 'orange',
                href: '#',
                component: EditPostsLink,
              },
              {
                title: 'Book a Plek',
                desc: 'Reserve a space',
                icon: FileText,
                color: 'indigo',
                href: '/plek',
                show: isSubscribed,
              },
            ]
              .filter((action) => action.show !== false)
              .map((action, idx) => {
                const Icon = action.icon
                const colorClasses = {
                  blue: 'bg-blue-50 text-blue-600',
                  purple: 'bg-purple-50 text-purple-600',
                  green: 'bg-green-50 text-green-600',
                  orange: 'bg-orange-50 text-orange-600',
                  indigo: 'bg-indigo-50 text-indigo-600',
                }
                if (action.component) {
                  const Component = action.component
                  return (
                    <Component key={idx} className="no-underline">
                      <button className="flex items-center gap-4 p-6 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all text-left w-full">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colorClasses[action.color as keyof typeof colorClasses]}`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {action.title}
                          </div>
                          <div className="text-sm text-gray-600 mt-0.5">
                            {action.desc}
                          </div>
                        </div>
                      </button>
                    </Component>
                  )
                }
                
                return (
                  <Link key={idx} href={action.href} className="no-underline">
                    <button className="flex items-center gap-4 p-6 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all text-left w-full">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colorClasses[action.color as keyof typeof colorClasses]}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {action.title}
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5">
                          {action.desc}
                        </div>
                      </div>
                    </button>
                  </Link>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
