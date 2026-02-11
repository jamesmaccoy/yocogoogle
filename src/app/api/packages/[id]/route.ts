import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const payload = await getPayload({ config: configPromise })
    
    // Get depth from query params, default to 2
    const searchParams = new URL(request.url).searchParams
    const depth = parseInt(searchParams.get('depth') || '2', 10)
    
    // Check authentication
    let user = null
    try {
      const authResult = await payload.auth({ headers: request.headers })
      user = authResult.user
    } catch (authError) {
      // User not authenticated
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to access packages.' },
        { status: 401 }
      )
    }
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to access packages.' },
        { status: 401 }
      )
    }
    
    // Fetch the package
    const packageDoc = await payload.findByID({
      collection: 'packages',
      id: id,
      depth: depth,
      user, // Pass user for access control
    })
    
    if (!packageDoc) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }
    
    return NextResponse.json(packageDoc)
  } catch (error) {
    console.error('Error fetching package:', error)
    return NextResponse.json(
      { error: 'Failed to fetch package', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Parse JSON with better error handling
    let body: any
    let requestText: string = ''
    try {
      requestText = await request.text()
      if (!requestText || requestText.trim() === '') {
        return NextResponse.json(
          { error: 'Request body is empty' },
          { status: 400 }
        )
      }
      body = JSON.parse(requestText)
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError)
      console.error('Request body:', requestText || 'Unable to read body')
      return NextResponse.json(
        { 
          error: 'Invalid JSON in request body', 
          details: jsonError instanceof Error ? jsonError.message : 'Unknown JSON parse error' 
        },
        { status: 400 }
      )
    }
    
    // Validate and sanitize the data
    const cleanData: any = {}
    
    // Handle post field - if it's a slug or title, look up the ID
    if (body.post !== undefined) {
      if (typeof body.post === 'string') {
        // Check if it's already an ID (MongoDB ObjectId format)
        if (/^[0-9a-fA-F]{24}$/.test(body.post)) {
          cleanData.post = body.post
        } else {
          // It's likely a slug or title, try to find the post
          try {
            // First try by slug
            let posts = await payload.find({
              collection: 'posts',
              where: {
                slug: {
                  equals: body.post,
                },
              },
              limit: 1,
            })
            
            // If not found by slug, try by title (case-insensitive, partial match)
            if (posts.docs.length === 0) {
              posts = await payload.find({
                collection: 'posts',
                where: {
                  title: {
                    contains: body.post,
                  },
                },
                limit: 1,
              })
            }
            
            if (posts.docs.length > 0) {
              cleanData.post = posts.docs[0].id
              console.log(`Found post "${posts.docs[0].title}" (${posts.docs[0].id}) for query "${body.post}"`)
            } else {
              return NextResponse.json(
                { error: `Post with slug or title "${body.post}" not found` },
                { status: 404 }
              )
            }
          } catch (postError) {
            console.error('Error looking up post:', postError)
            return NextResponse.json(
              { error: 'Failed to look up post', details: postError instanceof Error ? postError.message : 'Unknown error' },
              { status: 500 }
            )
          }
        }
      } else if (typeof body.post === 'object' && body.post?.id) {
        cleanData.post = body.post.id
      } else if (body.post === null) {
        // Allow null to clear the post field
        return NextResponse.json(
          { error: 'Post field is required and cannot be null' },
          { status: 400 }
        )
      } else {
        return NextResponse.json(
          { error: 'Invalid post field format. Expected string ID, slug, or title; or object with id property.' },
          { status: 400 }
        )
      }
    }
    
    // Copy other fields that are safe to update
    const allowedFields = [
      'name',
      'description',
      'multiplier',
      'category',
      'entitlement',
      'minNights',
      'maxNights',
      'maxConcurrentBookings',
      'baseRate',
      'isEnabled',
      'revenueCatId',
      'yocoId',
      'relatedPage',
      'features',
    ]
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        cleanData[field] = body[field]
      }
    }
    
    console.log('Updating package with clean data:', JSON.stringify(cleanData, null, 2))
    
    const updated = await payload.update({
      collection: 'packages',
      id,
      data: cleanData,
      user,
    })
    
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating package:', error)
    return NextResponse.json(
      { error: 'Failed to update package', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const deleted = await payload.delete({
      collection: 'packages',
      id,
      user,
    })
    
    return NextResponse.json({ success: true, deleted })
  } catch (error) {
    console.error('Error deleting package:', error)
    return NextResponse.json(
      { error: 'Failed to delete package', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
