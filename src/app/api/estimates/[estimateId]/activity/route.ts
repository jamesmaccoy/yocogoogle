import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { getMeUser } from '@/utilities/getMeUser'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  try {
    const { estimateId } = await params
    const payload = await getPayload({ config: configPromise })

    // Fetch the estimate with activity (depth 2 to populate user objects)
    const estimate = await payload.findByID({
      collection: 'estimates',
      id: estimateId,
      depth: 2,
    })

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    // Return activity sorted by timestamp (newest first) with user email
    const activity = estimate.activity && Array.isArray(estimate.activity)
      ? estimate.activity
          .map((entry: any) => ({
            ...entry,
            userEmail: typeof entry.user === 'object' && entry.user ? entry.user.email : null,
          }))
          .sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
      : []

    return NextResponse.json({ activity })
  } catch (error) {
    console.error('Error fetching activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  try {
    const { estimateId } = await params
    const { user } = await getMeUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type = 'comment', content } = body

    if (!content && type === 'comment') {
      return NextResponse.json(
        { error: 'Content is required for comments' },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config: configPromise })

    // Fetch the estimate
    const estimate = await payload.findByID({
      collection: 'estimates',
      id: estimateId,
      depth: 1,
    })

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    // Check authorization
    const isCustomer =
      typeof estimate.customer === 'string'
        ? estimate.customer === user.id
        : estimate.customer?.id === user.id

    const isGuest =
      estimate.guests &&
      Array.isArray(estimate.guests) &&
      estimate.guests.some(
        (guest) =>
          (typeof guest === 'string' ? guest : guest.id) === user.id
      )

    if (!isCustomer && !isGuest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get user name for caching
    const userName = user.name || user.email || 'Unknown User'

    // Create new activity entry
    const newActivity = {
      user: user.id,
      userName,
      userEmail: user.email || null,
      type,
      content: content || '',
      timestamp: new Date().toISOString(),
    }

    // Get existing activity or initialize empty array
    const existingActivity = estimate.activity && Array.isArray(estimate.activity)
      ? estimate.activity
      : []

    // Update estimate with new activity
    const updatedEstimate = await payload.update({
      collection: 'estimates',
      id: estimateId,
      data: {
        activity: [...existingActivity, newActivity],
      },
    })

    return NextResponse.json({
      success: true,
      activity: updatedEstimate.activity,
    })
  } catch (error) {
    console.error('Error adding activity to estimate:', error)
    return NextResponse.json(
      { error: 'Failed to add activity' },
      { status: 500 }
    )
  }
}

