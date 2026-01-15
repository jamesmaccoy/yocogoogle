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

// MD5 hash function for Gravatar
const md5 = (str: string): string => {
  const rotateLeft = (value: number, amount: number): number => {
    return (value << amount) | (value >>> (32 - amount))
  }
  
  const addUnsigned = (x: number, y: number): number => {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xFFFF)
  }
  
  const md5cmn = (q: number, a: number, b: number, x: number, s: number, t: number): number => {
    a = addUnsigned(a, addUnsigned(addUnsigned((b & q) | ((~b) & x), t), s))
    return addUnsigned(rotateLeft(a, s), b)
  }
  
  const md5ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn((b & c) | ((~b) & d), a, b, x, s, t)
  }
  
  const md5gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn((b & d) | (c & (~d)), a, b, x, s, t)
  }
  
  const md5hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
  }
  
  const md5ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn(c ^ (b | (~d)), a, b, x, s, t)
  }
  
  const calcMD5 = (str: string): string => {
    let k, AA, BB, CC, DD, a, b, c, d
    const S11 = 7, S12 = 12, S13 = 17, S14 = 22
    const S21 = 5, S22 = 9, S23 = 14, S24 = 20
    const S31 = 4, S32 = 11, S33 = 16, S34 = 23
    const S41 = 6, S42 = 10, S43 = 15, S44 = 21
    
    str = utf8Encode(str)
    const x = convertToWordArray(str)
    a = 0x67452301
    b = 0xEFCDAB89
    c = 0x98BADCFE
    d = 0x10325476
    
    for (k = 0; k < x.length; k += 16) {
      AA = a
      BB = b
      CC = c
      DD = d
      a = md5ff(a, b, c, d, x[k + 0] || 0, S11, 0xD76AA478)
      d = md5ff(d, a, b, c, x[k + 1] || 0, S12, 0xE8C7B756)
      c = md5ff(c, d, a, b, x[k + 2] || 0, S13, 0x242070DB)
      b = md5ff(b, c, d, a, x[k + 3] || 0, S14, 0xC1BDCEEE)
      a = md5ff(a, b, c, d, x[k + 4] || 0, S11, 0xF57C0FAF)
      d = md5ff(d, a, b, c, x[k + 5] || 0, S12, 0x4787C62A)
      c = md5ff(c, d, a, b, x[k + 6] || 0, S13, 0xA8304613)
      b = md5ff(b, c, d, a, x[k + 7] || 0, S14, 0xFD469501)
      a = md5ff(a, b, c, d, x[k + 8] || 0, S11, 0x698098D8)
      d = md5ff(d, a, b, c, x[k + 9] || 0, S12, 0x8B44F7AF)
      c = md5ff(c, d, a, b, x[k + 10] || 0, S13, 0xFFFF5BB1)
      b = md5ff(b, c, d, a, x[k + 11] || 0, S14, 0x895CD7BE)
      a = md5ff(a, b, c, d, x[k + 12] || 0, S11, 0x6B901122)
      d = md5ff(d, a, b, c, x[k + 13] || 0, S12, 0xFD987193)
      c = md5ff(c, d, a, b, x[k + 14] || 0, S13, 0xA679438E)
      b = md5ff(b, c, d, a, x[k + 15] || 0, S14, 0x49B40821)
      a = md5gg(a, b, c, d, x[k + 1] || 0, S21, 0xF61E2562)
      d = md5gg(d, a, b, c, x[k + 6] || 0, S22, 0xC040B340)
      c = md5gg(c, d, a, b, x[k + 11] || 0, S23, 0x265E5A51)
      b = md5gg(b, c, d, a, x[k + 0] || 0, S24, 0xE9B6C7AA)
      a = md5gg(a, b, c, d, x[k + 5] || 0, S21, 0xD62F105D)
      d = md5gg(d, a, b, c, x[k + 10] || 0, S22, 0x2441453)
      c = md5gg(c, d, a, b, x[k + 15] || 0, S23, 0xD8A1E681)
      b = md5gg(b, c, d, a, x[k + 4] || 0, S24, 0xE7D3FBC8)
      a = md5gg(a, b, c, d, x[k + 9] || 0, S21, 0x21E1CDE6)
      d = md5gg(d, a, b, c, x[k + 14] || 0, S22, 0xC33707D6)
      c = md5gg(c, d, a, b, x[k + 3] || 0, S23, 0xF4D50D87)
      b = md5gg(b, c, d, a, x[k + 8] || 0, S24, 0x455A14ED)
      a = md5gg(a, b, c, d, x[k + 13] || 0, S21, 0xA9E3E905)
      d = md5gg(d, a, b, c, x[k + 2] || 0, S22, 0xFCEFA3F8)
      c = md5gg(c, d, a, b, x[k + 7] || 0, S23, 0x676F02D9)
      b = md5gg(b, c, d, a, x[k + 12] || 0, S24, 0x8D2A4C8A)
      a = md5hh(a, b, c, d, x[k + 5] || 0, S31, 0xFFFA3942)
      d = md5hh(d, a, b, c, x[k + 8] || 0, S32, 0x8771F681)
      c = md5hh(c, d, a, b, x[k + 11] || 0, S33, 0x6D9D6122)
      b = md5hh(b, c, d, a, x[k + 14] || 0, S34, 0xFDE5380C)
      a = md5hh(a, b, c, d, x[k + 1] || 0, S31, 0xA4BEEA44)
      d = md5hh(d, a, b, c, x[k + 4] || 0, S32, 0x4BDECFA9)
      c = md5hh(c, d, a, b, x[k + 7] || 0, S33, 0xF6BB4B60)
      b = md5hh(b, c, d, a, x[k + 10] || 0, S34, 0xBEBFBC70)
      a = md5hh(a, b, c, d, x[k + 13] || 0, S31, 0x289B7EC6)
      d = md5hh(d, a, b, c, x[k + 0] || 0, S32, 0xEAA127FA)
      c = md5hh(c, d, a, b, x[k + 3] || 0, S33, 0xD4EF3085)
      b = md5hh(b, c, d, a, x[k + 6] || 0, S34, 0x4881D05)
      a = md5hh(a, b, c, d, x[k + 9] || 0, S31, 0xD9D4D039)
      d = md5hh(d, a, b, c, x[k + 12] || 0, S32, 0xE6DB99E5)
      c = md5hh(c, d, a, b, x[k + 15] || 0, S33, 0x1FA27CF8)
      b = md5hh(b, c, d, a, x[k + 2] || 0, S34, 0xC4AC5665)
      a = md5ii(a, b, c, d, x[k + 0] || 0, S41, 0xF4292244)
      d = md5ii(d, a, b, c, x[k + 7] || 0, S42, 0x432AFF97)
      c = md5ii(c, d, a, b, x[k + 14] || 0, S43, 0xAB9423A7)
      b = md5ii(b, c, d, a, x[k + 5] || 0, S44, 0xFC93A039)
      a = md5ii(a, b, c, d, x[k + 12] || 0, S41, 0x655B59C3)
      d = md5ii(d, a, b, c, x[k + 3] || 0, S42, 0x8F0CCC92)
      c = md5ii(c, d, a, b, x[k + 10] || 0, S43, 0xFFEFF47D)
      b = md5ii(b, c, d, a, x[k + 1] || 0, S44, 0x85845DD1)
      a = md5ii(a, b, c, d, x[k + 8] || 0, S41, 0x6FA87E4F)
      d = md5ii(d, a, b, c, x[k + 15] || 0, S42, 0xFE2CE6E0)
      c = md5ii(c, d, a, b, x[k + 6] || 0, S43, 0xA3014314)
      b = md5ii(b, c, d, a, x[k + 13] || 0, S44, 0x4E0811A1)
      a = md5ii(a, b, c, d, x[k + 4] || 0, S41, 0xF7537E82)
      d = md5ii(d, a, b, c, x[k + 11] || 0, S42, 0xBD3AF235)
      c = md5ii(c, d, a, b, x[k + 2] || 0, S43, 0x2AD7D2BB)
      b = md5ii(b, c, d, a, x[k + 9] || 0, S44, 0xEB86D391)
      a = addUnsigned(a, AA)
      b = addUnsigned(b, BB)
      c = addUnsigned(c, CC)
      d = addUnsigned(d, DD)
    }
    
    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase()
  }
  
  const utf8Encode = (str: string): string => {
    str = str.replace(/\r\n/g, '\n')
    let utftext = ''
    
    for (let n = 0; n < str.length; n++) {
      const c = str.charCodeAt(n)
      
      if (c < 128) {
        utftext += String.fromCharCode(c)
      } else if ((c > 127) && (c < 2048)) {
        utftext += String.fromCharCode((c >> 6) | 192)
        utftext += String.fromCharCode((c & 63) | 128)
      } else {
        utftext += String.fromCharCode((c >> 12) | 224)
        utftext += String.fromCharCode(((c >> 6) & 63) | 128)
        utftext += String.fromCharCode((c & 63) | 128)
      }
    }
    
    return utftext
  }
  
  const convertToWordArray = (str: string): number[] => {
    let wordCount: number
    const messageLength = str.length
    const numberOfWords_temp1 = messageLength + 8
    const numberOfWords_temp2 = (numberOfWords_temp1 - (numberOfWords_temp1 % 64)) / 64
    const numberOfWords = (numberOfWords_temp2 + 1) * 16
    const wordArray: number[] = Array(numberOfWords - 1)
    let bytePosition = 0
    let byteCount = 0
    
    while (byteCount < messageLength) {
      wordCount = (byteCount - (byteCount % 4)) / 4
      bytePosition = (byteCount % 4) * 8
      wordArray[wordCount] = (wordArray[wordCount] || 0) | (str.charCodeAt(byteCount) << bytePosition)
      byteCount++
    }
    
    wordCount = (byteCount - (byteCount % 4)) / 4
    bytePosition = (byteCount % 4) * 8
    wordArray[wordCount] = (wordArray[wordCount] || 0) | (0x80 << bytePosition)
    wordArray[numberOfWords - 2] = messageLength << 3
    wordArray[numberOfWords - 1] = messageLength >>> 29
    
    return wordArray
  }
  
  const wordToHex = (lValue: number): string => {
    let wordToHexValue = '', wordToHexValue_temp = '', lByte, lCount
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255
      wordToHexValue_temp = '0' + lByte.toString(16)
      wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2)
    }
    return wordToHexValue
  }
  
  return calcMD5(str)
}

// Helper function to generate Gravatar URL from email
const getGravatarUrl = (email: string | null | undefined, size: number = 40): string | null => {
  if (!email) return null
  
  // Normalize email (lowercase and trim) - Gravatar requires lowercase
  const normalizedEmail = email.trim().toLowerCase()
  const hash = md5(normalizedEmail)
  
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp&r=pg`
}

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
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground mt-2">You need to be logged in to view this page.</p>
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
      Premium: 'bg-primary/10 text-primary border-primary/20',
      Member: 'bg-secondary text-secondary-foreground border-transparent',
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-primary/20 bg-card">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Account</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage your account and access your features
              </p>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const gravatarUrl = getGravatarUrl(user.email, 40)
                return gravatarUrl ? (
                  <img
                    src={gravatarUrl}
                    alt={user.name || 'User'}
                    className="h-10 w-10 rounded-full border-2 border-primary object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center bg-primary text-primary-foreground text-sm font-semibold rounded-full shadow-sm">
                    {getUserInitials(user.name, user.email)}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* AI Search Hero */}
      <div className="border-b border-primary/20 bg-card">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="text-center mb-8">
            <div className="inline-flex h-12 w-12 items-center justify-center bg-primary rounded-xl mb-4 shadow-sm">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              AI Assistant
            </h2>
            <p className="text-muted-foreground">
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
              className="h-14 w-full text-base text-foreground bg-background border border-primary/20 rounded-xl px-5 pr-14 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              disabled={isLoadingAI}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoadingAI}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center text-primary-foreground bg-primary hover:bg-primary/90 transition-all rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>

          {messages.length > 0 && (
            <div className="mt-6 bg-secondary/10 border border-secondary/20 rounded-xl p-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shadow-sm">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground leading-relaxed">
                    {messages[messages.length - 1]?.content || 'Hi! I can help you with bookings, subscriptions, or any questions about your account. What would you like to know?'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-primary/20 bg-card">
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
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-primary'
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
              <div className="bg-card border border-primary/20 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Account Information
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your profile and subscription details
                    </p>
                  </div>
                  <div className={`inline-flex items-center text-xs font-medium border rounded-full px-3 py-1 ${getTierBadge(tier)}`}>
                    {tier} Tier
                  </div>
                </div>

                <div className="flex items-center gap-4 pb-6 border-b border-primary/10">
                  {(() => {
                    const gravatarUrl = getGravatarUrl(user.email, 64)
                    return gravatarUrl ? (
                      <img
                        src={gravatarUrl}
                        alt={user.name || 'User'}
                        className="h-16 w-16 rounded-full border-2 border-primary object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center bg-primary text-primary-foreground text-xl font-semibold rounded-full shadow-sm">
                        {getUserInitials(user.name, user.email)}
                      </div>
                    )
                  })()}
                  <div>
                    <div className="font-medium text-foreground">{user.name || 'No name set'}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                    <div className="flex items-center gap-2 mt-2">
                      {userRoles.map((role) => (
                        <div
                          key={role}
                          className={`flex items-center text-xs font-medium border rounded-full px-2 py-0.5 ${
                            role === 'admin'
                              ? 'bg-destructive/10 text-destructive border-destructive/20'
                              : role === 'host'
                              ? 'bg-primary/10 text-primary border-primary/20'
                              : 'bg-secondary/10 text-secondary border-secondary/20'
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
                      <Button variant="secondary" className="w-full">
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
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-secondary/10 p-2 text-xs text-secondary">
                      <CheckCircle2 className="mt-0.5 h-4 w-4" />
                      <span>{cancelSuccess}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Available Packages */}
              <div className="bg-card border border-primary/20 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  Available Packages
                </h3>
                {loadingProducts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading packages...</span>
                  </div>
                ) : availableProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No packages available.</p>
                ) : (
                  <div className="space-y-3">
                    {availableProducts.map((product) => {
                      const isActive = activeProducts.has(product.id)
                      const canToggle = isSubscribed || product.entitlement === 'none'
                      
                      return (
                        <div
                          key={product.id}
                          className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                            isActive
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-primary/20 bg-background hover:bg-secondary/5'
                          }`}
                        >
                          <div className="flex items-start gap-4 flex-1">
                            {product.icon && (
                              <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-2xl ${
                                isActive 
                                  ? 'bg-primary/10 text-primary' 
                                  : 'bg-secondary/10 text-secondary'
                              }`}>
                                {product.icon}
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className={`text-sm font-semibold ${
                                  isActive ? 'text-primary' : 'text-foreground'
                                }`}>
                                  {product.title}
                                </h4>
                                {product.entitlement && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    product.entitlement === 'pro'
                                      ? 'bg-primary/10 text-primary border border-primary/20'
                                      : product.entitlement === 'standard'
                                      ? 'bg-secondary/10 text-secondary border border-secondary/20'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {product.entitlement}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {product.description}
                              </p>
                              {product.features && product.features.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {product.features.slice(0, 3).map((feature, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs px-2 py-0.5 rounded bg-secondary/10 text-secondary"
                                    >
                                      {feature}
                                    </span>
                                  ))}
                                  {product.features.length > 3 && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                      +{product.features.length - 3} more
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span>
                                  {product.currency} {product.price.toFixed(2)}
                                </span>
                                {product.period && (
                                  <span>
                                    / {product.periodCount} {product.period}
                                    {product.periodCount > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            {canToggle ? (
                              <Switch
                                checked={isActive}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setActiveProducts(prev => new Set(prev).add(product.id))
                                    // TODO: Handle subscription activation
                                  } else {
                                    setActiveProducts(prev => {
                                      const next = new Set(prev)
                                      next.delete(product.id)
                                      return next
                                    })
                                    // TODO: Handle subscription deactivation
                                  }
                                }}
                                disabled={!canToggle}
                              />
                            ) : (
                              <Link href="/subscribe" className="no-underline">
                                <button className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm">
                                  Subscribe
                                </button>
                              </Link>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="bg-card border border-primary/20 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-4">
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
                      label: 'FAQ',
                      href: '/faq',
                    },
                    {
                      label: 'Community',
                      href: '#',
                    },
                  ].map((link, idx) => (
                    <Link
                      key={idx}
                      href={link.href}
                      className="block text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                    >
                      {link.label} →
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-card border border-primary/20 rounded-xl shadow-sm">
            <div className="p-6 border-b border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Transaction History
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    View and manage your payment history
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`flex items-center gap-1.5 h-9 text-xs font-medium rounded-lg px-3 transition-colors ${
                      statusFilter === 'all'
                        ? 'text-primary-foreground bg-primary'
                        : 'text-foreground bg-background border border-primary/20 hover:bg-secondary/10'
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('completed')}
                    className={`h-9 text-xs font-medium rounded-lg px-3 transition-colors ${
                      statusFilter === 'completed'
                        ? 'text-primary-foreground bg-primary'
                        : 'text-foreground bg-background border border-primary/20 hover:bg-secondary/10'
                    }`}
                  >
                    Completed
                  </button>
                  <button
                    onClick={() => setStatusFilter('pending')}
                    className={`h-9 text-xs font-medium rounded-lg px-3 transition-colors ${
                      statusFilter === 'pending'
                        ? 'text-primary-foreground bg-primary'
                        : 'text-foreground bg-background border border-primary/20 hover:bg-secondary/10'
                    }`}
                  >
                    Pending
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/10 border-b border-primary/20">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">
                      Description
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">
                      <button
                        onClick={() => toggleSort('date')}
                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        Date <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">
                      <button
                        onClick={() => toggleSort('amount')}
                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        Amount <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">
                      Status
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/10">
                  {loadingTransactions ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                      </td>
                    </tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                        No transactions found.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="hover:bg-secondary/5 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-foreground">
                            {transaction.packageName || 'Subscription payment'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {transaction.category || 'Payment'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground">
                          {transaction.createdAt
                            ? new Date(transaction.createdAt).toLocaleDateString('en-GB')
                            : 'Unknown date'}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-foreground">
                          {transaction.currency || 'ZAR'} {transaction.amount?.toFixed(2) ?? '0.00'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 ${
                              transaction.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : transaction.status === 'completed'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-muted text-muted-foreground border border-primary/20'
                            }`}
                          >
                            {transaction.status || 'pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-secondary/10 rounded-lg transition-colors">
                              <Eye className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-secondary/10 rounded-lg transition-colors">
                              <Download className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-secondary/10 rounded-lg transition-colors">
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

            <div className="p-6 border-t border-primary/20 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredTransactions.length} of {transactions.length} transactions
              </p>
              <Link
                href="/subscribe"
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                View all transactions →
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading packages...</span>
              </div>
            ) : availableProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No packages available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableProducts
                  .filter((product) => product.category !== 'addon')
                  .slice(0, 4)
                  .map((product) => {
                  const isActive = activeProducts.has(product.id)
                  const canToggle = isSubscribed || product.entitlement === 'none'
                  
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between p-6 bg-card border rounded-xl transition-all shadow-sm ${
                        isActive
                          ? 'border-primary bg-primary/5'
                          : 'border-primary/20 hover:border-primary/40 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {product.icon && (
                          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                            isActive 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-secondary/10 text-secondary'
                          } text-2xl`}>
                            {product.icon}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`text-sm font-semibold ${
                              isActive ? 'text-primary' : 'text-foreground'
                            }`}>
                              {product.title}
                            </h4>
                            {product.entitlement && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                product.entitlement === 'pro'
                                  ? 'bg-primary/10 text-primary border border-primary/20'
                                  : product.entitlement === 'standard'
                                  ? 'bg-secondary/10 text-secondary border border-secondary/20'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {product.entitlement}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {product.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span>
                              {product.currency} {product.price.toFixed(2)}
                            </span>
                            {product.period && (
                              <span>
                                / {product.periodCount} {product.period}
                                {product.periodCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="ml-4">
                        {canToggle ? (
                          <Switch
                            checked={isActive}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setActiveProducts(prev => new Set(prev).add(product.id))
                                // TODO: Handle subscription activation
                              } else {
                                setActiveProducts(prev => {
                                  const next = new Set(prev)
                                  next.delete(product.id)
                                  return next
                                })
                                // TODO: Handle subscription deactivation
                              }
                            }}
                            disabled={!canToggle}
                          />
                        ) : (
                          <Link href="/subscribe" className="no-underline">
                            <button className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm">
                              Subscribe
                            </button>
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
