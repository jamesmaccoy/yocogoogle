'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Calendar as CalendarIcon, Clock, Users, MapPin } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { format } from 'date-fns'
import { Media } from '@/components/Media'

interface BookingInfoCardProps {
  postImage?: any
  guests?: Array<any>
  createdAt?: string | Date | null
  variant?: 'booking' | 'default'
  postUrl?: string
  onEstimateRequest?: (dates: { from: Date; to: Date }) => Promise<void> | void
  isSubmittingEstimate?: boolean
  estimateError?: string | null
  postId?: string
  postTitle?: string
  baseRate?: number
}

export const BookingInfoCard: React.FC<BookingInfoCardProps> = ({
  postImage,
  guests = [],
  createdAt,
  variant = 'default',
  postUrl,
  onEstimateRequest,
  isSubmittingEstimate = false,
  estimateError,
  postTitle,
  baseRate,
}) => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  const guestCount = useMemo(() => {
    if (!Array.isArray(guests)) return 0
    return guests.length
  }, [guests])

  const createdDisplay = useMemo(() => {
    if (!createdAt) return 'Unknown'
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return format(date, 'PPP')
  }, [createdAt])

  const canSubmit = !!dateRange?.from && !!dateRange?.to && !!onEstimateRequest && !isSubmittingEstimate

  const handleSubmit = async () => {
    if (!canSubmit || !dateRange?.from || !dateRange?.to || !onEstimateRequest) return
    await onEstimateRequest({ from: dateRange.from, to: dateRange.to })
    setIsCalendarOpen(false)
  }

  const selectedLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, 'MMM dd, yyyy')} → ${format(dateRange.to, 'MMM dd, yyyy')}`
    : 'Select dates for a new estimate'

  return (
    <Card className="overflow-hidden border-2">
      <CardHeader className="space-y-4 bg-muted/40">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Booking Summary</CardTitle>
            {postTitle ? <CardDescription>{postTitle}</CardDescription> : null}
          </div>
          {postUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={postUrl} target="_blank" rel="noopener noreferrer">
                View Listing
              </a>
            </Button>
          ) : null}
        </div>
        {postImage ? (
          <div className="overflow-hidden rounded-md border">
            <Media resource={postImage} className="h-40 w-full object-cover" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 text-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium">Guests</div>
              <div className="text-muted-foreground">{guestCount} {guestCount === 1 ? 'guest' : 'guests'} invited</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium">Created</div>
              <div className="text-muted-foreground">{createdDisplay}</div>
            </div>
          </div>
          {baseRate ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">Base rate</div>
                <div className="text-muted-foreground">R{baseRate.toFixed(2)}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Request a new estimate</div>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="lg" className="justify-start gap-2 text-left font-normal">
                <CalendarIcon className="h-4 w-4" />
                {selectedLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
            {isSubmittingEstimate ? 'Preparing estimate…' : 'Create New Estimate'}
          </Button>
          {estimateError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {estimateError}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default BookingInfoCard
