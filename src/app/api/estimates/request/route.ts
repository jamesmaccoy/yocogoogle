import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'
import { sendEstimateRequestNotification } from '@/lib/emailNotifications'

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getMeUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await getPayload({ config: configPromise })
    const data = await req.json()
    
    const { 
      postId, 
      fromDate, 
      toDate, 
      customerId, 
      customerName, 
      customerEmail, 
      bookingId, 
      propertyTitle 
    } = data

    console.log('Creating estimate request with data:', { 
      postId, 
      fromDate, 
      toDate, 
      customerId, 
      customerName, 
      customerEmail, 
      bookingId, 
      propertyTitle 
    })

    if (!postId || !fromDate || !toDate) {
      return NextResponse.json({ 
        error: 'Post ID, from date, and to date are required' 
      }, { status: 400 })
    }

    // First, fetch the post to ensure it exists and get its data
    try {
      console.log('Attempting to fetch post with ID:', postId)
      
      const post = await payload.findByID({
        collection: 'posts',
        id: postId,
      })

      if (!post) {
        console.error('Post not found:', postId)
        return NextResponse.json({ 
          error: `Post with ID ${postId} not found in database` 
        }, { status: 404 })
      }

      console.log('Found post:', { id: post.id, title: post.title })

      // Create estimate request in Payload CMS
      console.log('Creating estimate request with post:', { postId: post.id, title: post.title })
      
      // Get available packages for this post to include in the request
      const packagesResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/packages/post/${post.id}`)
      const packagesData = packagesResponse.ok ? await packagesResponse.json() : { packages: [] }
      const availablePackages = packagesData.packages || []
      
      const estimateRequest = await payload.create({
        collection: "estimates",
        data: {
          title: `New estimate request for ${propertyTitle}`,
          post: post.id,
          fromDate,
          toDate,
          customer: currentUser.user.id,
          status: 'pending',
          requestType: 'new_estimate',
          originalBooking: bookingId,
          customerName,
          customerEmail,
          notes: `Customer ${customerName} (${customerEmail}) is requesting a new estimate for different dates. Original booking ID: ${bookingId}. Available packages: ${availablePackages.length} packages including ${availablePackages.filter((pkg: any) => pkg.isEnabled).map((pkg: any) => pkg.name).join(', ')}`
        },
      })

      console.log('Created estimate request:', { id: estimateRequest.id })

      // Send notification email to host
      try {
        // Get the post owner/host information
        const host = typeof post.author === 'string' ? 
          await payload.findByID({ collection: 'users', id: post.author }) :
          post.author

        if (host && typeof host === 'object' && host.email) {
          // Send notification email to host
          await sendEstimateRequestNotification({
            hostEmail: host.email,
            hostName: host.name || 'Host',
            customerName,
            customerEmail,
            propertyTitle,
            fromDate,
            toDate,
            estimateRequestId: estimateRequest.id
          })
        }
      } catch (emailError) {
        console.error('Error sending notification email:', emailError)
        // Don't fail the request if email fails
      }

      // Fetch the created estimate request with populated relationships
      const populatedEstimateRequest = await payload.findByID({
        collection: 'estimates',
        id: estimateRequest.id,
        depth: 2,
      })

      console.log('Fetched populated estimate request:', { id: populatedEstimateRequest.id })

      return NextResponse.json({
        success: true,
        estimateRequest: populatedEstimateRequest,
        message: 'Estimate request submitted successfully. The host will be notified.'
      })
    } catch (error) {
      console.error('Error in estimate request operation:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        postId: postId
      })
      return NextResponse.json(
        { error: `Error in estimate request operation: ${(error as Error).message}. PostId: ${postId}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in estimate request creation:', error)
    return NextResponse.json(
      { error: 'Failed to create estimate request: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
