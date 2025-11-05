import { Button } from '@/components/ui/button'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Card,
  CardFooter,
} from '@/components/ui/card'
import { getMeUser } from '@/utilities/getMeUser'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'
import configPromise from '@/payload.config'

import InviteClientPage from './page.client'
import { AlertCircleIcon, ArrowLeftIcon } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Metadata } from 'next'
import { getServerSideURL } from '@/utilities/getURL'

type SearchParams = Promise<{
  token: string
}>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { token } = await searchParams
  
  if (!token) {
    return {
      title: 'You have been invited as a guest by a customer of Simple Plek',
      description: 'Register and accept your guest invite to be permitted on the property',
    }
  }

  const tokenData = await fetchTokenData(token)
  if (!tokenData) {
    return {
      title: 'You have been invited as a guest by a customer of Simple Plek',
      description: 'Register and accept your guest invite to be permitted on the property',
    }
  }

  let details: (Awaited<ReturnType<typeof fetchBookingDetails>> | Awaited<ReturnType<typeof fetchEstimateDetails>>) = null;
  if (tokenData.type === 'booking') {
    details = await fetchBookingDetails(tokenData.id, token)
  } else if (tokenData.type === 'estimate') {
    details = await fetchEstimateDetails(tokenData.id, token)
  }
  if (!details || !details.post) {
    return {
      title: 'You have been invited as a guest by a customer of Simple Plek',
      description: 'Register and accept your guest invite to be permitted on the property',
    }
  }
  const post = typeof details.post === 'string' ? null : details.post
  const serverUrl = getServerSideURL()
  
  let postImage: string | null = null
  if (post) {
    if (
      post.meta?.image &&
      typeof post.meta.image === 'object' &&
      'url' in post.meta.image &&
      post.meta.image.url
    ) {
      const ogUrl = post.meta.image.sizes?.og?.url
      postImage = ogUrl ? serverUrl + ogUrl : serverUrl + post.meta.image.url
    } else if (
      post.heroImage &&
      typeof post.heroImage === 'object' &&
      'url' in post.heroImage &&
      post.heroImage.url
    ) {
      const ogUrl = post.heroImage.sizes?.og?.url
      postImage = ogUrl ? serverUrl + ogUrl : serverUrl + post.heroImage.url
    }
  }

  // Provide a fallback image if postImage is still null or undefined
  if (!postImage) {
    postImage = serverUrl + '/api/media/file/theshack%20lounge%20diy.jpg'
  }

  return {
    title: 'You have been invited as a guest by a customer of Simple Plek',
    description: 'Accept your guest invite',
    openGraph: {
      title: 'Guest Invite',
      description: 'Accept your guest invite',
      type: 'website',
      images: postImage ? [
        {
          url: postImage,
          width: 1200,
          height: 630,
          alt: 'Guest Invite Preview',
        },
      ] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Guest Invite',
      description: 'Accept your guest invite',
      images: postImage ? [postImage] : undefined,
    },
  }
}

export default async function GuestInvite({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams

  if (!token) {
    notFound()
  }

  const { user } = await getMeUser()

  if (!user) {
    return (
      <div className="max-w-screen-md mx-auto mt-20">
        <Card>
          <CardHeader>
            <CardTitle>You are not logged in</CardTitle>
            <CardDescription>
              Please log in or create an account to accept the invite as a guest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Button asChild variant="default">
                <Link href={`/login?next=/guest/invite?token=${token}`}>Login</Link>
              </Button>

              <Button asChild variant="secondary">
                <Link href={`/register?next=/guest/invite?token=${token}`}>Register</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tokenData = await fetchTokenData(token)

  if (!tokenData) {
    return (
      <div className="container flex min-h-[80vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircleIcon className="h-10 w-10 text-red-500" />
            </div>
            <CardTitle className="text-2xl font-bold">Invalid Token</CardTitle>
            <CardDescription className="text-base">
              The token you provided is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>This could happen for several reasons:</p>
              <ul className="list-inside list-disc space-y-1 pl-4">
                <li>The token has expired</li>
                <li>The token was already used</li>
                <li>The token was incorrectly copied</li>
                <li>The token was generated for a different purpose</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-3 pt-2">
            <Button asChild variant="outline" className="w-full">
              <Link href="/">
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Return Home
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  let details: (Awaited<ReturnType<typeof fetchBookingDetails>> | Awaited<ReturnType<typeof fetchEstimateDetails>>) = null;
  if (tokenData.type === 'booking') {
    details = await fetchBookingDetails(tokenData.id, token)
  } else if (tokenData.type === 'estimate') {
    details = await fetchEstimateDetails(tokenData.id, token)
  }

  if (!details) {
    notFound()
  }

  return (
    <div className="mx-4">
      <InviteClientPage
        booking={tokenData.type === 'booking' ? details : undefined}
        estimate={tokenData.type === 'estimate' ? details : undefined}
        tokenPayload={tokenData}
        token={token}
      />
    </div>
  )
}

const fetchTokenData = async (token: string) => {
  const payload = await getPayload({ config: configPromise })
  
  // Try bookings first
  try {
    const response = await payload.find({
      collection: 'bookings',
      where: {
        token: {
          equals: token,
        },
      },
      limit: 1,
    })

    if (response.docs.length > 0) {
      const booking = response.docs[0]
      const customerId = typeof booking.customer === 'string' ? booking.customer : booking.customer?.id
      if (!customerId) return null
      return {
        type: 'booking',
        id: booking.id,
        customerId,
      }
    }
  } catch (error) {
    // continue to try estimate
  }

  // Try estimates
  try {
    const response = await payload.find({
      collection: 'estimates',
      where: {
        token: {
          equals: token,
        },
      },
      limit: 1,
    })
    if (response.docs.length > 0) {
      const estimate = response.docs[0]
      const customerId = typeof estimate.customer === 'string' ? estimate.customer : estimate.customer?.id
      if (!customerId) return null
      return {
        type: 'estimate',
        id: estimate.id,
        customerId,
      }
    }
  } catch (error) {
    // fall through
  }
  return null
}

const fetchBookingDetails = async (bookingId: string, token: string) => {
  const payload = await getPayload({ config: configPromise })

  const booking = await payload.find({
    collection: 'bookings',
    where: {
      and: [
        {
          id: {
            equals: bookingId,
          },
        },
        {
          token: {
            equals: token,
          },
        },
      ],
    },
    select: {
      post: true,
      customer: true,
      fromDate: true,
      toDate: true,
      createdAt: true,
    },
    limit: 1,
    depth: 1,
  })

  if (booking.docs.length === 0) {
    return null
  }

  return booking.docs[0]
}

const fetchEstimateDetails = async (estimateId: string, token: string) => {
  const payload = await getPayload({ config: configPromise })

  const estimate = await payload.find({
    collection: 'estimates',
    where: {
      and: [
        {
          id: {
            equals: estimateId,
          },
        },
        {
          token: {
            equals: token,
          },
        },
      ],
    },
    select: {
      post: true,
      customer: true,
      fromDate: true,
      toDate: true,
      createdAt: true,
    },
    limit: 1,
    depth: 1,
  })

  if (estimate.docs.length === 0) {
    return null
  }

  return estimate.docs[0]
}
