import { format } from 'date-fns'
import { APIError, CollectionBeforeChangeHook } from 'payload'

export const checkAvailabilityHook: CollectionBeforeChangeHook = async ({
  data,
  req: { payload },
  req,
  operation,
  id, // Current booking ID (for updates)
}) => {
  // For updates, check if date fields are actually being changed
  if (operation === 'update' && id) {
    // Get fields that are actually being updated (exclude internal Payload fields)
    const dataKeys = Object.keys(data).filter(key => 
      !key.startsWith('_') && data[key] !== undefined
    )
    
    // Safe non-date fields that don't require availability validation
    const safeNonDateFields = ['guests', 'token', 'paymentStatus', 'total', 'title', 'slug', 'cleaningSchedule', 'cleaningSource', 'packageType', 'selectedPackage']
    const dateFields = ['fromDate', 'toDate', 'post']
    
    // Check if ONLY safe non-date fields are being updated
    const hasOnlySafeFields = dataKeys.length > 0 && 
      dataKeys.every(key => safeNonDateFields.includes(key)) &&
      !dataKeys.some(key => dateFields.includes(key))
    
    if (hasOnlySafeFields) {
      // Only updating safe non-date fields (guests, token, etc.) - skip validation
      return data
    }
    
    // Date fields might be in the update - fetch existing booking to compare
    try {
      const existingBooking = await payload.findByID({
        collection: 'bookings',
        id,
        depth: 0,
        req,
      })
      
      if (!existingBooking) {
        // Booking doesn't exist, let Payload handle the error
        return data
      }
      
      // Normalize dates for comparison
      const normalizeDate = (date: any): string | null => {
        if (!date) return null
        try {
          const d = date instanceof Date ? date : new Date(date)
          if (isNaN(d.getTime())) return null
          const year = d.getUTCFullYear()
          const month = String(d.getUTCMonth() + 1).padStart(2, '0')
          const day = String(d.getUTCDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        } catch {
          return null
        }
      }
      
      // Compare existing vs new dates
      const existingFromDate = normalizeDate(existingBooking.fromDate)
      const existingToDate = normalizeDate(existingBooking.toDate)
      const existingPostId = typeof existingBooking.post === 'string' 
        ? existingBooking.post 
        : existingBooking.post?.id
      
      const newFromDate = 'fromDate' in data ? normalizeDate(data.fromDate) : existingFromDate
      const newToDate = 'toDate' in data ? normalizeDate(data.toDate) : existingToDate
      const newPostId = 'post' in data 
        ? (typeof data.post === 'string' ? data.post : (data.post as any)?.id)
        : existingPostId
      
      // If dates haven't changed, skip validation
      if (existingFromDate === newFromDate && 
          existingToDate === newToDate && 
          String(existingPostId) === String(newPostId)) {
        return data
      }
      
      // Dates have changed - ensure we have the values for validation below
      if (!('fromDate' in data)) {
        data.fromDate = existingBooking.fromDate
      }
      if (!('toDate' in data)) {
        data.toDate = existingBooking.toDate
      }
      if (!('post' in data)) {
        data.post = existingBooking.post
      }
    } catch (error) {
      // If we can't fetch existing booking, skip validation to avoid false errors
      // This handles cases where only non-date fields are being updated
      console.warn('Could not fetch existing booking for comparison, skipping validation:', error)
      return data
    }
  }

  // For creates, ensure required fields are present
  if (operation === 'create') {
    if (!('fromDate' in data && 'toDate' in data && 'post' in data)) {
      throw new APIError('Start date, end date, and post are required.', 400, undefined, true)
    }
  }

  // Ensure we have required fields for validation
  if (!('fromDate' in data && 'toDate' in data && 'post' in data)) {
    // If update and we don't have dates, skip validation (likely only updating non-date fields)
    if (operation === 'update') {
      return data
    }
    throw new APIError('Start date, end date, and post are required.', 400, undefined, true)
  }

  const { fromDate, toDate } = data

  // Only validate date range if both dates are present
  if (toDate && fromDate >= toDate) {
    throw new APIError('Start date must be before end date.', 400, undefined, true)
  }

  // Skip availability check if toDate is not provided
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

  // Exclude current booking if updating (to avoid self-conflict)
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
