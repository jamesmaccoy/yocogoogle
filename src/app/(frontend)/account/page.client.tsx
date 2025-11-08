'use client'

import React, { useEffect, useState } from 'react'
import { User } from '@/payload-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Settings, User as UserIcon, Crown, Calendar, FileText, Edit3, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { EditPostsLink } from '@/components/EditPostsLink'
import Link from 'next/link'

type YocoTransaction = {
  id: string
  packageName?: string
  status?: string
  amount?: number
  currency?: string
  createdAt?: string
  expiresAt?: string
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

  useEffect(() => {
    const loadTransactions = async () => {
      if (!user) return
      setLoadingTransactions(true)
      try {
        const response = await fetch('/api/yoco/transactions?limit=5', { credentials: 'include' })
        if (!response.ok) return
        const data = await response.json()
        setTransactions(data.transactions || [])
        const current = (data.transactions || []).find((tx: YocoTransaction) => {
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Account</h1>
        <p className="text-gray-600 mt-2">Manage your account and access your features</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>
                Common tasks and features you can access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(isHost || isAdmin) && (
                  <>
                    <Link href="/plek/adminPage">
                      <Button variant="outline" className="w-full h-16 flex flex-col gap-2">
                        <FileText className="h-5 w-5" />
                        <span>Manage Pleks</span>
                      </Button>
                    </Link>
                    <Link href="/bookings">
                      <Button variant="outline" className="w-full h-16 flex flex-col gap-2">
                        <Calendar className="h-5 w-5" />
                        <span>View Bookings</span>
                      </Button>
                    </Link>
                  </>
                )}
                
                {/* Edit Posts button using the new component */}
                <EditPostsLink className="block">
                  <Button variant="outline" className="w-full h-16 flex flex-col gap-2">
                    <Edit3 className="h-5 w-5" />
                    <span>Edit Posts</span>
                  </Button>
                </EditPostsLink>
                
                <Link href="/posts">
                  <Button variant="outline" className="w-full h-16 flex flex-col gap-2">
                    <Calendar className="h-5 w-5" />
                    <span>Browse Properties</span>
                  </Button>
                </Link>
                {isSubscribed && (
                  <Link href="/plek">
                    <Button variant="outline" className="w-full h-16 flex flex-col gap-2">
                      <FileText className="h-5 w-5" />
                      <span>Book a Plek</span>
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity / Features */}
          <Card>
            <CardHeader>
              <CardTitle>Available Features</CardTitle>
              <CardDescription>
                Features you can access based on your current role and subscription
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Booking Estimates</div>
                    <div className="text-sm text-gray-600">Get pricing estimates for stays</div>
                  </div>
                  <Badge variant="secondary">Available</Badge>
                </div>
                
                {isSubscribed && (
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Plek Booking</div>
                      <div className="text-sm text-gray-600">Book stays at available pleks</div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                )}

                {/* Edit Posts feature availability */}
                {(isCustomer || isAdmin) && isSubscribed && (
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Edit Posts/Pleks</div>
                      <div className="text-sm text-gray-600">Create and edit property listings and content</div>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">Premium</Badge>
                  </div>
                )}

                {(isHost || isAdmin) && (
                  <>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">Create Blog Posts</div>
                        <div className="text-sm text-gray-600">Write and publish blog content</div>
                      </div>
                      <Badge className="bg-purple-100 text-purple-800">Host</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">Manage Pleks</div>
                        <div className="text-sm text-gray-600">Create and manage property listings</div>
                      </div>
                      <Badge className="bg-purple-100 text-purple-800">Host</Badge>
                    </div>
                  </>
                )}

                {!isSubscribed && (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                    <div>
                      <div className="font-medium text-gray-500">Book or host a plek</div>
                      <div className="text-sm text-gray-400">Subscribe to unlock calendar</div>
                    </div>
                    <Link href="/subscribe">
                      <Button size="sm">Join the waitlist</Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Yoco Payments</CardTitle>
              <CardDescription>Manual reference for your subscription access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingTransactions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading payment history...
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Yoco transactions recorded yet.</p>
              ) : (
                transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{transaction.packageName || 'Subscription payment'}</p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.createdAt ? new Date(transaction.createdAt).toLocaleDateString() : 'Unknown date'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-foreground">
                        {transaction.currency || 'ZAR'} {transaction.amount?.toFixed(2) ?? '0.00'}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">{transaction.status || 'pending'}</p>
                    </div>
                  </div>
                ))
              )}
              <Link href="/subscribe">
                <Button variant="outline" className="w-full">View full history</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* User Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Account Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="font-medium">{user.name || 'No name set'}</div>
                <div className="text-sm text-gray-600">{user.email}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Roles</div>
                <div className="flex flex-wrap gap-2">
                  {userRoles.map((role) => (
                    <Badge 
                      key={role} 
                      variant={role === 'admin' ? 'destructive' : role === 'host' ? 'default' : 'secondary'}
                      className={role === 'host' ? 'bg-purple-100 text-purple-800' : ''}
                    >
                      {role === 'admin' && <Crown className="h-3 w-3 mr-1" />}
                      {role === 'host' && <Crown className="h-3 w-3 mr-1" />}
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Badge>
                  ))}
                </div>
              </div>

              {!isLoading && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Subscription</div>
                  <Badge variant={isSubscribed ? 'default' : 'secondary'}>
                    {isSubscribed ? 'Active' : 'None'}
                  </Badge>
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* Help & Support */}
          <Card>
            <CardHeader>
              <CardTitle>Help & Support</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <p className="font-medium">Need assistance?</p>
                <p className="text-gray-600 mt-1">
                  Contact our support team for help with your account or booking questions.
                </p>
              </div>
              <Button variant="outline" size="sm" className="w-full">
                Contact Support
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 