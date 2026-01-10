import { Where } from 'payload'
import configPromise from '@payload-config'
import React from 'react'
import { Post, User } from '@/payload-types'
import { getMeUser } from '@/utilities/getMeUser'
import PageClient from './page.client'
import SuggestedPackages from '@/components/Bookings/SuggestedPackages'
import { InsightsPanel } from '@/components/Bookings/InsightsPanel'
import { BookingsClient } from './page.client.bookings'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getPayload } from 'payload'
import { Estimate } from '@/payload-types'
// import { fetchLatestEstimate } from '@/utilities/fetchLatestEstimate'
// import { BookingsList } from './BookingsList'

const fetchLatestEstimate = async (userId: string) => {
  const payload = await getPayload({ config: configPromise });
  const estimates = await payload.find({
    collection: 'estimates',
    where: {
      customer: { equals: userId },
    },
    sort: '-createdAt',
    limit: 1,
    depth: 2,
  });
  return estimates.docs[0] || null;
};

export default async function Bookings() {
  const { user } = await getMeUser()

  if (!user) {
    redirect('/login?next=/bookings')
  }

  const [upcomingBookings, pastBookings] = await Promise.all([
    getBookings('upcoming', user),
    getBookings('past', user),
  ])

  // Helper function to extract addons from addonTransactions
  const extractAddons = (booking: any) => {
    const addons: Array<{ id: string; name: string; price: number; enabled: boolean }> = []
    
    if (booking.addonTransactions && Array.isArray(booking.addonTransactions)) {
      booking.addonTransactions.forEach((tx: any) => {
        if (typeof tx === 'object' && tx) {
          const metadata = typeof tx.metadata === 'object' && tx.metadata !== null 
            ? tx.metadata as Record<string, any> 
            : {}
          
          const addonName = tx.packageName || tx.productName || metadata.packageName || metadata.productName || tx.title || 'Addon'
          const addonPrice = tx.amount ? tx.amount / 100 : 0 // Convert cents to rands
          
          addons.push({
            id: tx.id,
            name: addonName,
            price: addonPrice,
            enabled: true, // Addons in transactions are already purchased/enabled
          })
        }
      })
    }
    
    return addons
  }

  const formattedUpcomingBookings = upcomingBookings.docs.map((booking) => {
    const duration = booking.fromDate && booking.toDate
      ? Math.max(1, Math.round((new Date(booking.toDate).getTime() - new Date(booking.fromDate).getTime()) / (1000 * 60 * 60 * 24)))
      : undefined

    const packageName = booking.selectedPackage && typeof booking.selectedPackage === 'object' && booking.selectedPackage.package
      ? (typeof booking.selectedPackage.package === 'object' && booking.selectedPackage.package?.name
        ? booking.selectedPackage.package.name
        : booking.selectedPackage.customName || 'Package')
      : booking.selectedPackage?.customName || null

    // Extract minNights from package to determine if it's hourly
    const packageMinNights = booking.selectedPackage && typeof booking.selectedPackage === 'object' && booking.selectedPackage.package
      ? (typeof booking.selectedPackage.package === 'object' && booking.selectedPackage.package?.minNights !== undefined
        ? Number(booking.selectedPackage.package.minNights)
        : null)
      : null

    const post = typeof booking.post === 'object' ? booking.post : null

    return {
      ...(post as Pick<Post, 'meta' | 'slug' | 'title'>),
      fromDate: booking.fromDate,
      toDate: booking.toDate || undefined,
      guests: booking.guests,
      id: booking.id,
      duration,
      packageName,
      packageMinNights,
      total: booking.total,
      paymentStatus: booking.paymentStatus,
      addons: extractAddons(booking),
    }
  })

  const formattedPastBookings = pastBookings.docs.map((booking) => {
    const duration = booking.fromDate && booking.toDate
      ? Math.max(1, Math.round((new Date(booking.toDate).getTime() - new Date(booking.fromDate).getTime()) / (1000 * 60 * 60 * 24)))
      : undefined

    const packageName = booking.selectedPackage && typeof booking.selectedPackage === 'object' && booking.selectedPackage.package
      ? (typeof booking.selectedPackage.package === 'object' && booking.selectedPackage.package?.name
        ? booking.selectedPackage.package.name
        : booking.selectedPackage.customName || 'Package')
      : booking.selectedPackage?.customName || null

    // Extract minNights from package to determine if it's hourly
    const packageMinNights = booking.selectedPackage && typeof booking.selectedPackage === 'object' && booking.selectedPackage.package
      ? (typeof booking.selectedPackage.package === 'object' && booking.selectedPackage.package?.minNights !== undefined
        ? Number(booking.selectedPackage.package.minNights)
        : null)
      : null

    const post = typeof booking.post === 'object' ? booking.post : null

    return {
      ...(post as Pick<Post, 'meta' | 'slug' | 'title'>),
      fromDate: booking.fromDate,
      toDate: booking.toDate || undefined,
      guests: booking.guests,
      id: booking.id,
      duration,
      packageName,
      packageMinNights,
      total: booking.total,
      paymentStatus: booking.paymentStatus,
      addons: extractAddons(booking),
    }
  })

  console.log(upcomingBookings, pastBookings)
  const latestEstimate = await fetchLatestEstimate(user.id)

  return (
    <>
      <PageClient />
      <div className="my-10 container space-y-10">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:justify-end">
          <div>
            {latestEstimate ? (
              (() => {
                const post = typeof latestEstimate.post === 'object' ? latestEstimate.post : null
                const postSlug = post?.slug
                const estimateId = latestEstimate.id
                if (postSlug) {
                  return (
                    <Link href={`/posts/${postSlug}?restoreEstimate=${estimateId}`}>
                      <Button variant="default">Restore to estimate checkpoint</Button>
                    </Link>
                  )
                }
                return (
                  <Link href={`/estimate/${estimateId}`}>
                    <Button variant="default">View your last estimate</Button>
                  </Link>
                )
              })()
            ) : (
              <Button variant="default" disabled>No estimate available</Button>
            )}
          </div>
        </div>

        <InsightsPanel userId={user.id} />

        {upcomingBookings.docs.length === 0 && pastBookings.docs.length === 0 ? (
          <div className="text-center py-10">
            <h2 className="text-4xl font-medium tracking-tighter mb-4">No bookings</h2>
            <p className="text-muted-foreground">
              You don&apos;t have any upcoming or past bookings.
            </p>
          </div>
        ) : (
          <BookingsClient
            upcomingBookings={formattedUpcomingBookings}
            pastBookings={formattedPastBookings}
          />
        )}
      </div>
    </>
  )
}

const getBookings = async (type: 'upcoming' | 'past', currentUser: User) => {
  const payload = await getPayload({ config: configPromise })

  let whereQuery: Where

  if (type === 'upcoming') {
    whereQuery = {
      and: [
        {
          fromDate: {
            greater_than_equal: new Date(),
          },
        },
        {
          or: [
            {
              customer: {
                equals: currentUser.id,
              },
            },
            {
              guests: {
                contains: currentUser.id,
              },
            },
          ],
        },
      ],
    }
  } else {
    whereQuery = {
      and: [
        {
          fromDate: {
            less_than: new Date(),
          },
        },
        {
          or: [
            {
              customer: {
                equals: currentUser.id,
              },
            },
            {
              guests: {
                contains: currentUser.id,
              },
            },
          ],
        },
      ],
    }
  }

  const bookings = await payload.find({
    collection: 'bookings',
    limit: 100,
    where: whereQuery,
    depth: 2,
    sort: '-fromDate',
    select: {
      slug: true,
      post: true,
      guests: true,
      fromDate: true,
      toDate: true,
      selectedPackage: true,
      total: true,
      paymentStatus: true,
      addonTransactions: true,
    },
  })

  return bookings
}
