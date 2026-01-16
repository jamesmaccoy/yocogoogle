'use client'

import React, { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { PageAIAssistant } from '@/components/AIAssistant/PageAIAssistant'

interface BookingsAIAssistantProps {
  userId: string
  upcomingBookings: any[]
  pastBookings: any[]
}

export function BookingsAIAssistant({ userId, upcomingBookings, pastBookings }: BookingsAIAssistantProps) {
  const [insights, setInsights] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true)
        const [insightsResponse, estimateResponse] = await Promise.all([
          fetch('/api/tracking-insights'),
          fetch(`/api/estimates/latest?userId=${userId}`)
        ])
        
        const insightsData = await insightsResponse.json()
        const latestEstimate = estimateResponse.ok ? await estimateResponse.json() : null
        
        // Get estimate link if available
        let estimateLink: { postSlug: string; estimateId: string } | null = null
        if (latestEstimate) {
          const post = typeof latestEstimate.post === 'object' ? latestEstimate.post : null
          const postSlug = post?.slug
          if (postSlug && latestEstimate.id) {
            estimateLink = {
              postSlug,
              estimateId: latestEstimate.id
            }
          }
        }
        
        // Transform the API response
        const stats = insightsData.stats
        const transformedInsights = {
          engagementScore: stats.engagementScore || 0,
          totalBookings: stats.bookings?.totalBookings || 0,
          favoriteProperty: stats.bookings?.favoriteProperties?.[0]?.title || 'No bookings yet',
          popularAddon: stats.addons?.popularAddons?.[0]?.name || 'No addons purchased',
          estimateLink,
        }
        
        setInsights(transformedInsights)
      } catch (error) {
        console.error('Error fetching insights:', error)
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchInsights()
    }
  }, [userId])

  return (
    <div className="w-full mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-purple-500" />
        <h2 className="text-xl font-bold text-foreground">
          AI Assistant
        </h2>
      </div>

      <PageAIAssistant
        context={{
          type: 'bookings',
          data: {
            bookings: {
              upcoming: upcomingBookings,
              past: pastBookings,
            },
            insights: insights,
          },
        }}
      />
    </div>
  )
}

