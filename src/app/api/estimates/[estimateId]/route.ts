import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

export async function GET(req: NextRequest, { params }: { params: Promise<{ estimateId: string }> }) {
  try {
    const { estimateId } = await params
    const payload = await getPayload({ config: configPromise })

    const estimate = await payload.findByID({
      collection: 'estimates',
      id: estimateId,
      depth: 2, // Include post data with baseRate
    })

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    // Ensure the estimate has proper pricing information
    const post = estimate.post
    if (typeof post === 'object' && post) {
      // If the estimate total is NaN or 0, recalculate it using the post's baseRate
      if (!estimate.total || isNaN(Number(estimate.total)) || Number(estimate.total) === 0) {
        const baseRate = post.baseRate || 150 // Default fallback
        const duration = estimate.fromDate && estimate.toDate 
          ? Math.ceil((new Date(estimate.toDate).getTime() - new Date(estimate.fromDate).getTime()) / (1000 * 60 * 60 * 24))
          : 1
        
        // Update the estimate with the correct total
        const correctedEstimate = await payload.update({
          collection: 'estimates',
          id: estimateId,
          data: {
            total: baseRate * duration
          }
        })
        
        return NextResponse.json(correctedEstimate)
      }
    }

    return NextResponse.json(estimate)
  } catch (error) {
    console.error('Error fetching estimate:', error)
    return NextResponse.json(
      { error: 'Failed to fetch estimate' },
      { status: 500 }
    )
  }
}
