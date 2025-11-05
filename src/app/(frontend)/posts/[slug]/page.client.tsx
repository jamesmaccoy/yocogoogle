'use client'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'
import { useHeaderTheme } from '@/providers/HeaderTheme'
import React, { useEffect } from 'react'

interface PageClientProps {
  post?: {
    id: string
    title: string
    content: any
    meta?: {
      title?: string | null
      image?: (string | null) | any
      description?: string | null
    }
    baseRate?: number | null
    relatedPosts?: any[]
  }
}

const PageClient: React.FC<PageClientProps> = ({ post }) => {
  /* Force the header to be dark mode while we have an image behind it */
  const { setHeaderTheme } = useHeaderTheme()

  useEffect(() => {
    setHeaderTheme('dark')
  }, [setHeaderTheme])

  // Create post context for AI Assistant
  const getPostContext = () => {
    if (!post) return null
    
    return {
      context: 'post-article',
      post: {
        id: post.id,
        title: post.title,
        description: post.meta?.description || '',
        content: post.content,
        baseRate: post.baseRate,
        relatedPosts: post.relatedPosts || []
      }
    }
  }

  return (
    <>
      <AIAssistant />
      
      {/* Set context for AI Assistant */}
      {post && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                const context = ${JSON.stringify(getPostContext())};
                window.postContext = context;
              });
            `
          }}
        />
      )}
    </>
  )
}

export default PageClient
