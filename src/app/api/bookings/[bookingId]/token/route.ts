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

    // Find the booking
    const booking = await payload.findByID({
      collection: 'bookings',
      id: bookingId,
      depth: 0,
    })

    if (!booking) {
      return NextResponse.json(
        {
          message: 'Booking not found',
        },
        { status: 404 }
      )
    }

    // Check if user is authorized
    const bookingCustomerId = typeof booking.customer === 'string' 
      ? booking.customer 
      : booking.customer?.id

    if (!bookingCustomerId || bookingCustomerId !== user.id) {
      return NextResponse.json(
        {
          message: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    // If booking already has a token, return it
    if (booking.token) {
      return NextResponse.json({
        token: booking.token,
      })
    }

    // Generate new token
    const token = generateJwtToken({
      bookingId: booking.id,
      customerId: bookingCustomerId,
    })

    // Update booking with new token
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
    console.error('Error generating token:', error)
    return NextResponse.json(
      {
        message: 'Failed to generate token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

