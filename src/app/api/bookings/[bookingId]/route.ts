import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { getMeUser } from '@/utilities/getMeUser'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { user } = await getMeUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { bookingId } = await params
    const body = await request.json()
    const { fromDate, toDate } = body

    if (!fromDate) {
      return NextResponse.json({ error: 'fromDate is required' }, { status: 400 })
    }

    const payload = await getPayload({ config: configPromise })

    // Find the booking
    const booking = await payload.findByID({
      collection: 'bookings',
      id: bookingId,
      depth: 0,
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Check if user is authorized (admin or booking owner)
    const isAdmin = Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin'
    const bookingCustomerId = typeof booking.customer === 'string' ? booking.customer : booking.customer?.id
    const isOwner = bookingCustomerId === user.id

    // Also check if user is a guest
    const isGuest = booking.guests?.some(
      (guest) => (typeof guest === 'string' ? guest : guest?.id) === user.id
    )

    if (!isAdmin && !isOwner && !isGuest) {
      return NextResponse.json({ error: 'Not authorized to update this booking' }, { status: 403 })
    }

    // Validate date range if both dates are provided
    if (toDate && fromDate >= toDate) {
      return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
    }

    // Update the booking with new dates
    const updateData: { fromDate: string; toDate?: string | null } = {
      fromDate: fromDate,
    }

    if (toDate !== undefined) {
      updateData.toDate = toDate || null
    }

    const updatedBooking = await payload.update({
      collection: 'bookings',
      id: bookingId,
      data: updateData,
    })

    return NextResponse.json({ booking: updatedBooking })
  } catch (error) {
    console.error('Error updating booking dates:', error)
    return NextResponse.json(
      { error: 'Failed to update booking dates', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

