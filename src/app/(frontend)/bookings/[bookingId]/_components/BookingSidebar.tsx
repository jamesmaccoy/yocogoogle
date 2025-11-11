'use client'

import { useCallback, useMemo } from 'react'
import { Booking, User } from '@/payload-types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Calendar as CalendarIcon, Clock, Lock, Package, Sparkles, Users } from 'lucide-react'
import { format } from 'date-fns'
import { formatAmountToZAR } from '@/lib/currency'
import { formatDateTime } from '@/utilities/formatDateTime'

interface PackageSnapshot {
  id: string | null
  name: string
  baseRate: number
  multiplier: number
}

interface BookingSidebarProps {
  booking: Booking
  user: User
  packageSnapshot: PackageSnapshot
  bookingDuration: number | null
  currentPackageTotal: number | null
  totalGuests: number
  onAskAssistant?: () => void
  onStartEstimate?: () => void
  onScrollToAddons?: () => void
  isSubmittingEstimate?: boolean
  hasCheckInInfo?: boolean
  history?: {
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    threadId: number
  }[]
  onClearHistory?: () => void
}

const formatStayRange = (fromDate?: string | Date | null, toDate?: string | Date | null) => {
  if (!fromDate || !toDate) {
    return null
  }

  const from = new Date(fromDate)
  const to = new Date(toDate)

  return `${format(from, 'LLL dd, yyyy')} • ${format(to, 'LLL dd, yyyy')}`
}

export function BookingSidebar({
  booking,
  user,
  packageSnapshot,
  bookingDuration,
  currentPackageTotal,
  totalGuests,
  onAskAssistant,
  onStartEstimate,
  onScrollToAddons,
  isSubmittingEstimate,
  hasCheckInInfo,
  history = [],
  onClearHistory,
}: BookingSidebarProps) {
  const property = typeof booking.post === 'object' ? booking.post : null
  const stayRange = useMemo(
    () => formatStayRange(booking?.fromDate ?? null, booking?.toDate ?? null),
    [booking?.fromDate, booking?.toDate],
  )

  const paymentStatus = booking?.paymentStatus || 'unknown'
  const propertyImage = property?.meta?.image || null
  const propertyImageUrl =
    typeof propertyImage === 'string'
      ? propertyImage
      : propertyImage && typeof propertyImage === 'object'
        ? (propertyImage as any)?.url
        : null
  const trimmedHistory = useMemo(() => history.slice(-8), [history])
  const sanitizeContent = useCallback((content: string) => {
    if (!content) return ''
    return content.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
  }, [])

  return (
    <aside className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">Property</p>
            <p className="font-medium">{property?.title || booking?.title || 'Booking'}</p>
            {propertyImageUrl && (
              <div className="mt-2 overflow-hidden rounded-md border">
                <img
                  src={propertyImageUrl}
                  alt={property?.title || 'Property preview'}
                  className="h-28 w-full object-cover"
                />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Payment status</p>
            <Badge variant="secondary" className="capitalize">
              {paymentStatus.toLowerCase()}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Booked on</p>
            <p className="font-medium">
              {booking?.createdAt ? formatDateTime(booking.createdAt) : 'Unknown'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Stay dates</p>
            <p className="flex items-center gap-2 font-medium">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {stayRange || 'Dates not set'}
            </p>
            {bookingDuration ? (
              <p className="text-xs text-muted-foreground">{bookingDuration} night stay</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Lead guest</p>
            <p className="font-medium">
              {typeof booking?.customer === 'object' ? booking.customer?.name || 'Customer' : user.name}
            </p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4" />
              {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Package</CardTitle>
          <p className="text-xs text-muted-foreground">Your selected package and totals</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Package className="h-4 w-4 text-muted-foreground" />
            {packageSnapshot?.name || 'No package selected'}
          </div>
          <div className="text-xs text-muted-foreground">
            Rate {formatAmountToZAR(packageSnapshot?.baseRate || 0)} · Multiplier{' '}
            {packageSnapshot?.multiplier?.toFixed(2)}x
          </div>
          {typeof currentPackageTotal === 'number' && currentPackageTotal > 0 ? (
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Current total</p>
              <p className="text-lg font-semibold">{formatAmountToZAR(currentPackageTotal)}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {trimmedHistory.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent AI Activity</CardTitle>
              <p className="text-xs text-muted-foreground">Latest prompts and responses</p>
            </div>
            {onClearHistory ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearHistory}>
                Clear
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="text-xs">
            <ScrollArea className="max-h-48 pr-2">
              <div className="space-y-3">
                {trimmedHistory
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="space-y-1 rounded-md border border-dashed p-2">
                      <div className="flex items-center justify-between text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                        <span>{entry.role === 'user' ? 'You' : 'Assistant'}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(entry.timestamp), 'MMM dd, HH:mm')}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-snug text-foreground">
                        {sanitizeContent(entry.content) || '…'}
                      </p>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button onClick={onAskAssistant} variant="secondary" className="justify-start gap-2">
            <Sparkles className="h-4 w-4" />
            Ask AI about this booking
          </Button>
          <Button
            onClick={onStartEstimate}
            variant="outline"
            className="justify-start gap-2"
            disabled={isSubmittingEstimate}
          >
            <CalendarIcon className="h-4 w-4" />
            {isSubmittingEstimate ? 'Preparing…' : 'Request new estimate'}
          </Button>
          <Button onClick={onScrollToAddons} variant="ghost" className="justify-start gap-2">
            <Package className="h-4 w-4" />
            Browse add-ons
          </Button>
          {hasCheckInInfo ? (
            <Button
              variant="ghost"
              className="justify-start gap-2"
              onClick={() => {
                const section = document.getElementById('booking-checkin')
                if (section) {
                  section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              }}
            >
            <Lock className="h-4 w-4" />
              Jump to check-in info
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  )
}

export default BookingSidebar

