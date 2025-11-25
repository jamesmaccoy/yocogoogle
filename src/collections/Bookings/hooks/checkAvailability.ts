import { format } from 'date-fns'
import { APIError, CollectionBeforeChangeHook } from 'payload'

// Helper function to get unavailable dates for a post
async function getUnavailableDates(
  postId: string | { id: string } | undefined,
  currentBookingId: string | undefined,
  payload: any,
  req: any,
): Promise<string[]> {
  if (!postId) return []

  const resolvedPostId = typeof postId === 'string' ? postId : postId?.id
  if (!resolvedPostId) return []

  try {
    // Find all bookings for this post (excluding current booking if updating)
    const whereClause: any = {
      post: { equals: resolvedPostId },
    }

    // Exclude current booking if updating
    if (currentBookingId) {
      whereClause.id = { not_equals: currentBookingId }
    }

    const bookings = await payload.find({
      collection: 'bookings',
      where: whereClause,
      limit: 1000,
      select: {
        fromDate: true,
        toDate: true,
      },
      depth: 0,
      req,
    })

    const unavailableDates: string[] = []

    bookings.docs.forEach((booking: any) => {
      if (!booking.fromDate || !booking.toDate) return

      // Parse dates and normalize to midnight UTC
      const fromDate = new Date(booking.fromDate)
      const toDate = new Date(booking.toDate)

      const fromDateStr = fromDate.toISOString().split('T')[0]
      const toDateStr = toDate.toISOString().split('T')[0]

      const normalizedFromDate = new Date(fromDateStr + 'T00:00:00.000Z')
      const normalizedToDate = new Date(toDateStr + 'T00:00:00.000Z')

      // Generate array of all dates in the range (excluding check-out date)
      const currentDate = new Date(normalizedFromDate)

      while (currentDate.getTime() < normalizedToDate.getTime()) {
        unavailableDates.push(currentDate.toISOString().split('T')[0])
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
      }
    })

    return [...new Set(unavailableDates)]
  } catch (error) {
    console.error('Error fetching unavailable dates:', error)
    return []
  }
}

// Helper function to check if a date range contains unavailable dates
function hasUnavailableDateInRange(
  unavailableDates: string[],
  fromDate: string,
  toDate: string,
): boolean {
  if (!fromDate || !toDate) return false

  const fromDateStr = new Date(fromDate).toISOString().split('T')[0]
  const toDateStr = new Date(toDate).toISOString().split('T')[0]

  const from = new Date(fromDateStr + 'T00:00:00.000Z')
  const to = new Date(toDateStr + 'T00:00:00.000Z')

  const checkDate = new Date(from)
  while (checkDate.getTime() < to.getTime()) {
    const dateStr = checkDate.toISOString().split('T')[0]
    if (unavailableDates.includes(dateStr)) {
      return true
    }
    checkDate.setUTCDate(checkDate.getUTCDate() + 1)
  }

  return false
}

export const checkAvailabilityHook: CollectionBeforeChangeHook = async ({
  data,
  req: { payload },
  req,
  operation,
  id, // Current booking ID (for updates)
}) => {
  // Skip availability check if dates aren't being updated
  // This allows updating other fields (like guests) without triggering availability checks
  const isUpdatingDates = 'fromDate' in data || 'toDate' in data || 'post' in data
  
  if (!isUpdatingDates) {
    // Not updating dates, skip availability check
    return data
  }

  // For updates, if dates aren't being changed, skip availability check
  if (operation === 'update' && id) {
    // Check if dates are actually being changed by comparing with existing booking
    try {
      const existingBooking = await payload.findByID({
        collection: 'bookings',
        id,
        depth: 0,
        req,
      })
      
      const existingFromDate = existingBooking.fromDate
      const existingToDate = existingBooking.toDate
      const existingPostId = typeof existingBooking.post === 'string' 
        ? existingBooking.post 
        : existingBooking.post?.id
      
      const newFromDate = 'fromDate' in data ? data.fromDate : existingFromDate
      const newToDate = 'toDate' in data ? data.toDate : existingToDate
      const newPostId = 'post' in data 
        ? (typeof data.post === 'string' ? data.post : (data.post as any)?.id)
        : existingPostId
      
      // Normalize dates for comparison
      const normalizeDate = (date: any): string | null => {
        if (!date) return null
        return new Date(date).toISOString().split('T')[0]
      }
      
      const existingFromDateStr = normalizeDate(existingFromDate)
      const existingToDateStr = normalizeDate(existingToDate)
      const newFromDateStr = normalizeDate(newFromDate)
      const newToDateStr = normalizeDate(newToDate)
      
      // If dates and post haven't changed, skip availability check
      if (
        existingFromDateStr === newFromDateStr &&
        existingToDateStr === newToDateStr &&
        existingPostId === newPostId
      ) {
        return data
      }
      
      // Dates are being changed, use the new dates for validation
      if (!('fromDate' in data)) {
        data.fromDate = existingFromDate
      }
      if (!('toDate' in data)) {
        data.toDate = existingToDate
      }
      if (!('post' in data)) {
        data.post = existingBooking.post
      }
    } catch (error) {
      console.error('Error fetching existing booking:', error)
      // Continue with validation if we can't fetch existing booking
    }
  }

  // For creates, we need fromDate and post
  if (operation === 'create') {
    if (!('fromDate' in data && 'post' in data)) {
      throw new APIError('Start date and post are required.', 400, undefined, true)
    }
  }

  const { fromDate, toDate } = data

  // Only validate date range if both dates are present
  if (toDate && fromDate >= toDate) {
    throw new APIError('Start date must be before end date.', 400, undefined, true)
  }

  // Get unavailable dates for this post
  const unavailableDates = await getUnavailableDates(
    data.post,
    operation === 'update' ? id : undefined,
    payload,
    req,
  )

  // Check if selected dates contain unavailable dates
  if (toDate && hasUnavailableDateInRange(unavailableDates, fromDate, toDate)) {
    const formattedFromDate = format(new Date(fromDate), 'yyyy-MM-dd')
    const formattedToDate = format(new Date(toDate), 'yyyy-MM-dd')
    
    throw new APIError(
      `The selected date range (${formattedFromDate} to ${formattedToDate}) contains dates that are already booked. Please choose different dates.`,
      400,
      [
        {
          message: 'Selected dates overlap with existing bookings.',
          unavailableDates: unavailableDates.slice(0, 10), // Show first 10 unavailable dates
        },
      ],
      true,
    )
  }

  // Skip overlap check if toDate is not provided
  if (!toDate) {
    return data
  }

  // Normalize dates to ISO strings for consistent database comparison
  // Use full ISO strings (YYYY-MM-DDTHH:mm:ss.sssZ) for query compatibility
  const normalizeToISOString = (dateStr: string): string => {
    const date = new Date(dateStr)
    const utcDate = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0, 0, 0, 0
    ))
    return utcDate.toISOString()
  }

  const formattedFromDate = format(new Date(fromDate), 'yyyy-MM-dd')
  const formattedToDate = format(new Date(toDate), 'yyyy-MM-dd')
  const fromDateISO = normalizeToISOString(fromDate)
  const toDateISO = normalizeToISOString(toDate)

  const resolveRelationshipId = (value: unknown): string | undefined => {
    if (!value) return undefined
    if (typeof value === 'string') return value
    if (typeof value === 'object' && 'id' in value && typeof (value as any).id === 'string') {
      return (value as any).id
    }
    return undefined
  }

  const targetPackageId = resolveRelationshipId(data?.selectedPackage?.package)

  let concurrencyLimit = 1

  if (targetPackageId) {
    try {
      const packageDoc = await payload.findByID({
        collection: 'packages',
        id: targetPackageId,
        depth: 0,
        req,
      })

      const configuredLimit = Number(packageDoc?.maxConcurrentBookings)
      if (Number.isFinite(configuredLimit) && configuredLimit > 0) {
        concurrencyLimit = configuredLimit
      }
    } catch (error) {
      console.warn(
        `⚠️ Failed to read package ${targetPackageId} maxConcurrentBookings, defaulting to 1.`,
        error,
      )
    }
  }

  // Check if the booking overlaps with existing bookings
  // Use ISO date strings for proper comparison with database ISO timestamps
  const whereClause: any = {
    and: [
      { post: { equals: data.post } },
      { fromDate: { less_than: toDateISO } },
      { toDate: { greater_than: fromDateISO } },
    ],
  }

  // Exclude current booking if updating
  if (operation === 'update' && id) {
    whereClause.and.push({ id: { not_equals: id } })
  }

  const bookings = await payload.find({
    collection: 'bookings',
    where: whereClause,
    limit: 10, // Get more bookings for debugging
    select: {
      slug: true,
      fromDate: true,
      toDate: true,
      title: true,
      id: true,
      selectedPackage: true,
    },
    depth: 0,
    req,
  })

  const resolveBookingPackageId = (booking: any) => resolveRelationshipId(booking?.selectedPackage?.package)

  const conflictingBookings = bookings.docs.filter((booking) => {
    if (!targetPackageId) {
      return true
    }

    const bookingPackageId = resolveBookingPackageId(booking)
    // If booking has no package, it conflicts with everything (property-level booking)
    if (!bookingPackageId) {
      console.log('⚠️ Booking without package found in hook - treating as conflict:', {
        bookingId: booking.id,
        fromDate: booking.fromDate,
        toDate: booking.toDate,
        selectedPackage: booking.selectedPackage,
      })
      return true
    }

    return bookingPackageId === targetPackageId
  })

  const isAvailable = conflictingBookings.length < concurrencyLimit

  if (!isAvailable) {
    console.error('❌ Booking availability check failed:', {
      requestedDates: {
        fromDate: formattedFromDate,
        toDate: formattedToDate,
        post: data.post,
        packageId: targetPackageId,
        concurrencyLimit,
      },
      conflictingBookings: conflictingBookings.map((b) => ({
        id: b.id,
        title: b.title,
        fromDate: b.fromDate,
        toDate: b.toDate,
        packageId: resolveBookingPackageId(b),
      })),
    })
    
    throw new APIError(
      `Booking dates are not available. Found ${conflictingBookings.length} conflicting booking(s) and the limit for this package is ${concurrencyLimit}.`,
      400,
      [
        {
          message: 'The selected dates overlap with an existing booking.',
          conflictingBookings: conflictingBookings.map((b) => ({
            id: b.id,
            title: b.title,
            fromDate: b.fromDate,
            toDate: b.toDate,
            packageId: resolveBookingPackageId(b),
          })),
        },
      ],
      true,
    )
  }

  return data
}
