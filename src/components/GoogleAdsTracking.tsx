'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { trackBookingConversionGoogleAds } from '@/lib/googleAdsTracking'

/**
 * Client-side Google Ads tracking component
 * Tracks conversions and events that need to happen in the browser
 * Must be wrapped in Suspense boundary
 */
export function GoogleAdsTracking() {
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check for booking confirmation parameters
    const success = searchParams.get('success')
    const estimateId = searchParams.get('estimateId')
    const total = searchParams.get('total')
    const postId = searchParams.get('postId')
    const postTitle = searchParams.get('postTitle')
    const packageType = searchParams.get('packageType')

    // Track booking conversion if this is a successful booking
    if (success === 'true' && estimateId && total) {
      const bookingValue = parseFloat(total) || 0
      trackBookingConversionGoogleAds({
        bookingId: estimateId,
        bookingValue,
        postId: postId || undefined,
        postTitle: postTitle || undefined,
        packageType: packageType || undefined,
      })
    }
  }, [searchParams])

  return null // This component doesn't render anything
}

/**
 * Hook to track estimate view (call from client components)
 */
export function useEstimateTracking() {
  const trackEstimate = (params: {
    estimateId?: string
    estimateValue?: number
    postId?: string
    postTitle?: string
    packageType?: string
  }) => {
    trackEstimateViewGoogleAds(params)
  }

  return { trackEstimate }
}

