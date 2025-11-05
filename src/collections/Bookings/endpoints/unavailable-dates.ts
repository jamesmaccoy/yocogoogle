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

      // Find all bookings for this post
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
        },
        depth: 0,
      })

      // Extract and process date ranges
      const unavailableDates: string[] = []

      bookings.docs.forEach((booking) => {
        const fromDate = new Date(booking.fromDate)
        const toDate = new Date(booking.toDate)

        // Generate array of all dates in the range with full ISO strings
        const currentDate = new Date(fromDate)
        while (currentDate < toDate) {
          unavailableDates.push(currentDate.toISOString())
          currentDate.setDate(currentDate.getDate() + 1)
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