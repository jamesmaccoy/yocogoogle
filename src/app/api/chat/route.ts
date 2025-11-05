import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'

// Use the GEMINI_API_KEY environment variable defined in your .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

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
    const bookingsInfo = bookings.docs.map((booking) => ({
      id: booking.id,
      title: booking.title,
      fromDate: new Date(booking.fromDate).toLocaleDateString(),
      toDate: new Date(booking.toDate).toLocaleDateString(),
      status: booking.paymentStatus || 'unknown',
    }))

    const estimatesInfo = estimates.docs.map((estimate) => ({
      id: estimate.id,
      title:
        typeof estimate.post === 'string' ? estimate.title : estimate.post?.title || estimate.title,
      total: estimate.total,
      fromDate: new Date(estimate.fromDate).toLocaleDateString(),
      toDate: new Date(estimate.toDate).toLocaleDateString(),
      status: estimate.paymentStatus,
      packageName: estimate.packageType || '',
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

        return NextResponse.json({ response: text })
      } catch (error) {
        console.error('Error in package update:', error)
        return NextResponse.json({ response: 'Sorry, I encountered an error while updating the package. Please try again.' })
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

    return NextResponse.json({ message: text })
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