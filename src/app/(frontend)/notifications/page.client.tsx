'use client'

import { useState, useEffect } from 'react'
import { Notification, User } from '@/payload-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { 
  Calendar, 
  Package, 
  CreditCard, 
  FileText, 
  RefreshCw, 
  X, 
  CheckCircle2,
  Bell,
  BellOff,
  ExternalLink,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/utilities/cn'

type Props = {
  initialNotifications: Notification[]
  user: User
}

const typeIcons: Record<string, React.ReactNode> = {
  booking_created: <Calendar className="h-5 w-5" />,
  booking_updated: <RefreshCw className="h-5 w-5" />,
  booking_cancelled: <X className="h-5 w-5" />,
  booking_rescheduled: <RefreshCw className="h-5 w-5" />,
  addon_purchased: <Package className="h-5 w-5" />,
  payment_received: <CreditCard className="h-5 w-5" />,
  estimate_created: <FileText className="h-5 w-5" />,
  estimate_confirmed: <CheckCircle2 className="h-5 w-5" />,
  subscription_renewed: <RefreshCw className="h-5 w-5" />,
  subscription_cancelled: <X className="h-5 w-5" />,
}

const typeColors: Record<string, string> = {
  booking_created: 'bg-green-100 text-green-800 border-green-200',
  booking_updated: 'bg-blue-100 text-blue-800 border-blue-200',
  booking_cancelled: 'bg-red-100 text-red-800 border-red-200',
  booking_rescheduled: 'bg-purple-100 text-purple-800 border-purple-200',
  addon_purchased: 'bg-orange-100 text-orange-800 border-orange-200',
  payment_received: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  estimate_created: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  estimate_confirmed: 'bg-teal-100 text-teal-800 border-teal-200',
  subscription_renewed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  subscription_cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
}

export default function NotificationsClient({ initialNotifications, user }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set())
  const [versionHistory, setVersionHistory] = useState<Record<string, any[]>>({})
  const [loadingVersions, setLoadingVersions] = useState<Set<string>>(new Set())
  const router = useRouter()

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/notifications?limit=100&unreadOnly=${filter === 'unread'}`)
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, read: true }),
      })

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        )
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await Promise.all(
        notifications
          .filter((n) => !n.read)
          .map((n) =>
            fetch('/api/notifications', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ notificationId: n.id, read: true }),
            })
          )
      )
      fetchNotifications()
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [filter])

  const unreadCount = notifications.filter((n) => !n.read).length
  const filteredNotifications = filter === 'unread' 
    ? notifications.filter((n) => !n.read)
    : notifications

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)
    if (notification.actionUrl) {
      router.push(notification.actionUrl)
    }
  }

  const toggleVersionHistory = async (notification: Notification) => {
    const notificationId = notification.id
    const isExpanded = expandedNotifications.has(notificationId)
    
    if (isExpanded) {
      // Collapse
      setExpandedNotifications((prev) => {
        const next = new Set(prev)
        next.delete(notificationId)
        return next
      })
    } else {
      // Expand and load version history
      setExpandedNotifications((prev) => new Set(prev).add(notificationId))
      
      // Load version history if not already loaded
      if (!versionHistory[notificationId]) {
        setLoadingVersions((prev) => new Set(prev).add(notificationId))
        
        try {
          let versions: any[] = []
          
          if (notification.relatedBooking) {
            const bookingId = typeof notification.relatedBooking === 'string' 
              ? notification.relatedBooking 
              : notification.relatedBooking.id
            
            const response = await fetch(`/api/bookings/${bookingId}/versions`)
            if (response.ok) {
              const data = await response.json()
              versions = data.versions || []
            }
          } else if (notification.relatedTransaction || notification.id) {
            // For merged collection, use the notification's own ID for version history
            const transactionId = notification.relatedTransaction
              ? (typeof notification.relatedTransaction === 'string'
                  ? notification.relatedTransaction
                  : notification.relatedTransaction.id)
              : notification.id
            
            const response = await fetch(`/api/transactions/${transactionId}/versions`)
            if (response.ok) {
              const data = await response.json()
              versions = data.versions || []
            }
          }
          
          setVersionHistory((prev) => ({
            ...prev,
            [notificationId]: versions,
          }))
        } catch (error) {
          console.error('Error loading version history:', error)
        } finally {
          setLoadingVersions((prev) => {
            const next = new Set(prev)
            next.delete(notificationId)
            return next
          })
        }
      }
    }
  }

  return (
    <div className="container py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Stay updated on your bookings, payments, and transactions
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline" size="sm">
            Mark all as read
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </Button>
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BellOff className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredNotifications.map((notification) => {
            const metadata = notification.metadata as any
            const typeLabel = notification.type
              .split('_')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ')

            return (
              <Card
                key={notification.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  !notification.read && 'border-l-4 border-l-primary bg-muted/30'
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div
                        className={cn(
                          'p-2 rounded-lg border',
                          typeColors[notification.type] || 'bg-gray-100 text-gray-800 border-gray-200'
                        )}
                      >
                        {typeIcons[notification.type] || <Bell className="h-5 w-5" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{notification.title}</CardTitle>
                          {!notification.read && (
                            <Badge variant="default" className="text-xs">
                              New
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-sm">
                          {notification.description}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(notification.createdAt), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                </CardHeader>
                {metadata && (
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm">
                      {metadata.propertyTitle && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Property:</span>
                          <span className="font-medium">{metadata.propertyTitle}</span>
                        </div>
                      )}
                      {metadata.fromDate && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Dates:</span>
                          <span className="font-medium">
                            {format(new Date(metadata.fromDate), 'MMM d, yyyy')}
                            {metadata.toDate && ` - ${format(new Date(metadata.toDate), 'MMM d, yyyy')}`}
                          </span>
                        </div>
                      )}
                      {metadata.changes && Object.keys(metadata.changes).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="text-xs font-semibold text-muted-foreground mb-2">Changes:</div>
                          <div className="space-y-1 text-xs">
                            {metadata.changes.fromDate && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Check-in:</span>
                                <span className="line-through text-muted-foreground">
                                  {format(new Date(metadata.changes.fromDate.from), 'MMM d, yyyy')}
                                </span>
                                <span className="text-primary">→</span>
                                <span className="font-medium">
                                  {format(new Date(metadata.changes.fromDate.to), 'MMM d, yyyy')}
                                </span>
                              </div>
                            )}
                            {metadata.changes.toDate && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Check-out:</span>
                                <span className="line-through text-muted-foreground">
                                  {format(new Date(metadata.changes.toDate.from), 'MMM d, yyyy')}
                                </span>
                                <span className="text-primary">→</span>
                                <span className="font-medium">
                                  {format(new Date(metadata.changes.toDate.to), 'MMM d, yyyy')}
                                </span>
                              </div>
                            )}
                            {metadata.changes.paymentStatus && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Payment:</span>
                                <span className="line-through text-muted-foreground">
                                  {metadata.changes.paymentStatus.from}
                                </span>
                                <span className="text-primary">→</span>
                                <span className="font-medium">
                                  {metadata.changes.paymentStatus.to}
                                </span>
                              </div>
                            )}
                            {metadata.changes.total && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Total:</span>
                                <span className="line-through text-muted-foreground">
                                  R{metadata.changes.total.from?.toLocaleString() || '0'}
                                </span>
                                <span className="text-primary">→</span>
                                <span className="font-medium">
                                  R{metadata.changes.total.to?.toLocaleString() || '0'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {metadata.packageName && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Package:</span>
                          <span className="font-medium">{metadata.packageName}</span>
                        </div>
                      )}
                      {metadata.amount && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-medium">R{metadata.amount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    {notification.actionUrl && (
                      <div className="mt-4 pt-4 border-t">
                        <Link
                          href={notification.actionUrl}
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View details <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                    
                    {/* Version History Toggle */}
                    {(notification.relatedBooking || notification.relatedTransaction) && (
                      <div className="mt-4 pt-4 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-between text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleVersionHistory(notification)
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <History className="h-3 w-3" />
                            View version history
                          </span>
                          {expandedNotifications.has(notification.id) ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
                
                {/* Version History Timeline */}
                {expandedNotifications.has(notification.id) && (
                  <CardContent className="pt-0 border-t bg-muted/30">
                    {loadingVersions.has(notification.id) ? (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        Loading version history...
                      </div>
                    ) : versionHistory[notification.id]?.length > 0 ? (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Version History
                        </div>
                        <div className="relative">
                          {/* Timeline line */}
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                          
                          {versionHistory[notification.id].map((version, index) => {
                            const isLatest = index === 0
                            const prevVersion = index < versionHistory[notification.id].length - 1 
                              ? versionHistory[notification.id][index + 1] 
                              : null
                            
                            // Access doc property (matching Payload's version structure)
                            const versionDoc = version.doc || version.data || {}
                            
                            return (
                              <div key={version.id} className="relative pl-10 pb-4">
                                {/* Timeline dot */}
                                <div className={cn(
                                  "absolute left-3 top-1 w-2 h-2 rounded-full border-2",
                                  isLatest 
                                    ? "bg-primary border-primary" 
                                    : "bg-muted border-border"
                                )} />
                                
                                {/* Version content */}
                                <div className="text-xs">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium">
                                      Version {version.version}
                                      {isLatest && <Badge variant="outline" className="ml-2 text-xs">Current</Badge>}
                                      {version.autosave && <Badge variant="outline" className="ml-2 text-xs">Autosave</Badge>}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {format(new Date(version.createdAt), 'MMM d, yyyy h:mm a')}
                                    </span>
                                  </div>
                                  
                                  {/* Show full version data */}
                                  {versionDoc && Object.keys(versionDoc).length > 0 && (
                                    <div className="mt-2 space-y-1 text-xs bg-background p-2 rounded border">
                                      {/* Show current values from version.doc */}
                                      {versionDoc.fromDate && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-muted-foreground">Check-in:</span>
                                          <span className="font-medium">
                                            {format(new Date(versionDoc.fromDate), 'MMM d, yyyy')}
                                          </span>
                                        </div>
                                      )}
                                      {versionDoc.toDate && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-muted-foreground">Check-out:</span>
                                          <span className="font-medium">
                                            {format(new Date(versionDoc.toDate), 'MMM d, yyyy')}
                                          </span>
                                        </div>
                                      )}
                                      {versionDoc.paymentStatus && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-muted-foreground">Status:</span>
                                          <Badge 
                                            variant={versionDoc.paymentStatus === 'paid' ? 'default' : versionDoc.paymentStatus === 'cancelled' ? 'destructive' : 'outline'}
                                            className="text-xs"
                                          >
                                            {versionDoc.paymentStatus}
                                          </Badge>
                                        </div>
                                      )}
                                      {versionDoc.total && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-muted-foreground">Total:</span>
                                          <span className="font-medium">
                                            R{versionDoc.total.toLocaleString()}
                                          </span>
                                        </div>
                                      )}
                                      
                                      {/* Show changes from previous version if available */}
                                      {prevVersion && (prevVersion.doc || prevVersion.data) && (
                                        <div className="mt-2 pt-2 border-t border-border">
                                          <div className="text-xs font-semibold text-muted-foreground mb-1">Changes from previous:</div>
                                          {(() => {
                                            const prevDoc = prevVersion.doc || prevVersion.data || {}
                                            const changes: React.ReactNode[] = []
                                            
                                            if (versionDoc.fromDate !== prevDoc.fromDate) {
                                              changes.push(
                                                <div key="fromDate" className="flex items-center gap-2">
                                                  <span className="text-muted-foreground">Check-in:</span>
                                                  <span className="line-through text-muted-foreground text-xs">
                                                    {prevDoc.fromDate 
                                                      ? format(new Date(prevDoc.fromDate), 'MMM d, yyyy')
                                                      : 'N/A'}
                                                  </span>
                                                  <span className="text-primary">→</span>
                                                  <span className="font-medium text-xs">
                                                    {versionDoc.fromDate 
                                                      ? format(new Date(versionDoc.fromDate), 'MMM d, yyyy')
                                                      : 'N/A'}
                                                  </span>
                                                </div>
                                              )
                                            }
                                            if (versionDoc.toDate !== prevDoc.toDate) {
                                              changes.push(
                                                <div key="toDate" className="flex items-center gap-2">
                                                  <span className="text-muted-foreground">Check-out:</span>
                                                  <span className="line-through text-muted-foreground text-xs">
                                                    {prevDoc.toDate 
                                                      ? format(new Date(prevDoc.toDate), 'MMM d, yyyy')
                                                      : 'N/A'}
                                                  </span>
                                                  <span className="text-primary">→</span>
                                                  <span className="font-medium text-xs">
                                                    {versionDoc.toDate 
                                                      ? format(new Date(versionDoc.toDate), 'MMM d, yyyy')
                                                      : 'N/A'}
                                                  </span>
                                                </div>
                                              )
                                            }
                                            if (versionDoc.paymentStatus !== prevDoc.paymentStatus) {
                                              changes.push(
                                                <div key="paymentStatus" className="flex items-center gap-2">
                                                  <span className="text-muted-foreground">Status:</span>
                                                  <span className="line-through text-muted-foreground text-xs">
                                                    {prevDoc.paymentStatus || 'N/A'}
                                                  </span>
                                                  <span className="text-primary">→</span>
                                                  <span className="font-medium text-xs">
                                                    {versionDoc.paymentStatus || 'N/A'}
                                                  </span>
                                                </div>
                                              )
                                            }
                                            if (versionDoc.total !== prevDoc.total) {
                                              changes.push(
                                                <div key="total" className="flex items-center gap-2">
                                                  <span className="text-muted-foreground">Total:</span>
                                                  <span className="line-through text-muted-foreground text-xs">
                                                    R{prevDoc.total?.toLocaleString() || '0'}
                                                  </span>
                                                  <span className="text-primary">→</span>
                                                  <span className="font-medium text-xs">
                                                    R{versionDoc.total?.toLocaleString() || '0'}
                                                  </span>
                                                </div>
                                              )
                                            }
                                            
                                            return changes.length > 0 ? changes : (
                                              <div className="text-muted-foreground text-xs">No changes detected</div>
                                            )
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        No version history available
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

