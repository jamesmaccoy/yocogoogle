import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { searchParams } = new URL(request.url)
    
    // Build where clause from query parameters
    const where: any = {}
    
    // Handle post filter
    const postId = searchParams.get('where[post][equals]')
    if (postId) {
      where.post = { equals: postId }
    }
    
    // Handle isEnabled filter
    const isEnabled = searchParams.get('where[isEnabled][equals]')
    if (isEnabled !== null) {
      where.isEnabled = { equals: isEnabled === 'true' }
    }
    
    const packages = await payload.find({
      collection: 'packages',
      where: Object.keys(where).length > 0 ? where : undefined,
      depth: 2, // Increased depth to include related page data
    })
    
    return NextResponse.json(packages)
  } catch (error) {
    console.error('Error fetching packages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch packages' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Handle both JSON and form data requests
    const contentType = request.headers.get('content-type') || ''
    let body: any = {}
    
    if (contentType.includes('application/json')) {
      try {
        const bodyText = await request.text()
        if (!bodyText || bodyText.trim() === '' || bodyText === '-') {
          return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
        }
        body = JSON.parse(bodyText)
      } catch (error) {
        console.error('JSON parse error:', error)
        return NextResponse.json(
          { error: 'Invalid JSON in request body', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 400 }
        )
      }
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      // Handle form data requests
      try {
        const formData = await request.formData()
        
        // Convert FormData to regular object
        for (const [key, value] of formData.entries()) {
          if (key.includes('[') && key.includes(']')) {
            // Handle nested form fields like "meta[title]"
            const match = key.match(/^(\w+)\[(\w+)\]$/)
            if (match && match.length >= 3) {
              const parentKey = match[1]
              const childKey = match[2]
              if (parentKey && childKey) {
                if (!body[parentKey]) body[parentKey] = {}
                body[parentKey][childKey] = value
              }
            } else {
              body[key] = value
            }
          } else {
            body[key] = value
          }
        }
      } catch (error) {
        console.error('Form data parse error:', error)
        return NextResponse.json(
          { error: 'Invalid form data in request body', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 400 }
        )
      }
    } else {
      // Try to parse as JSON as fallback
      try {
        const bodyText = await request.text()
        if (bodyText && bodyText.trim() !== '' && bodyText !== '-') {
          body = JSON.parse(bodyText)
        }
      } catch (error) {
        console.error('Fallback JSON parse error:', error)
        return NextResponse.json(
          { error: 'Invalid request body format', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 400 }
        )
      }
    }
    
    const packageDoc = await payload.create({
      collection: 'packages',
      data: body,
      user,
    })
    
    return NextResponse.json(packageDoc)
  } catch (error) {
    console.error('Error creating package:', error)
    return NextResponse.json(
      { error: 'Failed to create package', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    
    // Try to get the user from the request
    let user = null
    try {
      const authResult = await payload.auth({ headers: request.headers })
      user = authResult.user
    } catch (authError) {
      console.log('Authentication failed, trying admin context:', authError)
      // If authentication fails, this might be an admin request
    }
    
    const { searchParams } = new URL(request.url)
    const ids = searchParams.getAll('where[id][in][]')
    
    console.log('DELETE request for packages:', { ids, user: user?.id ? '[REDACTED]' : 'admin' })
    
    if (!ids || ids.length === 0) {
      return NextResponse.json(
        { error: 'No package IDs provided' },
        { status: 400 }
      )
    }
    
    // Delete packages one by one
    const deletedPackages = []
    const failedPackages = []
    
    for (const id of ids) {
      try {
        console.log(`Attempting to delete package: ${id}`)
        
        // For admin requests, we might not have a user object
        const deleteOptions: any = {
          collection: 'packages',
          id,
        }
        
        if (user) {
          deleteOptions.user = user
        }
        
        const deletedPackage = await payload.delete(deleteOptions)
        deletedPackages.push(deletedPackage)
        console.log(`Successfully deleted package: ${id}`)
      } catch (error) {
        console.error(`Error deleting package ${id}:`, error)
        failedPackages.push({ id, error: error instanceof Error ? error.message : 'Unknown error' })
        // Continue with other deletions even if one fails
      }
    }
    
    const response = {
      message: `Successfully deleted ${deletedPackages.length} packages${failedPackages.length > 0 ? `, ${failedPackages.length} failed` : ''}`,
      deletedPackages,
      failedPackages: failedPackages.length > 0 ? failedPackages : undefined,
    }
    
    console.log('DELETE response:', response)
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error deleting packages:', error)
    return NextResponse.json(
      { error: 'Failed to delete packages', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 