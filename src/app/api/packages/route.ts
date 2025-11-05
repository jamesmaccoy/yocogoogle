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
    
    const body = await request.json()
    
    const packageDoc = await payload.create({
      collection: 'packages',
      data: body,
      user,
    })
    
    return NextResponse.json(packageDoc)
  } catch (error) {
    console.error('Error creating package:', error)
    return NextResponse.json(
      { error: 'Failed to create package' },
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