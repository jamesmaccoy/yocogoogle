import { Endpoint } from 'payload'

export const checkAvailability: Endpoint = {
  method: 'get',
  path: '/check-availability',
  handler: async (req) => {
    const { slug, postId, startDate, endDate, bookingId, packageId } = req.query

    if ((!slug && !postId) || !startDate || !endDate) {
      return Response.json(
        {
          message: 'Post slug/ID and date range (startDate, endDate) are required',
        },
        { status: 400 },
      )
    }

    try {
      let resolvedPostId = postId
      const targetPackageId = typeof packageId === 'string' ? packageId : undefined

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

      // Parse the requested date range
      // This will handle various date formats including ISO strings, timestamps, etc.
      const requestStart = new Date(startDate as string)
      const requestEnd = new Date(endDate as string)

      if (isNaN(requestStart.getTime()) || isNaN(requestEnd.getTime())) {
        return Response.json({ message: 'Invalid date format' }, { status: 400 })
      }

      // Normalize dates to midnight UTC to get consistent date-only values
      // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
      const startDateStr = requestStart.toISOString().split('T')[0]
      const endDateStr = requestEnd.toISOString().split('T')[0]

      // Format dates as YYYY-MM-DD for database queries
      const startFormatted = startDateStr
      const endFormatted = endDateStr

      let concurrencyLimit = 1

      if (targetPackageId) {
        try {
          const packageDoc = await req.payload.findByID({
            collection: 'packages',
            id: targetPackageId,
            depth: 0,
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

      const resolveRelationshipId = (value: unknown): string | undefined => {
        if (!value) return undefined
        if (typeof value === 'string') return value
        if (typeof value === 'object' && 'id' in value && typeof (value as any).id === 'string') {
          return (value as any).id
        }
        return undefined
      }

      // Find all bookings for this post that overlap with the requested range
      const whereConditions: Record<string, any>[] = [
        { post: { equals: resolvedPostId } },
        { fromDate: { less_than: endFormatted } },
        { toDate: { greater_than: startFormatted } },
      ]

      if (bookingId && typeof bookingId === 'string') {
        whereConditions.push({
          id: {
            not_equals: bookingId,
          },
        })
      }

      const bookings = await req.payload.find({
        collection: 'bookings',
        where: {
          and: whereConditions,
        },
        limit: 1,
        select: {
          slug: true,
          selectedPackage: true,
        },
        depth: 0,
      })

      const conflictingBookings = bookings.docs.filter((booking: any) => {
        if (!targetPackageId) {
          return true
        }

        const bookingPackageId = resolveRelationshipId(booking?.selectedPackage?.package)
        if (!bookingPackageId) {
          return true
        }

        return bookingPackageId === targetPackageId
      })

      // If any bookings were found, the dates are not available
      const isAvailable = conflictingBookings.length < concurrencyLimit

      return Response.json({
        isAvailable,
        requestedRange: {
          startDate: startFormatted,
          endDate: endFormatted,
        },
        metadata: {
          concurrencyLimit,
          conflictingCount: conflictingBookings.length,
        },
      })
    } catch (error) {
      console.error('Error checking availability:', error)
      return Response.json({ message: 'Error checking availability' }, { status: 500 })
    }
  },
}
