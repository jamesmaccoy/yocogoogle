'use client'

import { Button } from '@/components/ui/button'
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Card,
} from '@/components/ui/card'
import { formatDateTime } from '@/utilities/formatDateTime'

import { CheckIcon, CircleAlert, Loader2Icon } from 'lucide-react'
import Link from 'next/link'
import { notFound, useRouter } from 'next/navigation'
import React from 'react'

type Props = {
  booking?: Pick<import('@/payload-types').Booking, 'post' | 'fromDate' | 'createdAt' | 'customer'>
  estimate?: Pick<import('@/payload-types').Estimate, 'post' | 'fromDate' | 'createdAt' | 'customer'>
  tokenPayload: Record<string, string>
  token: string
}

export default function InviteClientPage({ booking, estimate, tokenPayload, token }: Props) {
  const isBooking = !!booking
  const isEstimate = !!estimate
  const data = booking || estimate

  if (
    !data ||
    typeof data.post === 'string' ||
    typeof data.customer === 'string' ||
    (!('id' in tokenPayload))
  ) {
    notFound()
  }

  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleInviteAccept = async () => {
    try {
      setIsLoading(true)
      let res
      if (isBooking) {
        res = await fetch(`/api/bookings/${tokenPayload.id}/accept-invite/${token}`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      } else if (isEstimate) {
        res = await fetch(`/api/estimates/${tokenPayload.id}/accept-invite/${token}`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Unknown error')
        return
      }
      if (isBooking) {
        router.push(`/bookings/${tokenPayload.id}`)
      } else if (isEstimate) {
        router.push(`/estimate/${tokenPayload.id}`)
      }
    } catch (err) {
      setError('Error accepting invite')
    } finally {
      setIsLoading(false)
    }
  }

  if (error) {
    return (
      <div className="border-2 flex items-center gap-6 mt-10 flex-col border-red-500 bg-red-100 max-w-[450px] w-full mx-auto p-6 rounded-xl ">
        <div>
          <CircleAlert className="size-8" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-medium tracking-tight">Something went wrong</h2>
          <p className="tracking-wide ">{error}</p>
        </div>
        <Button asChild variant="default" className="w-full">
          <Link href={'/'}>Return Home</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-screen-md my-10">
      <Card>
        <CardHeader>
          <CardTitle>
            Join <strong>{data.post.title}</strong> as a guest
          </CardTitle>
          <CardDescription>
            You have been invited by <strong>{data.customer?.name}</strong> to join them on this {isBooking ? 'booking' : 'estimate'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-10">
            <p className="text-lg font-medium">Date {isBooking ? 'Booked' : 'Estimated'}: {formatDateTime(data.createdAt)}</p>
            <p className="text-lg font-medium">Arrival Date: {formatDateTime(data.fromDate)}</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleInviteAccept} disabled={isLoading}>
            {!isLoading ? (
              <>
                <CheckIcon className="size-4 mr-2" />
                Accept Invitation
              </>
            ) : (
              <>
                <Loader2Icon className="animate-spin mr-2" />
                <span>Accepting...</span>
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
