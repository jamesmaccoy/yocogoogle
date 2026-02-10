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
    
    const body = await request.json()
    
    const updated = await payload.update({
      collection: 'packages',
      id,
      data: body,
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
