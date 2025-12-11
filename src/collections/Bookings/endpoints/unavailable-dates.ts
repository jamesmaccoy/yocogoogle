import { Purchases } from '@revenuecat/purchases-js'
import { Endpoint } from 'payload'

export const unavailableDates: Endpoint = {
  method: 'get',
  path: '/unavailable-dates',
  handler: async (req) => {
    const { slug, postId } = req.query

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

      // Find all bookings for this post with package information
      const bookings = await req.payload.find({
        collection: 'bookings',
        where: {
          post: {
            equals: resolvedPostId,
          },
        },
        limit: 1000,
        select: {
          fromDate: true,
          toDate: true,
          selectedPackage: true,
        },
        depth: 0,
      })

      // Helper to resolve package ID from booking
      const resolvePackageId = (booking: any): string | null => {
        const pkg = booking?.selectedPackage?.package
        if (!pkg) return null
        if (typeof pkg === 'string') return pkg
        if (typeof pkg === 'object' && 'id' in pkg) return pkg.id
        return null
      }

      // Get all packages for this post to check concurrency limits
      const packages = await req.payload.find({
        collection: 'packages',
        where: {
          post: {
            equals: resolvedPostId,
          },
        },
        limit: 100,
        select: {
          id: true,
          maxConcurrentBookings: true,
        },
        depth: 0,
      })

      // Create a map of package IDs to their concurrency limits
      const packageConcurrencyMap = new Map<string, number>()
      packages.docs.forEach((pkg: any) => {
        const limit = Number(pkg?.maxConcurrentBookings)
        if (Number.isFinite(limit) && limit > 0) {
          packageConcurrencyMap.set(pkg.id, limit)
        } else {
          // Default to 1 if not set or invalid
          packageConcurrencyMap.set(pkg.id, 1)
        }
      })

      // Track bookings per date per package
      // Map structure: dateISO -> Map<packageId | 'property-level', count>
      const datePackageBookings = new Map<string, Map<string, number>>()

      bookings.docs.forEach((booking) => {
        const fromDate = new Date(booking.fromDate)
        const toDate = new Date(booking.toDate)
        
        const fromDateStr = fromDate.toISOString().split('T')[0]
        const toDateStr = toDate.toISOString().split('T')[0]
        
        const normalizedFromDate = new Date(fromDateStr + 'T00:00:00.000Z')
        const normalizedToDate = new Date(toDateStr + 'T00:00:00.000Z')

        const packageId = resolvePackageId(booking)
        const bookingKey = packageId || 'property-level' // Use 'property-level' for bookings without packages

        // Generate array of all dates in the range (excluding check-out date)
        const currentDate = new Date(normalizedFromDate)
        while (currentDate.getTime() < normalizedToDate.getTime()) {
          const dateISO = currentDate.toISOString()
          
          if (!datePackageBookings.has(dateISO)) {
            datePackageBookings.set(dateISO, new Map())
          }
          
          const packageMap = datePackageBookings.get(dateISO)!
          const currentCount = packageMap.get(bookingKey) || 0
          packageMap.set(bookingKey, currentCount + 1)
          
          currentDate.setUTCDate(currentDate.getUTCDate() + 1)
        }
      })

      // Determine unavailable dates
      // A date is unavailable if:
      // 1. There are property-level bookings (bookings without packages) on that date, OR
      // 2. NO packages can accept bookings on that date (all have reached their concurrency limits)
      const unavailableDates: string[] = []

      datePackageBookings.forEach((packageMap, dateISO) => {
        // Check if there are property-level bookings (these block everything)
        if (packageMap.has('property-level')) {
          unavailableDates.push(dateISO)
          return
        }

        // If there are no packages configured, dates with bookings are unavailable
        // (this shouldn't normally happen, but handle it gracefully)
        if (packageConcurrencyMap.size === 0) {
          // If there are any bookings and no packages, mark as unavailable
          if (packageMap.size > 0) {
            unavailableDates.push(dateISO)
          }
          return
        }

        // Check if ANY package can still accept bookings on this date
        // A date is available if at least one package has availability
        let hasAvailablePackage = false
        
        // Check all packages for this post
        for (const [packageId, limit] of packageConcurrencyMap.entries()) {
          const bookingCount = packageMap.get(packageId) || 0
          if (bookingCount < limit) {
            // This package still has availability
            hasAvailablePackage = true
            break
          }
        }

        // If no packages can accept bookings, mark the date as unavailable
        if (!hasAvailablePackage) {
          unavailableDates.push(dateISO)
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