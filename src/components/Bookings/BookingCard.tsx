import { type Media as MediaType, User } from '@/payload-types'
import { formatDate } from 'date-fns'
import { CalendarIcon, UsersIcon } from 'lucide-react'
import Link from 'next/link'
import React, { FC } from 'react'
import { Media } from '../Media'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type Props = {
  booking: {
    fromDate: string
    toDate: string
    guests: (string | User)[] | null | undefined
    id: string
    slug?: string | null | undefined
    title: string
    meta?:
      | {
          title?: string | null | undefined
          image?: string | MediaType | null | undefined
        }
      | undefined
  }
}

const BookingCard: FC<Props> = ({ booking }) => {
  return (
    <Link key={booking.id} href={`/bookings/${booking.id}`}>
      <Card className="h-full hover:shadow-md transition-shadow">
        <div className="relative flex gap-3 p-2">
          <div className="relative w-24 h-24 flex-shrink-0">
            {!booking.meta?.image && <div className="w-full h-full bg-muted flex items-center justify-center rounded-md">No Image</div>}
            {booking.meta?.image && typeof booking.meta?.image !== 'string' && (
              <>
                <Media resource={booking.meta.image} size="25vw" className="w-full h-full object-cover rounded-md" />
                {booking.guests && booking.guests?.length > 0 && (
                  <div className="absolute bottom-1 right-1 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1">
                    <UsersIcon className="size-4" />
                    <span className="text-sm font-medium">{booking.guests?.length}</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl mb-1">{booking.title}</CardTitle>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarIcon className="size-4" />
                <div className="text-sm">
                  {formatDate(new Date(booking.fromDate), 'PPP')} -{' '}
                  {formatDate(new Date(booking.toDate), 'PPP')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

export default BookingCard
