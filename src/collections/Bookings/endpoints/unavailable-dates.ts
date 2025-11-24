import { Purchases } from '@revenuecat/purchases-js'
import { Endpoint } from 'payload'

export const unavailableDates: Endpoint = {
  method: 'get',
  path: '/unavailable-dates',
  handler: async (req) => {
    const { slug, postId, excludeBookingId } = req.query

    if (!slug && !postId) {
      return Response.json({ message: 'Post slug or ID is required' }, { status: 400 })
    }

    if (!req.user) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const isSubscribed = await hasSubscription(req.user.id)

    if (!isSubscribed) {
      return Response.json({
        unavailableDates: [],
      })
    }

    try {
      let resolvedPostId = postId

      // If slug is provided, find the post by slug
      if (slug && !postId) {
        const posts = await req.payload.find({
          collection: 'posts',
          where: {
            slug: {
              equals: slug,
            },
          },
          select: {
            slug: true,
          },
          limit: 1,
        })

        if (!posts.docs.length) {
          return Response.json({ message: 'Post not found' }, { status: 404 })
        }

        resolvedPostId = posts.docs[0]?.id
      }

      // Build where clause to exclude current booking if provided
      const whereClause: any = {
        post: {
          equals: resolvedPostId,
        },
      }

      if (excludeBookingId) {
        whereClause.id = {
          not_equals: excludeBookingId,
        }
      }

      // Find all bookings for this post
      const bookings = await req.payload.find({
        collection: 'bookings',
        where: whereClause,
        limit: 1000,
        select: {
          fromDate: true,
          toDate: true,
        },
        depth: 0,
      })

      // Extract and process date ranges
      const unavailableDates: string[] = []

      bookings.docs.forEach((booking) => {
        // Skip bookings without both dates
        if (!booking.fromDate || !booking.toDate) return
        
        // Parse dates and normalize to midnight UTC to avoid timezone issues
        const fromDate = new Date(booking.fromDate)
        const toDate = new Date(booking.toDate)
        
        // Extract just the date part (YYYY-MM-DD) and create new date at midnight UTC
        // This ensures we're working with date-only values, not datetime
        const fromDateStr = fromDate.toISOString().split('T')[0]
        const toDateStr = toDate.toISOString().split('T')[0]
        
        const normalizedFromDate = new Date(fromDateStr + 'T00:00:00.000Z')
        const normalizedToDate = new Date(toDateStr + 'T00:00:00.000Z')

        // Generate array of all dates in the range (excluding check-out date)
        // A booking from Sept 4 to Sept 6 means nights of Sept 4-5 are unavailable
        // Sept 6 is the check-out date and should be available for new bookings
        const currentDate = new Date(normalizedFromDate)
        
        // Only include dates strictly less than the check-out date
        while (currentDate.getTime() < normalizedToDate.getTime()) {
          unavailableDates.push(currentDate.toISOString())
          // Increment by one day using UTC methods to avoid timezone shifts
          currentDate.setUTCDate(currentDate.getUTCDate() + 1)
        }
      })

      // Remove duplicates if needed
      const uniqueUnavailableDates = [...new Set(unavailableDates)]

      return Response.json({
        unavailableDates: uniqueUnavailableDates,
      })
    } catch (error) {
      console.error('Error fetching unavailable dates:', error)
      return Response.json({ message: 'Error fetching unavailable dates' }, { status: 500 })
    }
  },
}

// Subscription checking is now handled by Yoco service
const hasSubscription = async (userId: string) => {
  // For now, return true to allow all users to check availability
  // Subscription checking is handled elsewhere in the application
  return true
}