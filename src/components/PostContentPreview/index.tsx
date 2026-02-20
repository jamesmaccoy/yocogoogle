'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { Lock, Clock, User, ChevronRight } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { formatDateTime } from '@/utilities/formatDateTime'
import { formatAuthors } from '@/utilities/formatAuthors'
import type { Post } from '@/payload-types'

// Extract plain text from Lexical editor content structure
const extractPlainTextFromContent = (content: any, depth = 0): string => {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (typeof content === 'number' || typeof content === 'boolean') return String(content)
  if (Array.isArray(content)) {
    return content.map((c) => extractPlainTextFromContent(c, depth + 1)).filter(Boolean).join(' ')
  }
  if (typeof content === 'object') {
    const textParts: string[] = []
    if (typeof (content as any).text === 'string') {
      textParts.push((content as any).text)
    }
    if ((content as any).children) {
      textParts.push(extractPlainTextFromContent((content as any).children, depth + 1))
    }
    // Handle Lexical root structure
    const candidateKeys = ['content', 'value', 'fields', 'data', 'root']
    for (const key of candidateKeys) {
      if ((content as any)[key] && typeof (content as any)[key] !== 'function') {
        textParts.push(extractPlainTextFromContent((content as any)[key], depth + 1))
      }
    }
    return textParts.filter(Boolean).join(' ')
  }
  return ''
}

// Extract preview text (first 2-3 paragraphs) from post content
const getContentPreview = (post: Post): string[] => {
  // Try to extract from content first
  if (post.content && typeof post.content === 'object' && post.content.root) {
    const text = extractPlainTextFromContent(post.content.root)
    if (text.trim()) {
      // Split into paragraphs and get first 2-3 paragraphs
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)
      if (paragraphs.length > 0) {
        // Get first 2 paragraphs or first ~400 characters
        const preview: string[] = []
        let totalLength = 0
        const maxLength = 400
        
        for (const para of paragraphs.slice(0, 3)) {
          if (totalLength + para.length <= maxLength) {
            preview.push(para.trim())
            totalLength += para.length
          } else {
            // Add partial paragraph if we have space
            const remaining = maxLength - totalLength
            if (remaining > 50) {
              preview.push(para.substring(0, remaining).trim() + '...')
            }
            break
          }
        }
        
        return preview.length > 0 ? preview : [text.substring(0, 400).trim() + '...']
      }
    }
  }
  
  // Fallback to meta description
  if (post.meta?.description) {
    return [post.meta.description]
  }
  
  return []
}

// Calculate read time (average reading speed: 200 words per minute)
const calculateReadTime = (text: string): number => {
  const words = text.split(/\s+/).filter(word => word.length > 0).length
  const minutes = Math.ceil(words / 200)
  return Math.max(1, minutes) // Minimum 1 minute
}

export const PostContentPreview: React.FC<{
  post: Post
}> = ({ post }) => {
  const { isSubscribed, isLoading: isSubscriptionLoading } = useSubscription()

  // Get content preview for non-subscribers
  const contentPreview = useMemo(() => getContentPreview(post), [post])
  const showPreview = !isSubscriptionLoading && !isSubscribed && contentPreview.length > 0

  // Get category label (first category)
  const categoryLabel = post.categories && Array.isArray(post.categories) && post.categories.length > 0
    ? typeof post.categories[0] === 'object' && post.categories[0] !== null
      ? (post.categories[0] as any).title || 'STAYS'
      : 'STAYS'
    : 'STAYS'

  // Get author info
  const hasAuthors = post.populatedAuthors && Array.isArray(post.populatedAuthors) && post.populatedAuthors.length > 0
  const authorName = hasAuthors ? formatAuthors(post.populatedAuthors) : 'The Team'

  // Calculate read time
  const fullText = post.content && typeof post.content === 'object' && post.content.root
    ? extractPlainTextFromContent(post.content.root)
    : ''
  const readTime = fullText ? calculateReadTime(fullText) : 5

  if (!showPreview) {
    return null
  }

  return (
    <div className="w-full max-w-[672px] mx-auto mt-16 mb-12">
      <div className="relative bg-white">
        {/* Editorial Header */}
        <div className="mb-8">
          <span className="inline-block text-xs font-bold tracking-widest text-[rgb(20,184,166)] mb-3">
            {categoryLabel.toUpperCase()}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-[rgb(15,23,42)] mb-4 leading-tight">
            {post.title}
          </h1>

          {/* Meta Row */}
          <div className="flex items-center gap-4 text-sm text-[rgb(100,116,139)]">
            {hasAuthors && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="w-3 h-3 text-gray-500" />
                  </div>
                  <span className="font-medium text-[rgb(15,23,42)]">
                    {authorName}
                  </span>
                </div>
                <span>·</span>
              </>
            )}
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{readTime} min read</span>
            </div>
            {post.publishedAt && (
              <>
                <span>·</span>
                <span>{formatDateTime(post.publishedAt)}</span>
              </>
            )}
          </div>
        </div>

        <hr className="border-gray-100 mb-8" />

        {/* Excerpt with Fade */}
        <div
          className="relative overflow-hidden"
          style={{
            maxHeight: '220px',
          }}
        >
          {contentPreview.map((paragraph, index) => (
            <p key={index} className="text-lg leading-8 text-[rgb(51,65,85)] mb-4">
              {paragraph}
            </p>
          ))}
          {/* Gradient Fade */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
        </div>

        {/* Subscribe Gate */}
        <div className="mt-0 border-t border-gray-100 pt-10 pb-2 text-center">
          <div className="w-12 h-12 bg-[rgb(240,253,250)] rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-[rgb(20,184,166)]" />
          </div>
          <h3 className="text-xl font-bold text-[rgb(15,23,42)] mb-2">
            This post is for subscribers
          </h3>
          <p className="text-[rgb(100,116,139)] mb-6 max-w-sm mx-auto text-sm leading-relaxed">
            Subscribe to read the full story and get access to all member content, including exclusive retreat offers.
          </p>
          <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
            <Link
              href="/subscribe"
              className="w-full bg-[rgb(20,184,166)] hover:bg-[rgb(13,148,136)] text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 no-underline"
            >
              Subscribe — from R99/month
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-[rgb(100,116,139)] hover:text-[rgb(15,23,42)] transition-colors no-underline"
            >
              Already a member? Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

