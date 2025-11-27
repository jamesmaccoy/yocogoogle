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

      // Use consistent normalization
      const fromDateStr = normalizeDateForComparison(booking.fromDate)
      const toDateStr = normalizeDateForComparison(booking.toDate)

      if (!fromDateStr || !toDateStr) return

      // Parse normalized dates
      const normalizedFromDate = new Date(fromDateStr + 'T00:00:00.000Z')
      const normalizedToDate = new Date(toDateStr + 'T00:00:00.000Z')

      if (isNaN(normalizedFromDate.getTime()) || isNaN(normalizedToDate.getTime())) return

      // Generate array of all dates in the range (excluding check-out date)
      const currentDate = new Date(normalizedFromDate)

      while (currentDate.getTime() < normalizedToDate.getTime()) {
        const dateStr = normalizeDateForComparison(currentDate)
        if (dateStr) {
          unavailableDates.push(dateStr)
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
      }
    })

    return [...new Set(unavailableDates)]
  } catch (error) {
    console.error('Error fetching unavailable dates:', error)
    return []
  }
}

// Helper function to normalize dates consistently
function normalizeDateForComparison(date: any): string | null {
  if (!date) return null
  try {
    // Handle Date objects, ISO strings, timestamps, etc.
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d.getTime())) return null
    // Normalize to YYYY-MM-DD format in UTC
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return null
  }
}

// Helper function to check if a date range contains unavailable dates
function hasUnavailableDateInRange(
  unavailableDates: string[],
  fromDate: string | Date,
  toDate: string | Date,
): boolean {
  if (!fromDate || !toDate) return false

  // Normalize dates using the same function as the hook
  const fromDateStr = normalizeDateForComparison(fromDate)
  const toDateStr = normalizeDateForComparison(toDate)

  if (!fromDateStr || !toDateStr) return false

  // Parse normalized dates
  const from = new Date(fromDateStr + 'T00:00:00.000Z')
  const to = new Date(toDateStr + 'T00:00:00.000Z')

  if (isNaN(from.getTime()) || isNaN(to.getTime())) return false

  // Check each date in the range (excluding check-out date)
  const checkDate = new Date(from)
  while (checkDate.getTime() < to.getTime()) {
    const dateStr = normalizeDateForComparison(checkDate)
    if (dateStr && unavailableDates.includes(dateStr)) {
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
  // For updates, always check if dates are actually being changed
  if (operation === 'update' && id) {
    // Get the actual fields being updated (excluding internal Payload fields and undefined values)
    const dataKeys = Object.keys(data).filter(key => 
      !key.startsWith('_') && data[key] !== undefined
    )
    const dateFields = ['fromDate', 'toDate', 'post']
    const safeNonDateFields = ['guests', 'token', 'paymentStatus', 'total', 'title', 'slug', 'cleaningSchedule', 'cleaningSource', 'packageType', 'selectedPackage']
    
    // CRITICAL: Check if ONLY safe non-date fields are being updated
    // Payload may merge existing document data into `data`, but if we're only updating
    // non-date fields, we should skip validation regardless of what's in `data`
    //
    // IMPORTANT: Check if date fields are actually in the update (in dataKeys)
    // vs just present in data (which Payload may have merged)
    const dateFieldsInDataKeys = dataKeys.filter(key => dateFields.includes(key))
    const hasOnlySafeFields = dataKeys.length > 0 && 
      dateFieldsInDataKeys.length === 0 && // No date fields in the actual update
      dataKeys.every(key => safeNonDateFields.includes(key)) // All fields are safe
    
    if (hasOnlySafeFields) {
      // Only updating safe non-date fields (guests, token, etc.) - skip validation
      console.log('checkAvailabilityHook: Only safe non-date fields being updated, skipping validation', {
        bookingId: id,
        dataKeys: dataKeys,
        dateFieldsInDataKeys,
        allDataKeys: Object.keys(data)
      })
      return data
    }
    
    // If we get here, date fields might be in the update
    // But we still need to verify they've actually changed
    // Payload may include existing fields in data even if not explicitly updated
    
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
      
      // Use the shared normalization function
      const normalizeDate = normalizeDateForComparison
      
      // Get existing values
      const existingFromDate = existingBooking.fromDate
      const existingToDate = existingBooking.toDate
      const existingPostId = typeof existingBooking.post === 'string' 
        ? existingBooking.post 
        : existingBooking.post?.id
      
      // Get new values from data (use existing if not provided in update)
      // Note: Payload may include existing fields in data even if not explicitly updated
      const newFromDate = 'fromDate' in data ? data.fromDate : existingFromDate
      const newToDate = 'toDate' in data ? data.toDate : existingToDate
      const newPostId = 'post' in data 
        ? (typeof data.post === 'string' ? data.post : (data.post as any)?.id)
        : existingPostId
      
      // Normalize all dates for comparison
      const existingFromDateStr = normalizeDate(existingFromDate)
      const existingToDateStr = normalizeDate(existingToDate)
      const newFromDateStr = normalizeDate(newFromDate)
      const newToDateStr = normalizeDate(newToDate)
      
      // Compare post IDs (handle both string and object forms)
      const existingPostIdStr = existingPostId ? String(existingPostId) : null
      const newPostIdStr = newPostId ? String(newPostId) : null
      
      // Compare dates and post - if they haven't changed, skip availability check
      // This is the key check: even if Payload includes existing fields in data,
      // if the values are the same, we're not actually changing dates
      const datesUnchanged = 
        existingFromDateStr === newFromDateStr &&
        existingToDateStr === newToDateStr &&
        existingPostIdStr === newPostIdStr
      
      if (datesUnchanged) {
        // Dates haven't changed, skip availability check
        // This allows updating other fields (like guests) without triggering availability checks
        console.log('checkAvailabilityHook: Dates unchanged, skipping validation', {
          bookingId: id,
          existing: { fromDate: existingFromDateStr, toDate: existingToDateStr, post: existingPostIdStr },
          new: { fromDate: newFromDateStr, toDate: newToDateStr, post: newPostIdStr },
          dataKeys: dataKeys
        })
        return data
      }
      
      // If dates are different, check if they're actually being updated
      // Payload might include dates in data even if we're not updating them
      // Check if the dates in data are different from what we fetched
      const datesActuallyChanged = 
        ('fromDate' in data && existingFromDateStr !== newFromDateStr) ||
        ('toDate' in data && existingToDateStr !== newToDateStr) ||
        ('post' in data && existingPostIdStr !== newPostIdStr)
      
      if (!datesActuallyChanged) {
        // Dates are in data but haven't actually changed - skip validation
        console.log('checkAvailabilityHook: Dates in data but unchanged, skipping validation', {
          bookingId: id,
          existing: { fromDate: existingFromDateStr, toDate: existingToDateStr, post: existingPostIdStr },
          new: { fromDate: newFromDateStr, toDate: newToDateStr, post: newPostIdStr },
          dataKeys: dataKeys
        })
        return data
      }
      
      // Log for debugging (can be removed later)
      console.log('checkAvailabilityHook: Dates have changed, running validation', {
        existing: { fromDate: existingFromDateStr, toDate: existingToDateStr, post: existingPostIdStr },
        new: { fromDate: newFromDateStr, toDate: newToDateStr, post: newPostIdStr },
        bookingId: id,
        dataKeys: dataKeys,
        rawExisting: { fromDate: existingFromDate, toDate: existingToDate },
        rawNew: { fromDate: newFromDate, toDate: newToDate }
      })
      
      // Dates are being changed, ensure we have the values for validation
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
      console.error('Error fetching existing booking in checkAvailabilityHook:', error)
      // If we can't fetch the existing booking during an update, skip validation
      // to avoid false positives when only updating non-date fields (like guests)
      // For creates, we'll validate below
      if (operation === 'update') {
        return data
      }
      // For creates, continue with validation (will fail below if required fields missing)
    }
  }

  // For creates, we need fromDate and post
  if (operation === 'create') {
    if (!('fromDate' in data && 'post' in data)) {
      throw new APIError('Start date and post are required.', 400, undefined, true)
    }
  }

  // Ensure we have fromDate and post for validation
  if (!('fromDate' in data) || !('post' in data)) {
    // If we're here and it's an update, something went wrong with fetching existing booking
    // Skip validation to avoid false errors
    if (operation === 'update') {
      return data
    }
    throw new APIError('Start date and post are required.', 400, undefined, true)
  }

  const { fromDate, toDate } = data

  // Only validate date range if both dates are present
  if (toDate && fromDate && fromDate >= toDate) {
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
  if (toDate) {
    const hasOverlap = hasUnavailableDateInRange(unavailableDates, fromDate, toDate)
    
    // Additional defensive check: verify the overlap is real
    // Normalize the selected dates to compare with unavailable dates
    const selectedFromDateStr = normalizeDateForComparison(fromDate)
    const selectedToDateStr = normalizeDateForComparison(toDate)
    
    // Double-check: if unavailable dates are all in a different year/month, there's no overlap
    if (hasOverlap && selectedFromDateStr && selectedToDateStr) {
      const selectedYear = selectedFromDateStr.split('-')[0]
      const selectedMonth = selectedFromDateStr.split('-')[1]
      
      // Check if any unavailable dates are actually in the selected range
      const hasRealOverlap = unavailableDates.some((unavailableDate) => {
        if (!unavailableDate) return false
        const unavailableYear = unavailableDate.split('-')[0]
        const unavailableMonth = unavailableDate.split('-')[1]
        
        // Quick check: if years don't match, no overlap
        if (unavailableYear !== selectedYear) return false
        
        // Parse and compare dates properly
        const unavailableDateObj = new Date(unavailableDate + 'T00:00:00.000Z')
        const selectedFromDateObj = new Date(selectedFromDateStr + 'T00:00:00.000Z')
        const selectedToDateObj = new Date(selectedToDateStr + 'T00:00:00.000Z')
        
        return unavailableDateObj >= selectedFromDateObj && unavailableDateObj < selectedToDateObj
      })
      
      if (!hasRealOverlap) {
        // False positive detected - log and skip error
        console.warn('checkAvailabilityHook: False positive detected - dates do not actually overlap', {
          selectedRange: `${selectedFromDateStr} to ${selectedToDateStr}`,
          unavailableDates: unavailableDates.slice(0, 10),
          bookingId: id
        })
        // Skip the error - dates don't actually overlap
        return data
      }
    }
    
    if (hasOverlap) {
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
