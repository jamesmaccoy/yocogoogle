import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'

// Use the GEMINI_API_KEY environment variable defined in your .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

const serializeUsageMetadata = (usage: any) => {
  if (!usage) return undefined

  const safeNumber = (value: any) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

  return {
    total: safeNumber(usage.totalTokenCount),
    prompt: safeNumber(usage.promptTokenCount),
    candidates: safeNumber(usage.candidatesTokenCount),
    cached: safeNumber(usage.cachedContentTokenCount),
    thoughts: safeNumber(usage.thoughtsTokenCount),
  }
}

export async function POST(req: Request) {
  try {
    const { message, bookingContext, context, packageId, postId } = await req.json()
    const { user } = await getMeUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's bookings, estimates, and available packages
    const payload = await getPayload({ config: configPromise })

    const [bookings, estimates, packages] = await Promise.all([
      payload.find({
        collection: 'bookings',
        where: {
          customer: { equals: user.id },
        },
        depth: 2,
        sort: '-fromDate',
      }),
      payload.find({
        collection: 'estimates',
        where: {
          customer: { equals: user.id },
        },
        depth: 2,
        sort: '-createdAt',
      }),
      // Fetch all packages to provide recommendations and enabled status
      payload.find({
        collection: 'packages',
        depth: 2,
        sort: 'name',
        limit: 100, // Get a good sample of packages
      }),
    ])

    // Get post details if context provided
    let postDetails = null
    if (bookingContext?.postId) {
      try {
        const post = await payload.findByID({
          collection: 'posts',
          id: bookingContext.postId,
          depth: 1
        })
        postDetails = post
      } catch (error) {
        console.error('Error fetching post details:', error)
      }
    }

    // Format bookings and estimates data for the AI
    const bookingsInfo = bookings.docs.map((booking: any) => {
      const post = typeof booking.post === 'object' && booking.post ? booking.post : null
      const categories = Array.isArray(post?.categories)
        ? post.categories.map((c: any) =>
            typeof c === 'object'
              ? (c.title || c.slug || c.id || '').toString()
              : String(c)
          ).filter(Boolean)
        : []

      return {
        id: booking.id,
        title: booking.title,
        fromDate: new Date(booking.fromDate).toLocaleDateString(),
        toDate: new Date(booking.toDate).toLocaleDateString(),
        status: booking.paymentStatus || 'unknown',
        propertyTitle: post?.title || '',
        propertySlug: post?.slug || '',
        proximityCategories: categories,
      }
    })

    const estimatesInfo = estimates.docs.map((estimate) => ({
      id: estimate.id,
      title:
        typeof estimate.post === 'string' ? estimate.title : estimate.post?.title || estimate.title,
      total: estimate.total,
      fromDate: new Date(estimate.fromDate).toLocaleDateString(),
      toDate: new Date(estimate.toDate).toLocaleDateString(),
      status: estimate.paymentStatus,
      packageName: (estimate as any).packageLabel || estimate.packageType || '',
      link: `${process.env.NEXT_PUBLIC_URL}/estimate/${estimate.id}`,
    }))

    // Format packages data for the AI
    const packagesInfo = packages.docs.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      isEnabled: pkg.isEnabled,
      category: pkg.category,
      multiplier: pkg.multiplier,
      minNights: pkg.minNights,
      maxNights: pkg.maxNights,
      baseRate: pkg.baseRate,
      revenueCatId: pkg.revenueCatId,
      features: pkg.features?.map((f: any) => typeof f === 'string' ? f : f.feature).filter(Boolean) || [],
      postTitle: typeof pkg.post === 'object' && pkg.post ? pkg.post.title : 'Unknown Property',
      durationText: pkg.minNights === pkg.maxNights 
        ? `${pkg.minNights} ${pkg.minNights === 1 ? 'night' : 'nights'}`
        : `${pkg.minNights}-${pkg.maxNights} nights`
    }))

    // Create a context with the user's data
    const userContext = {
      bookings: bookingsInfo,
      estimates: estimatesInfo,
      packages: packagesInfo,
      user: {
        id: user.id,
        email: user.email,
      },
      // Add booking context if provided
      currentBooking: bookingContext ? {
        postId: bookingContext.postId,
        postTitle: bookingContext.postTitle || postDetails?.title || 'this property',
        postDescription: bookingContext.postDescription || postDetails?.meta?.description || '',
        baseRate: bookingContext.baseRate || 150,
        duration: bookingContext.duration || 1,
        availablePackages: bookingContext.packages || 0,
        customerEntitlement: bookingContext.customerEntitlement || 'none',
        selectedPackage: bookingContext.selectedPackage || null,
        fromDate: bookingContext.fromDate || null,
        toDate: bookingContext.toDate || null,
        postDetails: postDetails ? {
          title: postDetails.title,
          description: postDetails.meta?.description || ''
        } : null
      } : null
    }

    // Get the generative model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Handle package update context
    if (context === 'package-update' && packageId && postId) {
      try {
        // Fetch the specific package to update
        const packageToUpdate = await payload.findByID({
          collection: 'packages',
          id: packageId,
          depth: 1
        })

        // Fetch post details
        const post = await payload.findByID({
          collection: 'posts',
          id: postId,
          depth: 1
        })

        const systemPrompt = `You are an AI assistant helping a host update a package for their property.

CURRENT PACKAGE:
- Name: ${packageToUpdate.name}
- Category: ${packageToUpdate.category}
- Description: ${packageToUpdate.description || 'No description'}
- Base Rate: ${packageToUpdate.baseRate ? `R${packageToUpdate.baseRate}` : 'Not set'}
- Features: ${packageToUpdate.features?.map((f: any) => typeof f === 'string' ? f : f.feature).join(', ') || 'No features'}
- RevenueCat ID: ${packageToUpdate.revenueCatId}
- Enabled: ${packageToUpdate.isEnabled}

PROPERTY CONTEXT:
- Property: ${post.title}
- Description: ${post.meta?.description || 'No description'}

AVAILABLE CATEGORIES:
- standard: Regular accommodation packages
- hosted: Packages with host services/concierge
- addon: One-time services or extras (cleaning, wine, guided tours, etc.)
- special: Unique or promotional packages

INSTRUCTIONS:
1. Analyze the user's request for package updates
2. If they want to change the category to 'addon', suggest appropriate changes:
   - Update category to 'addon'
   - Suggest appropriate base rate for addon services
   - Update features to reflect addon nature
   - Update description to focus on the service/extra
3. Provide specific, actionable suggestions
4. Include reasoning for your recommendations
5. Be helpful and professional

Respond with clear, specific suggestions for updating the package.`

        const chat = model.startChat({
          history: [
            {
              role: 'user',
              parts: [{ text: systemPrompt }],
            },
            {
              role: 'model',
              parts: [{ text: 'I understand. I\'m ready to help you update this package.' }],
            },
          ],
        })

        const result = await chat.sendMessage(message)
        const response = await result.response
        const text = response.text()
        const usage = serializeUsageMetadata(response.usageMetadata)

        return NextResponse.json({ response: text, usage })
      } catch (error) {
        console.error('Error in package update:', error)
        return NextResponse.json({ response: 'Sorry, I encountered an error while updating the package. Please try again.' })
      }
    }

    // Handle cleaning schedule optimization for hosts/admins
    if (context === 'cleaning-schedule') {
      try {
        // Fetch ALL bookings (not just user's bookings) for cleaning schedule
        // Hosts need to see all bookings across all properties
        const allBookings = await payload.find({
          collection: 'bookings',
          where: {
            paymentStatus: { equals: 'paid' }, // Only paid bookings
          },
          depth: 2,
          sort: 'toDate',
          limit: 200, // Get upcoming bookings
        })

        // Format bookings with full property details including sleep capacity
        const cleaningBookingsInfo = allBookings.docs.map((booking: any) => {
          const post = typeof booking.post === 'object' && booking.post ? booking.post : null
          const categories = Array.isArray(post?.categories)
            ? post.categories.map((c: any) =>
                typeof c === 'object'
                  ? (c.title || c.slug || c.id || '').toString()
                  : String(c)
              ).filter(Boolean)
            : []
          
          // Extract sleep capacity from post meta description or content
          let sleepCapacity = 'Unknown'
          if (post?.meta?.description) {
            const desc = post.meta.description
            const match1 = desc.match(/(?:sleeps?|accommodates?|fits?)\s+(\d+)/i)?.[1]
            const match2 = desc.match(/(\d+)\s+(?:person|people|guest|bedroom)/i)?.[1]
            const match3 = desc.match(/(?:couple|double|single|twin)/i) ? '2' : null
            sleepCapacity = match1 || match2 || match3 || 'Unknown'
          }
          
          // Also try to extract from post content if it's a string (simple text)
          if (sleepCapacity === 'Unknown' && post?.content && typeof post.content === 'string') {
            const content = post.content
            const match1 = content.match(/(?:sleeps?|accommodates?|fits?)\s+(\d+)/i)?.[1]
            const match2 = content.match(/(\d+)\s+(?:person|people|guest|bedroom)/i)?.[1]
            sleepCapacity = match1 || match2 || sleepCapacity
          }

          return {
            id: booking.id,
            propertyTitle: post?.title || booking.title || 'Unknown Property',
            propertySlug: post?.slug || '',
            fromDate: booking.fromDate,
            toDate: booking.toDate,
            checkoutDate: new Date(booking.toDate).toLocaleDateString('en-US', { 
              weekday: 'short', 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            }),
            checkoutDateISO: booking.toDate.split('T')[0], // YYYY-MM-DD format for comparison
            status: booking.paymentStatus || 'unknown',
            proximityCategories: categories,
            sleepCapacity: sleepCapacity,
          }
        })

        // Get today's date in YYYY-MM-DD format
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayISO = today.toISOString().split('T')[0]
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowISO = tomorrow.toISOString().split('T')[0]

        // Filter bookings checking out today and tomorrow
        const todayCheckouts = cleaningBookingsInfo.filter(b => b.checkoutDateISO === todayISO)
        const tomorrowCheckouts = cleaningBookingsInfo.filter(b => b.checkoutDateISO === tomorrowISO)

        const systemPrompt = `You are an expert operations assistant helping a host plan cleaner routes.

HOST CONTEXT:
- User ID: ${user.id}
- Email: ${user.email}
- Today's date: ${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

ALL UPCOMING BOOKINGS (checking out):
${cleaningBookingsInfo.length > 0 
  ? cleaningBookingsInfo.map(
      (b) =>
        `- ${b.propertyTitle} (sleeps ${b.sleepCapacity}) • Checkout: ${b.checkoutDate} • Categories: ${b.proximityCategories.length ? b.proximityCategories.join(', ') : 'None'}`
    ).join('\n')
  : 'No upcoming bookings found.'}

TODAY'S CHECKOUTS (${todayCheckouts.length}):
${todayCheckouts.length > 0
  ? todayCheckouts.map(
      (b) =>
        `- ${b.propertyTitle} (sleeps ${b.sleepCapacity}) • Categories: ${b.proximityCategories.length ? b.proximityCategories.join(', ') : 'None'}`
    ).join('\n')
  : 'No checkouts today.'}

TOMORROW'S CHECKOUTS (${tomorrowCheckouts.length}):
${tomorrowCheckouts.length > 0
  ? tomorrowCheckouts.map(
      (b) =>
        `- ${b.propertyTitle} (sleeps ${b.sleepCapacity}) • Categories: ${b.proximityCategories.length ? b.proximityCategories.join(', ') : 'None'}`
    ).join('\n')
  : 'No checkouts tomorrow.'}

CRITICAL INSTRUCTIONS:
1. **ALWAYS start with today's checkouts first**. If there are no checkouts today, mention that clearly and move to tomorrow.
2. **Use categories as proximity data** - Properties sharing categories like 'southern peninsular', 'cape-town', etc. are close together. Group them into routes.
3. **Use sleep capacity to estimate cleaning time**:
   - Properties sleeping 1-2: ~1-2 hours cleaning
   - Properties sleeping 3-4: ~2-3 hours cleaning  
   - Properties sleeping 5+: ~3-4 hours cleaning
4. **Create optimized routes**:
   - Group properties by shared categories (proximity)
   - Name routes by area (e.g. "South Peninsula Route", "City Route")
   - Suggest time windows (e.g. 10:00-14:00)
   - Calculate if 1 cleaner can handle the route or if 2 are needed
5. **Be direct and actionable** - Create the plan immediately using the data provided. Do NOT ask for more information.
6. **Format as a clear cleaning schedule** with dates, routes, properties, and cleaner assignments.

Create the cleaning plan now using the available data.`

        const chat = model.startChat({
          history: [
            {
              role: 'user',
              parts: [{ text: systemPrompt }],
            },
            {
              role: 'model',
              parts: [{ text: "I understand. I'm ready to help you plan cleaner schedules and routes." }],
            },
          ],
        })

        const result = await chat.sendMessage(message)
        const response = await result.response
        const text = response.text()
        const usage = serializeUsageMetadata(response.usageMetadata)

        return NextResponse.json({ response: text, usage })
      } catch (error) {
        console.error('Error in cleaning-schedule context:', error)
        return NextResponse.json({
          response:
            'Sorry, I encountered an error while planning the cleaning schedule. Please try again in a moment.',
        })
      }
    }

    // Create enhanced prompt for booking assistant
    const systemPrompt = bookingContext ? `You are a helpful AI booking assistant for ${userContext.currentBooking?.postTitle}. 

CURRENT BOOKING CONTEXT:
- Property: ${userContext.currentBooking?.postTitle}
- Base Rate: R${userContext.currentBooking?.baseRate}/night
- Customer Entitlement: ${userContext.currentBooking?.customerEntitlement}
- Available Packages: ${userContext.currentBooking?.availablePackages}
${userContext.currentBooking?.selectedPackage ? `- Selected Package: ${userContext.currentBooking.selectedPackage}` : ''}
${userContext.currentBooking?.fromDate && userContext.currentBooking?.toDate ? 
  `- Selected Dates: ${new Date(userContext.currentBooking.fromDate).toLocaleDateString()} to ${new Date(userContext.currentBooking.toDate).toLocaleDateString()} (${userContext.currentBooking.duration} ${userContext.currentBooking.duration === 1 ? 'night' : 'nights'})` : 
  '- Dates: Not yet selected'
}
${userContext.currentBooking?.postDetails?.description ? `- Description: ${userContext.currentBooking.postDetails.description}` : ''}

USER'S BOOKING HISTORY:
- Total Bookings: ${userContext.bookings.length}
- Recent Estimates: ${userContext.estimates.length}

AVAILABLE PACKAGES FOR THIS PROPERTY:
${packagesInfo.filter(pkg => pkg.isEnabled).map(pkg => 
  `- ${pkg.name} (${pkg.durationText}): ${pkg.description} - Features: ${pkg.features.join(', ')}`
).join('\n')}

ENTITLEMENT INFORMATION:
- Customer has ${userContext.currentBooking?.customerEntitlement} entitlement
- Pro-only packages (like "🏘️ Annual agreement", hosted experiences) require pro subscription
- Standard packages are available to all customers
- Guests can see all packages but need to log in to book

INSTRUCTIONS:
1. Be conversational and helpful
2. If dates are already selected, acknowledge them and focus on package recommendations or other aspects
3. If dates are not selected, guide users to select dates first
4. Recommend packages based on duration and customer needs
5. Explain package benefits clearly
6. For pro-only packages (like "🏘️ Annual agreement"), mention they require a pro subscription if user isn't pro
7. Help with date selection and duration planning when needed
8. Provide pricing estimates when relevant
9. Guide users through the booking process step by step
10. Keep responses concise but informative
11. Use emojis sparingly for a friendly tone
12. When user asks about packages without dates, suggest they select dates first for better recommendations
13. If user asks about pro packages but has standard entitlement, suggest upgrading to pro

Respond to the user's message naturally, as if you're a knowledgeable booking assistant who knows this property well.` 
    : 
    `You are a helpful AI assistant for a booking platform. You have access to the user's booking history and can help with general questions about properties, packages, and bookings.

USER'S DATA:
- Total Bookings: ${userContext.bookings.length}
- Recent Estimates: ${userContext.estimates.length}
 - Available Packages: ${packagesInfo.length}
 - Available Addons: ${packagesInfo.filter(pkg => pkg.category === 'addon' && pkg.isEnabled).length}
 - Page Summary: ${userContext.currentBooking?.postDetails?.description || 'No additional property summary'}

Be helpful, concise, and guide users to make great booking decisions.`

    // Create a chat context with the user's data
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I\'m ready to help with booking assistance.' }],
        },
      ],
    })

    // Generate response
    const result = await chat.sendMessage(message)
    const response = await result.response
    const text = response.text()
    const usage = serializeUsageMetadata(response.usageMetadata)

    return NextResponse.json({ message: text, usage })
  } catch (error) {
    console.error('Error in chat API:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Failed to process your request',
      message: `Error: ${errorMessage}`,
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}