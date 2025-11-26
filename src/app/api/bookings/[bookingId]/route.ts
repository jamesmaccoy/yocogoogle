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
    let body: any = {}
    
    try {
      const contentType = request.headers.get('content-type') || ''
      console.log('PATCH booking Content-Type:', contentType)
      
      if (contentType.includes('application/json')) {
        // Handle JSON requests
        try {
          body = await request.json()
          console.log('Parsed JSON body:', body)
        } catch (jsonError) {
          console.error('JSON parse error:', jsonError)
          return NextResponse.json(
            { error: 'Invalid JSON in request body', details: jsonError instanceof Error ? jsonError.message : 'Unknown parse error' },
            { status: 400 }
          )
        }
      } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
        // Handle form data requests (Payload admin interface uses this)
        try {
          const formData = await request.formData()
          body = {} as any
          
          // Convert FormData to regular object
          for (const [key, value] of formData.entries()) {
            // Handle _payload field (Payload admin sends JSON string here)
            if (key === '_payload') {
              try {
                const payloadData = JSON.parse(value as string)
                body = { ...body, ...payloadData }
              } catch (parseError) {
                console.error('Failed to parse _payload JSON:', parseError)
                // Fall back to treating as regular field
                body[key] = value
              }
            } else if (key.includes('[') && key.includes(']')) {
              // Handle nested form fields like "meta[title]"
              const match = key.match(/^(\w+)\[(\w+)\]$/)
              if (match && match.length >= 3) {
                const parentKey = match[1]
                const childKey = match[2]
                if (parentKey && childKey) {
                  if (!body[parentKey]) body[parentKey] = {}
                  body[parentKey][childKey] = value
                }
              } else {
                body[key] = value
              }
            } else {
              // Regular field
              body[key] = value
            }
          }
          
          console.log('Parsed form data body:', body)
        } catch (formError) {
          console.error('Form data parse error:', formError)
          return NextResponse.json(
            { error: 'Failed to parse form data', details: formError instanceof Error ? formError.message : 'Unknown error' },
            { status: 400 }
          )
        }
      } else {
        // Try to parse as JSON as fallback
        try {
          body = await request.json()
        } catch (fallbackError) {
          console.error('Failed to parse request body:', fallbackError)
          return NextResponse.json(
            { error: 'Unsupported content type or invalid request body', details: `Content-Type: ${contentType}` },
            { status: 400 }
          )
        }
      }
      
      // Validate parsed body is an object
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return NextResponse.json(
          { error: 'Invalid request body', details: 'Request body must be a JSON object' },
          { status: 400 }
        )
      }
    } catch (error) {
      console.error('Error reading request body:', error)
      return NextResponse.json(
        { error: 'Failed to read request body', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 400 }
      )
    }
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { user } = await getMeUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { bookingId } = await params
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

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Not authorized to delete this booking' }, { status: 403 })
    }

    // Delete the booking
    await payload.delete({
      collection: 'bookings',
      id: bookingId,
      user,
    })

    return NextResponse.json({ message: 'Booking deleted successfully' })
  } catch (error) {
    console.error('Error deleting booking:', error)
    return NextResponse.json(
      { error: 'Failed to delete booking', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

