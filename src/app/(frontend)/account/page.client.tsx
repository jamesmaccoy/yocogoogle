'use client'

import React, { useEffect, useState } from 'react'
import { User } from '@/payload-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Settings, User as UserIcon, Crown, Calendar, FileText, Edit3, Loader2, AlertCircle, CheckCircle2, ArrowUpDown, Filter, Eye, Download, MoreHorizontal, Send, Sparkles } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { EditPostsLink } from '@/components/EditPostsLink'
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

  // Get available packages based on tier and roles
  const getAvailablePackages = () => {
    const packages: Array<{ name: string; description: string; available: boolean }> = [
      {
        name: 'Booking Estimates',
        description: 'Get pricing estimates for stays',
        available: true
      }
    ]

    if (isSubscribed) {
      packages.push({
        name: 'Plek Booking',
        description: 'Book stays at available pleks',
        available: true
      })
    }

    if ((isCustomer || isAdmin) && isSubscribed) {
      packages.push({
        name: 'Edit Posts/Pleks',
        description: 'Create and edit property listings and content',
        available: true
      })
    }

    if (isHost || isAdmin) {
      packages.push({
        name: 'Create Blog Posts',
        description: 'Write and publish blog content',
        available: true
      })
      packages.push({
        name: 'Manage Pleks',
        description: 'Create and manage property listings',
        available: true
      })
    }

    if (tier === 'Premium') {
      packages.push({
        name: 'Luxury Hosting',
        description: 'Host premium weekly packages',
        available: true
      })
      packages.push({
        name: 'Concierge Service',
        description: '24/7 dedicated support',
        available: true
      })
    }

    if (!isSubscribed) {
      packages.push({
        name: 'Calendar Integration',
        description: 'Sync bookings to your calendar',
        available: false
      })
    }

    return packages
  }

  const availablePackages = getAvailablePackages()

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
    <div className="w-full max-w-[1152px] mx-auto px-4 py-8 bg-white text-[rgb(2,8,23)]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[30px] font-bold leading-9 text-gray-900 m-0">
          Account
        </h1>
        <p className="text-gray-600 mt-2 m-0">
          Manage your account and access your features
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions Block */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Settings className="h-5 w-5 text-gray-700" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Quick Actions
                </h3>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Common tasks and features you can access
              </p>
            </div>
            <div className="px-6 pb-6">
              <div className="grid grid-cols-2 gap-3">
                <Link href="/posts" className="no-underline">
                  <button className="group relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          Browse Properties
                        </div>
                        <div className="text-xs text-gray-500">
                          View available spaces
                        </div>
                      </div>
                    </div>
                  </button>
                </Link>
                
                {(isHost || isAdmin) && (
                  <Link href="/bookings" className="no-underline">
                    <button className="group relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-100">
                          <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            My Bookings
                          </div>
                          <div className="text-xs text-gray-500">
                            View your schedule
                          </div>
                        </div>
                      </div>
                    </button>
                  </Link>
                )}

                {(isHost || isAdmin) && (
                  <Link href="/plek/adminPage" className="no-underline">
                    <button className="group relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600 transition-colors group-hover:bg-green-100">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            Manage Pleks
                          </div>
                          <div className="text-xs text-gray-500">
                            Admin dashboard
                          </div>
                        </div>
                      </div>
                    </button>
                  </Link>
                )}

                <EditPostsLink className="no-underline">
                  <button className="group relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600 transition-colors group-hover:bg-orange-100">
                        <Edit3 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          Edit Posts
                        </div>
                        <div className="text-xs text-gray-500">
                          Manage content
                        </div>
                      </div>
                    </div>
                  </button>
                </EditPostsLink>

                {isSubscribed && (
                  <Link href="/plek" className="no-underline">
                    <button className="group relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            Book a Plek
                          </div>
                          <div className="text-xs text-gray-500">
                            Reserve a space
                          </div>
                        </div>
                      </div>
                    </button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Available Features Block */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  Available Features
                </h3>
                <div className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-1 ${getTierBadge(tier)}`}>
                  {tier} Tier
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Features available based on your {tier.toLowerCase()} tier membership
              </p>
            </div>
            <div className="px-6 pb-6">
              <div className="space-y-2">
                {availablePackages.map((pkg, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                      pkg.available
                        ? 'border-gray-200 bg-white hover:bg-gray-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          pkg.available ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      <div>
                        <div
                          className={`text-sm font-medium ${
                            !pkg.available ? 'text-gray-500' : 'text-gray-900'
                          }`}
                        >
                          {pkg.name}
                        </div>
                        <div
                          className={`text-xs ${
                            !pkg.available ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          {pkg.description}
                        </div>
                      </div>
                    </div>
                    {!pkg.available && (
                      <Link href="/subscribe" className="no-underline">
                        <button className="inline-flex h-8 items-center justify-center rounded-md bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-800">
                          Upgrade
                        </button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Transaction History
              </h3>
              <p className="text-sm text-gray-500">
                View and manage your payment history
              </p>
            </div>

            {/* Filters */}
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`inline-flex items-center gap-1.5 h-8 text-xs font-medium border rounded-md px-3 transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Filter className="h-3 w-3" />
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('completed')}
                  className={`inline-flex items-center h-8 text-xs font-medium border rounded-md px-3 transition-colors ${
                    statusFilter === 'completed'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setStatusFilter('pending')}
                  className={`inline-flex items-center h-8 text-xs font-medium border rounded-md px-3 transition-colors ${
                    statusFilter === 'pending'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Pending
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="px-6 pb-6">
              {loadingTransactions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                  <span className="ml-2 text-sm text-gray-600">Loading transactions...</span>
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">No transactions recorded yet.</p>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left text-xs font-medium text-gray-700 px-4 py-3">
                            Description
                          </th>
                          <th className="text-left text-xs font-medium text-gray-700 px-4 py-3">
                            <button
                              onClick={() => toggleSort('date')}
                              className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                            >
                              Date
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="text-left text-xs font-medium text-gray-700 px-4 py-3">
                            <button
                              onClick={() => toggleSort('amount')}
                              className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                            >
                              Amount
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="text-left text-xs font-medium text-gray-700 px-4 py-3">
                            Status
                          </th>
                          <th className="text-right text-xs font-medium text-gray-700 px-4 py-3">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {filteredTransactions.map((transaction) => (
                          <tr
                            key={transaction.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">
                                {transaction.packageName || 'Subscription payment'}
                              </div>
                              <div className="text-xs text-gray-500 capitalize">
                                {transaction.category || 'payment'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {transaction.createdAt
                                ? new Date(transaction.createdAt).toLocaleDateString('en-GB')
                                : 'Unknown date'}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {transaction.currency || 'ZAR'} {transaction.amount?.toFixed(2) ?? '0.00'}
                            </td>
                            <td className="px-4 py-3">
                              <div
                                className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-0.5 capitalize ${getStatusBadge(
                                  transaction.status || 'pending'
                                )}`}
                              >
                                {transaction.status || 'pending'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button className="inline-flex items-center justify-center h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button className="inline-flex items-center justify-center h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                                  <Download className="h-4 w-4" />
                                </button>
                                <button className="inline-flex items-center justify-center h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-gray-600">
                      Showing {filteredTransactions.length} of {transactions.length} transactions
                    </p>
                    <Link
                      href="/subscribe"
                      className="text-sm font-medium text-gray-900 hover:text-gray-700 transition-colors"
                    >
                      View all transactions →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Account Info Block */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <UserIcon className="h-5 w-5 text-gray-700" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Account Info
                </h3>
              </div>
            </div>
            <div className="px-6 pb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-lg">
                  {getUserInitials(user.name, user.email)}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{user.name || 'No name set'}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Roles
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {userRoles.map((role) => (
                      <div
                        key={role}
                        className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-1 ${
                          role === 'admin'
                            ? 'bg-red-500/10 text-red-700 border-red-500/20'
                            : role === 'host'
                            ? 'bg-purple-100 text-purple-800 border-transparent'
                            : 'bg-cyan-700 text-cyan-300 border-transparent'
                        }`}
                      >
                        {role === 'admin' && <Crown className="h-3 w-3 mr-1" />}
                        {role === 'host' && <Crown className="h-3 w-3 mr-1" />}
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </div>
                    ))}
                  </div>
                </div>

                {!isLoading && (
                  <div>
                    <div className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Subscription Tier
                    </div>
                    <div className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-1 ${getTierBadge(tier)}`}>
                      {tier}
                    </div>
                    {isSubscribed && activeTransaction && (
                      <div className="mt-3 space-y-2 text-sm">
                        {activeTransaction.expiresAt && (
                          <p className="text-gray-600">
                            Renewing on{' '}
                            {new Date(activeTransaction.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
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
                            'Cancel Membership'
                          )}
                        </Button>
                        {cancelError && (
                          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                            <AlertCircle className="mt-0.5 h-4 w-4" />
                            <span>{cancelError}</span>
                          </div>
                        )}
                        {cancelSuccess && (
                          <div className="flex items-start gap-2 rounded-md bg-green-50 p-2 text-xs text-green-700">
                            <CheckCircle2 className="mt-0.5 h-4 w-4" />
                            <span>{cancelSuccess}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {!isSubscribed && (
                      <p className="text-xs text-gray-500 mt-2">
                        Inferred from activity
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Assistant Block */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  AI Assistant
                </h3>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Ask anything about your account
              </p>
            </div>

            {/* Messages */}
            <div className="px-6 pb-4 max-h-[300px] overflow-y-auto space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {isLoadingAI && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask about bookings, payments..."
                  className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  disabled={isLoadingAI}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoadingAI}
                  className="inline-flex items-center justify-center h-10 w-10 bg-gray-900 text-white rounded-lg transition-colors hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Powered by AI • Instant responses
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 