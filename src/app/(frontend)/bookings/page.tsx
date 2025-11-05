import { Where } from 'payload'
import configPromise from '@payload-config'
import React from 'react'
import { Post, User } from '@/payload-types'
import { getMeUser } from '@/utilities/getMeUser'
import PageClient from './page.client'
import BookingCard from '@/components/Bookings/BookingCard'
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

  const formattedUpcomingBookings = upcomingBookings.docs.map((booking) => ({
    ...(booking.post as Pick<Post, 'meta' | 'slug' | 'title'>),
    fromDate: booking.fromDate,
    toDate: booking.toDate,
    guests: booking.guests,
    id: booking.id,
  }))

  const formattedPastBookings = pastBookings.docs.map((booking) => ({
    ...(booking.post as Pick<Post, 'meta' | 'slug' | 'title'>),
    fromDate: booking.fromDate,
    toDate: booking.toDate,
    guests: booking.guests,
    id: booking.id,
  }))

  console.log(upcomingBookings, pastBookings)
  const latestEstimate = await fetchLatestEstimate(user.id)

  return (
    <>
      <PageClient />
      <div className="my-10 container space-y-10">
        <div className="flex justify-end mb-6">
          {latestEstimate ? (
            <Link href={`/estimate/${latestEstimate.id}`}>
              <Button variant="default">View your last estimate</Button>
            </Link>
          ) : (
            <Button variant="default" disabled>No estimate available</Button>
          )}
        </div>

        {upcomingBookings.docs.length === 0 && pastBookings.docs.length === 0 ? (
          <div className="text-center py-10">
            <h2 className="text-4xl font-medium tracking-tighter mb-4">No bookings</h2>
            <p className="text-muted-foreground">
              You don&apos;t have any upcoming or past bookings.
            </p>
          </div>
        ) : (
          <>
            <div>
              {upcomingBookings.docs.length > 0 && (
                <h2 className="text-4xl font-medium tracking-tighter my-6">Upcoming stays</h2>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                {formattedUpcomingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            </div>

            {pastBookings.docs.length > 0 && (
              <h2 className="text-4xl font-medium tracking-tighter my-6">Past stays</h2>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
              {formattedPastBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          </>
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
          customer: {
            equals: currentUser.id,
          },
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
          customer: {
            equals: currentUser.id,
          },
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
    },
  })

  return bookings
}
