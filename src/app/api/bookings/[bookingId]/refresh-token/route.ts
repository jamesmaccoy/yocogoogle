import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { getMeUser } from '@/utilities/getMeUser'
import { generateJwtToken } from '@/utilities/token'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { user } = await getMeUser()
    
    if (!user) {
      return NextResponse.json(
        {
          message: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    const { bookingId } = await params

    if (!bookingId || typeof bookingId !== 'string') {
      return NextResponse.json(
        {
          message: 'Booking ID not provided',
        },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config: configPromise })

    // Find the booking and verify ownership
    const bookings = await payload.find({
      collection: 'bookings',
      where: {
        and: [
          {
            id: {
              equals: bookingId,
            },
          },
          {
            customer: {
              equals: user.id,
            },
          },
        ],
      },
      limit: 1,
      pagination: false,
    })

    if (bookings.docs.length === 0) {
      return NextResponse.json(
        {
          message: 'Booking not found',
        },
        { status: 404 }
      )
    }

    const booking = bookings.docs[0]

    if (!booking) {
      return NextResponse.json(
        {
          message: 'Booking not found',
        },
        { status: 404 }
      )
    }

    // Generate new token
    const bookingCustomerId = typeof booking.customer === 'string' 
      ? booking.customer 
      : booking.customer?.id

    if (!bookingCustomerId) {
      return NextResponse.json(
        {
          message: 'Booking customer not found',
        },
        { status: 400 }
      )
    }

    const token = generateJwtToken({
      bookingId: booking.id,
      customerId: bookingCustomerId,
    })

    // Update booking with new token (this invalidates the old token)
    await payload.update({
      collection: 'bookings',
      id: bookingId,
      overrideAccess: true,
      data: {
        token,
      },
    })

    return NextResponse.json({
      token,
    })
  } catch (error) {
    console.error('Error refreshing token:', error)
    return NextResponse.json(
      {
        message: 'Failed to refresh token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

