'use client'

import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sparkles, ArrowUpIcon, Mic, Loader2, Package, Calendar, TrendingUp, Home, Star } from 'lucide-react'
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { useUserContext } from '@/context/UserContext'
import { useSubscription } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'

interface PageAIAssistantProps {
  context?: {
    type: 'account' | 'manage' | 'bookings'
    data?: any
  }
  placeholder?: string
  className?: string
  showActions?: boolean
}

export function PageAIAssistant({ context, placeholder, className, showActions = true }: PageAIAssistantProps) {
  const { currentUser } = useUserContext()
  const { isSubscribed } = useSubscription()
  const router = useRouter()
  const pathname = usePathname()

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [lastResponse, setLastResponse] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  const userRole = useMemo(() => 
    Array.isArray(currentUser?.role) ? currentUser?.role : [currentUser?.role].filter(Boolean),
    [currentUser]
  )
  const isHostOrAdmin = userRole.includes('host') || userRole.includes('admin')
  const subscriptionPlan = currentUser?.subscriptionStatus?.plan || 'none'

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported')
      return
    }

    try {
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event: any) => {
        let transcript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        setInput(transcript)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current.onerror = () => {
        setIsListening(false)
      }

      recognitionRef.current.start()
      setIsListening(true)
    } catch (error) {
      console.error('Error starting speech recognition:', error)
      setIsListening(false)
    }
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }, [])

  const sendMessage = async (messageToSend: string) => {
    if (isLoading) return
    
    setIsLoading(true)
    setLastResponse(null)

    try {
      // Build context payload based on page type
      let contextPayload: any = {
        message: messageToSend,
        context: context?.type || 'general',
        tier: subscriptionPlan,
        isHost: isHostOrAdmin,
        path: pathname,
      }

      // Add page-specific context
      if (context?.type === 'account' && context.data) {
        contextPayload.pageData = {
          user: {
            name: currentUser?.name,
            email: currentUser?.email,
            roles: userRole,
            subscription: isSubscribed ? 'Active' : 'None',
          },
          transactions: context.data.transactions || [],
          products: context.data.products || [],
        }
      } else if (context?.type === 'manage' && context.data) {
        contextPayload.pageData = {
          posts: context.data.posts || [],
          latestEstimatePostId: context.data.latestEstimatePostId || null,
        }
      } else if (context?.type === 'bookings' && context.data) {
        contextPayload.pageData = {
          bookings: context.data.bookings || [],
          insights: context.data.insights || null,
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contextPayload),
      })

      const data = await response.json()
      setLastResponse(data.message || data.response || 'I am here to help you.')
    } catch (error) {
      console.error('AI Assistant Error:', error)
      setLastResponse('Sorry, I encountered an error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const messageToSend = input.trim()
    setInput('')
    await sendMessage(messageToSend)
  }

  const handleActionClick = (action: string) => {
    sendMessage(action)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const defaultPlaceholder = useMemo(() => {
    if (context?.type === 'account') {
      return 'Ask about bookings, payments, features...'
    } else if (context?.type === 'manage') {
      return 'Ask about packages, statements, or management...'
    } else if (context?.type === 'bookings') {
      return 'Ask about your bookings, estimates, or recommendations...'
    }
    return 'Ask, Search or Chat...'
  }, [context])

  const getActionButtons = () => {
    if (!showActions || !context) return null

    if (context.type === 'bookings') {
      const insights = context.data?.insights
      return (
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionClick('Show me available packages')}
            className="text-xs"
          >
            <Package className="h-3 w-3 mr-1.5" />
            Show Packages
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionClick('What are my upcoming bookings?')}
            className="text-xs"
          >
            <Calendar className="h-3 w-3 mr-1.5" />
            My Bookings
          </Button>
          {insights?.estimateLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/posts/${insights.estimateLink.postSlug}?restoreEstimate=${insights.estimateLink.estimateId}`)}
              className="text-xs"
            >
              <Sparkles className="h-3 w-3 mr-1.5" />
              Restore Estimate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionClick('Give me recommendations for my next booking')}
            className="text-xs"
          >
            <TrendingUp className="h-3 w-3 mr-1.5" />
            Recommendations
          </Button>
        </div>
      )
    } else if (context.type === 'account') {
      return (
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionClick('Show my transaction history')}
            className="text-xs"
          >
            <Calendar className="h-3 w-3 mr-1.5" />
            Transactions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionClick('What subscription features do I have?')}
            className="text-xs"
          >
            <Package className="h-3 w-3 mr-1.5" />
            My Features
          </Button>
        </div>
      )
    } else if (context.type === 'manage') {
      return (
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionClick('Show my packages')}
            className="text-xs"
          >
            <Package className="h-3 w-3 mr-1.5" />
            My Packages
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionClick('Show booking statement')}
            className="text-xs"
          >
            <Calendar className="h-3 w-3 mr-1.5" />
            Statement
          </Button>
        </div>
      )
    }

    return null
  }

  return (
    <div className={cn("space-y-4", className)}>
      {getActionButtons()}
      
      {lastResponse && (
        <div className="rounded-lg border border-primary/20 bg-card p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shadow-sm">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground leading-relaxed">
                {lastResponse}
              </p>
            </div>
          </div>
        </div>
      )}

      <InputGroup className="shadow-sm">
        <InputGroupTextarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          className="min-h-[60px] max-h-[120px] py-3"
          disabled={isLoading}
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton
            variant={isListening ? 'destructive' : 'outline'}
            size="icon-xs"
            onClick={isListening ? stopListening : startListening}
            type="button"
            className="rounded-full"
          >
            <Mic className="h-3.5 w-3.5" />
          </InputGroupButton>
          <Separator orientation="vertical" className="!h-4" />
          <InputGroupButton
            variant="default"
            size="icon-xs"
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            className="rounded-full"
            type="button"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpIcon className="h-3.5 w-3.5" />
            )}
            <span className="sr-only">Send</span>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

