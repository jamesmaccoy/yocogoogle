import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    
    const payload = await getPayload({ config: configPromise })

    // Fetch recent estimates
    const estimates = await payload.find({
      collection: 'estimates',
      sort: '-updatedAt',
      limit: 100, // Get more estimates to find ones with activity
      depth: 1,
    })

    // Collect all activity entries from estimates
    const allActivity: Array<{
      id: string
      estimateId: string
      estimateTitle: string
      user: string
      userName: string
      type: string
      content: string
      timestamp: string
    }> = []

    estimates.docs.forEach((estimate) => {
      if (estimate.activity && Array.isArray(estimate.activity)) {
        estimate.activity.forEach((activity) => {
          if (activity && activity.timestamp) {
            allActivity.push({
              id: activity.id || `${estimate.id}-${activity.timestamp}`,
              estimateId: estimate.id,
              estimateTitle: estimate.title || 'Untitled Estimate',
              user: typeof activity.user === 'string' ? activity.user : activity.user?.id || '',
              userName: activity.userName || 'Unknown User',
              type: activity.type || 'comment',
              content: activity.content || '',
              timestamp: activity.timestamp,
            })
          }
        })
      }
    })

    // Sort by timestamp (newest first) and limit
    const latestActivity = allActivity
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)

    return NextResponse.json({ activity: latestActivity })
  } catch (error) {
    console.error('Error fetching latest activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch latest activity' },
      { status: 500 }
    )
  }
}

