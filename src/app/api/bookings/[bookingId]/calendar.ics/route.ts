import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { format } from 'date-fns'

/**
 * Generate iCal format calendar feed for a single booking
 * Usage: /api/bookings/[bookingId]/calendar.ics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { bookingId } = await params

    // Fetch the booking
    const booking = await payload.findByID({
      collection: 'bookings',
      id: bookingId,
      depth: 2, // Include post and customer details
    })

    if (!booking || !booking.fromDate) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const fromDate = new Date(booking.fromDate)
    // If no toDate, use fromDate + 1 day
    const toDate = booking.toDate ? new Date(booking.toDate) : new Date(fromDate.getTime() + 24 * 60 * 60 * 1000)

    // Format dates in iCal format (YYYYMMDDTHHmmssZ)
    const formatICalDate = (date: Date): string => {
      return format(date, "yyyyMMdd'T'HHmmss'Z'")
    }

    // Get post title
    const postTitle = typeof booking.post === 'object' && booking.post?.title
      ? booking.post.title
      : typeof booking.post === 'string'
      ? booking.post
      : 'Property'

    // Get customer name/email
    const customerName = typeof booking.customer === 'object' && booking.customer?.email
      ? booking.customer.email
      : typeof booking.customer === 'string'
      ? booking.customer
      : 'Guest'

    // Generate unique ID for event
    const uid = `booking-${booking.id}@simpleplek.co.za`

    // Create event summary
    const summary = `Booking: ${postTitle}`
    
    // Create description
    const descriptionParts: string[] = []
    descriptionParts.push(`Property: ${postTitle}`)
    descriptionParts.push(`Guest: ${customerName}`)
    if (booking.packageType) {
      descriptionParts.push(`Package: ${booking.packageType}`)
    }
    if (booking.guests && Array.isArray(booking.guests) && booking.guests.length > 0) {
      descriptionParts.push(`Guests: ${booking.guests.length}`)
    }
    const description = descriptionParts.join('\\n')

    // Get location from post if available
    const location = typeof booking.post === 'object' && booking.post?.meta?.address
      ? booking.post.meta.address
      : postTitle

    // Generate iCal content
    const lines: string[] = []
    lines.push('BEGIN:VCALENDAR')
    lines.push('VERSION:2.0')
    lines.push('PRODID:-//Simple Plek//Bookings//EN')
    lines.push('CALSCALE:GREGORIAN')
    lines.push('METHOD:PUBLISH')
    // Add refresh interval hint (in minutes)
    lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT15M')
    lines.push('X-PUBLISHED-TTL;VALUE=DURATION:PT15M')
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTART:${formatICalDate(fromDate)}`)
    lines.push(`DTEND:${formatICalDate(toDate)}`)
    lines.push(`SUMMARY:${escapeICalText(summary)}`)
    lines.push(`DESCRIPTION:${escapeICalText(description)}`)
    lines.push(`LOCATION:${escapeICalText(location)}`)
    lines.push(`DTSTAMP:${formatICalDate(new Date())}`)
    lines.push(`CREATED:${formatICalDate(new Date(booking.createdAt || new Date()))}`)
    if (booking.updatedAt) {
      lines.push(`LAST-MODIFIED:${formatICalDate(new Date(booking.updatedAt))}`)
    }
    lines.push('STATUS:CONFIRMED')
    // Use sequence number based on update time to help detect changes
    const sequence = booking.updatedAt && booking.createdAt && booking.updatedAt !== booking.createdAt ? 1 : 0
    lines.push(`SEQUENCE:${sequence}`)
    lines.push('END:VEVENT')
    lines.push('END:VCALENDAR')

    const icalContent = lines.join('\r\n')

    // Generate ETag based on booking update time
    const updateTime = booking.updatedAt ? new Date(booking.updatedAt) : new Date(booking.createdAt || new Date())
    const etag = `"${bookingId}-${updateTime.getTime()}"`

    // Check if client has cached version (ETag)
    const ifNoneMatch = request.headers.get('if-none-match')
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304, // Not Modified
        headers: {
          'ETag': etag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      })
    }

    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="booking-${bookingId}.ics"`,
        'Cache-Control': 'no-cache, must-revalidate, max-age=0',
        'ETag': etag,
        'Last-Modified': updateTime.toUTCString(),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Error generating calendar feed:', error)
    return NextResponse.json(
      { error: 'Failed to generate calendar feed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Escape special characters in iCal text fields
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

