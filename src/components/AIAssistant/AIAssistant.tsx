'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Context as AIContextCard, ContextTrigger, ContextContent } from '@/components/ai-elements/context'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Bot, Send, X, Mic, MicOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUserContext } from '@/context/UserContext'
import { useSubscription } from '@/hooks/useSubscription'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanTrigger,
  PlanContent,
  PlanFooter,
  PlanAction,
} from '@/components/ai-elements/plan'
import {
  PromptInput,
  PromptInputHeader,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSpeechButton,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  length: number
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: (event: SpeechRecognitionEvent) => void
  onend: () => void
  onerror: (event: any) => void
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  propertySuggestions?: {
    fromDate: string
    toDate: string
    properties: Array<{
      id: string
      title: string
      slug: string
      description?: string
      baseRate?: number
      categories?: string
    }>
  }
}

interface PackageSuggestion {
  revenueCatId: string
  suggestedName: string
  description: string
  features: string[]
  baseRate?: number
  details: {
    minNights?: number
    maxNights?: number
    multiplier?: number
    category?: string
    customerTierRequired?: string
    features?: string
  }
}

interface TokenUsageDetails {
  total: number | null
  prompt: number | null
  candidates: number | null
  cached: number | null
  thoughts: number | null
  timestamp: number
}

// LoadingDots replaced with AI Elements Loader component

export const AIAssistant = () => {
  const { currentUser } = useUserContext()
  const isLoggedIn = !!currentUser
  const { isSubscribed } = useSubscription()
  const router = useRouter()
  const pathname = usePathname()
  
  // Determine if user has basic, pro, or enterprise subscription
  const userRole = Array.isArray(currentUser?.role) ? currentUser?.role : [currentUser?.role].filter(Boolean)
  const isHostOrAdmin = userRole.includes('host') || userRole.includes('admin')
  const subscriptionPlan = currentUser?.subscriptionStatus?.plan || 'none'
  const hasStandardOrPro = isSubscribed && (subscriptionPlan === 'basic' || subscriptionPlan === 'pro' || subscriptionPlan === 'enterprise' || isHostOrAdmin)
  
  const normalizeTokenUsage = (usage: any): TokenUsageDetails | null => {
    if (!usage || typeof usage !== 'object') return null

    const normalize = (value: any) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null

    const normalized: TokenUsageDetails = {
      total: normalize(usage.total),
      prompt: normalize(usage.prompt),
      candidates: normalize(usage.candidates),
      cached: normalize(usage.cached),
      thoughts: normalize(usage.thoughts),
      timestamp: Date.now(),
    }

    const hasData = [
      normalized.total,
      normalized.prompt,
      normalized.candidates,
      normalized.cached,
      normalized.thoughts,
    ].some((value) => value !== null)

    return hasData ? normalized : null
  }

  const appendUsageToContent = (content: string, usage: TokenUsageDetails | null) => {
    if (!usage || usage.total === null) return content

    const detailParts: string[] = []

    if (usage.prompt !== null) detailParts.push(`prompt ${usage.prompt}`)
    if (usage.candidates !== null) detailParts.push(`response ${usage.candidates}`)
    if (usage.cached !== null) detailParts.push(`cached ${usage.cached}`)
    if (usage.thoughts !== null) detailParts.push(`thoughts ${usage.thoughts}`)

    const details =
      detailParts.length > 0 ? ` (${detailParts.join(', ')})` : ''

    return `${content}<div class="mt-2 text-xs text-muted-foreground">Tokens used: ${usage.total}${details}</div>`
  }

  const persistTokenUsage = (usage: TokenUsageDetails | null) => {
    if (!usage || typeof window === 'undefined') return

    try {
      window.localStorage.setItem('ai:lastTokenUsage', JSON.stringify(usage))
      window.dispatchEvent(new CustomEvent('aiTokenUsage', { detail: usage }))
    } catch (error) {
      console.warn('Failed to persist AI token usage', error)
    }
  }
  
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [packageSuggestions, setPackageSuggestions] = useState<PackageSuggestion[]>([])
  const [dateSuggestions, setDateSuggestions] = useState<Array<{ startDate: Date; endDate: Date; label: string }>>([])
  const [currentContext, setCurrentContext] = useState<any>(null)
  const [lastUsage, setLastUsage] = useState<TokenUsageDetails | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const isProcessingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const finalTranscriptRef = useRef('')
  const rescheduleRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeThreadRef = useRef(0)
  const historyKeyRef = useRef<string | null>(null)

  // Naive rich content -> plain text extractor for Payload/lexical-like trees
  const extractPlainTextFromContent = useCallback((content: any, depth = 0): string => {
    if (content == null) return ''
    if (typeof content === 'string') return content
    if (typeof content === 'number' || typeof content === 'boolean') return String(content)
    if (Array.isArray(content)) {
      return content.map((c) => extractPlainTextFromContent(c, depth + 1)).filter(Boolean).join('\n')
    }
    if (typeof content === 'object') {
      // Common rich text shapes: { text }, { children }, blocks with { value }, etc.
      const textParts: string[] = []
      // Handle explicit line breaks from lexical
      if ((content as any).type === 'linebreak') {
        textParts.push('\n')
      }
      // Handle autolink nodes that might only carry a URL
      if ((content as any).type === 'autolink') {
        const url = (content as any)?.fields?.url
        if (typeof url === 'string' && url.length > 0) {
          textParts.push(url)
        }
      }
      if (typeof (content as any).text === 'string') {
        textParts.push((content as any).text)
      }
      if ((content as any).children) {
        textParts.push(extractPlainTextFromContent((content as any).children, depth + 1))
      }
      // Some Payload blocks store content under fields like "content", "value", or "fields"
      const candidateKeys = ['content', 'value', 'fields', 'data']
      for (const key of candidateKeys) {
        if ((content as any)[key] && typeof (content as any)[key] !== 'function') {
          textParts.push(extractPlainTextFromContent((content as any)[key], depth + 1))
        }
      }
      // Fallback: scan other string props
      for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
        if (k === 'text' || candidateKeys.includes(k) || k === 'children') continue
        if (typeof v === 'string' && v.trim().length > 0) {
          textParts.push(v)
        }
      }
      return textParts.filter(Boolean).join('\n')
    }
    return ''
  }, [])

  const extractAutolinksFromContent = useCallback((content: any): string[] => {
    const urls: string[] = []
    const walk = (node: any) => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      if (typeof node === 'object') {
        if (node.type === 'autolink') {
          const url = node?.fields?.url
          if (typeof url === 'string' && url.length > 0) {
            urls.push(url)
          }
        }
        // traverse common keys
        if (node.children) walk(node.children)
        if (node.content) walk(node.content)
        if (node.value) walk(node.value)
        if (node.fields) walk(node.fields)
        // scan any other nested objects/arrays
        for (const v of Object.values(node as Record<string, unknown>)) {
          if (v && (typeof v === 'object' || Array.isArray(v))) {
            walk(v as any)
          }
        }
      }
    }
    walk(content)
    // de-dupe
    return Array.from(new Set(urls))
  }, [])

  // Subscribe to token usage updates for UI indicator
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem('ai:lastTokenUsage')
      if (raw) {
        setLastUsage(JSON.parse(raw))
      }
    } catch {
      // ignore
    }
    const handler = (e: any) => {
      if (e?.detail) setLastUsage(e.detail as TokenUsageDetails)
    }
    window.addEventListener('aiTokenUsage', handler as EventListener)
    return () => {
      window.removeEventListener('aiTokenUsage', handler as EventListener)
    }
  }, [])

  // Generate date suggestions when on a post page
  useEffect(() => {
    const generateDateSuggestions = async () => {
      if (currentContext?.context !== 'post-article' || !currentContext?.post?.id || !isLoggedIn) {
        setDateSuggestions([])
        return
      }

      try {
        const postId = currentContext.post.id
        const response = await fetch(`/api/bookings/unavailable-dates?postId=${postId}`, {
          credentials: 'include',
        })

        if (!response.ok) {
          setDateSuggestions([])
          return
        }

        const data = await response.json()
        const unavailableDates = new Set(data.unavailableDates || [])

        // Generate date suggestions for common durations
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const suggestions: Array<{ startDate: Date; endDate: Date; label: string }> = []

        // Helper to normalize dates to midnight UTC (matching check-availability.ts)
        const normalizeDate = (date: Date): Date => {
          const normalized = new Date(date)
          normalized.setUTCHours(0, 0, 0, 0)
          return normalized
        }

        // Helper to check if a date range conflicts with unavailable dates
        const hasConflict = (testStart: Date, testEnd: Date): boolean => {
          const checkDate = new Date(testStart)
          while (checkDate < testEnd) {
            const dateStr = checkDate.toISOString()
            if (unavailableDates.has(dateStr)) {
              return true
            }
            checkDate.setUTCDate(checkDate.getUTCDate() + 1)
          }
          return false
        }

        // Generate suggestions for 3, 5, and 7 night stays
        // Spread them across different months for variety
        const durations = [3, 5, 7]
        const todayNormalized = normalizeDate(today)
        
        // Target dates spread across months: 1 week, 1 month, 2 months from now
        const targetDates = [
          new Date(todayNormalized.getTime() + 7 * 24 * 60 * 60 * 1000),   // ~1 week
          new Date(todayNormalized.getTime() + 30 * 24 * 60 * 60 * 1000),  // ~1 month
          new Date(todayNormalized.getTime() + 60 * 24 * 60 * 60 * 1000),  // ~2 months
        ]

        for (const targetDate of targetDates) {
          for (const nights of durations) {
            // Look for available dates around the target date (±7 days)
            const searchWindow = 7
            let found = false
            
            for (let offset = 0; offset <= searchWindow && !found; offset++) {
              // Try dates before and after target
              for (const direction of [-1, 1]) {
                const startDate = new Date(targetDate)
                startDate.setUTCDate(startDate.getUTCDate() + (offset * direction))
                const endDate = new Date(startDate)
                endDate.setUTCDate(endDate.getUTCDate() + nights)

                // Ensure dates are in the future
                if (startDate < todayNormalized) continue

                if (!hasConflict(startDate, endDate)) {
                  const startStr = format(startDate, 'MMM d')
                  const endStr = format(endDate, 'MMM d')
                  suggestions.push({
                    startDate,
                    endDate,
                    label: `${startStr} - ${endStr}`,
                  })
                  found = true
                  break
                }
              }
            }
          }
        }

        // Sort by start date and limit to 6 suggestions
        suggestions.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
        setDateSuggestions(suggestions.slice(0, 6))
      } catch (error) {
        console.error('Error generating date suggestions:', error)
        setDateSuggestions([])
      }
    }

    generateDateSuggestions()
  }, [currentContext, isLoggedIn])

  const formatUsageInline = (usage: TokenUsageDetails | null) => {
    if (!usage || usage.total == null) return null
    const parts: string[] = [`${usage.total}`]
    if (usage.prompt != null) parts.push(`in ${usage.prompt}`)
    if (usage.candidates != null) parts.push(`out ${usage.candidates}`)
    if (usage.cached != null) parts.push(`cache ${usage.cached}`)
    if (usage.thoughts != null) parts.push(`r ${usage.thoughts}`)
    return parts.join(' • ')
  }

  const beginNewThread = useCallback(
    (initialMessages: Message[] = []) => {
      const nextThreadId = activeThreadRef.current + 1
      activeThreadRef.current = nextThreadId
      setPackageSuggestions([])
      setMessages(initialMessages)
      if (typeof window !== 'undefined' && historyKeyRef.current && initialMessages.length > 0) {
        try {
          const existing: any[] = JSON.parse(
            window.localStorage.getItem(historyKeyRef.current) ?? '[]',
          )
          const appended = initialMessages.map((message) => ({
            role: message.role,
            content: message.content,
            timestamp: Date.now(),
            threadId: nextThreadId,
          }))
          const updated = [...existing, ...appended].slice(-50)
          window.localStorage.setItem(historyKeyRef.current, JSON.stringify(updated))
          window.dispatchEvent(
            new CustomEvent('aiHistoryUpdate', {
              detail: { key: historyKeyRef.current, history: updated },
            }),
          )
        } catch (error) {
          console.warn('Failed to persist AI history', error)
        }
      }
      return nextThreadId
    },
    [setMessages, setPackageSuggestions],
  )

  const appendMessageToThread = useCallback(
    (threadId: number, message: Message) => {
      if (activeThreadRef.current !== threadId) return
      setMessages((prev) => [...prev, message])
      if (typeof window !== 'undefined' && historyKeyRef.current) {
        try {
          const existing: any[] = JSON.parse(
            window.localStorage.getItem(historyKeyRef.current) ?? '[]',
          )
          const entry = {
            role: message.role,
            content: message.content,
            timestamp: Date.now(),
            threadId,
          }
          const updated = [...existing, entry].slice(-50)
          window.localStorage.setItem(historyKeyRef.current, JSON.stringify(updated))
          window.dispatchEvent(
            new CustomEvent('aiHistoryUpdate', {
              detail: { key: historyKeyRef.current, history: updated },
            }),
          )
        } catch (error) {
          console.warn('Failed to persist AI history', error)
        }
      }
    },
    [setMessages],
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (
      currentContext?.context === 'booking-details' &&
      currentContext?.booking?.id
    ) {
      const key = `ai:bookingHistory:${currentContext.booking.id}`
      historyKeyRef.current = key
      try {
        const existing: any[] = JSON.parse(window.localStorage.getItem(key) ?? '[]')
        window.dispatchEvent(
          new CustomEvent('aiHistoryUpdate', { detail: { key, history: existing } }),
        )
      } catch {
        // ignore parse errors
      }
    } else {
      historyKeyRef.current = null
    }
  }, [currentContext])

  const setPackageSuggestionsForThread = useCallback(
    (threadId: number, suggestions: PackageSuggestion[]) => {
      if (activeThreadRef.current !== threadId) return
      setPackageSuggestions(suggestions)
    },
    [setPackageSuggestions],
  )

  useEffect(() => {
    // Listen for custom events to open AI Assistant with context
    const handleOpenAIAssistant = (event: CustomEvent) => {
      if (!isLoggedIn) {
        // Redirect to login if not authenticated
        window.location.href = '/login'
        return
      }
      
      setIsOpen(true)
      setCurrentContext(event.detail)
      
      // If there's a predefined message, send it automatically
      if (event.detail?.message) {
        setInput(event.detail.message)
        // Auto-send after a brief delay
        setTimeout(() => {
          handleSubmit(new Event('submit') as any)
        }, 100)
      }
    }

    // Check for context on page load
    const checkContext = () => {
      if ((window as any).bookingContext) {
        setCurrentContext((window as any).bookingContext)
      } else if ((window as any).estimateContext) {
        setCurrentContext((window as any).estimateContext)
      } else if ((window as any).postContext) {
        setCurrentContext((window as any).postContext)
      }
    }

    window.addEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
    // Ensure we also pick up contexts that are set on the window 'load' event
    window.addEventListener('load', checkContext)
    
    // Check for context after a short delay to ensure it's set
    const timeoutId = setTimeout(checkContext, 100)
    
    return () => {
      window.removeEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
      window.removeEventListener('load', checkContext)
      clearTimeout(timeoutId)
    }
  }, [isLoggedIn])

  useEffect(() => {
    return () => {
      if (rescheduleRedirectRef.current) {
        clearTimeout(rescheduleRedirectRef.current)
      }
    }
  }, [])

  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        try {
          recognitionRef.current = new SpeechRecognition()
          recognitionRef.current.continuous = true // Enable continuous recognition
          recognitionRef.current.interimResults = true // Get interim results
          recognitionRef.current.lang = 'en-US'

          recognitionRef.current.onresult = async (event: SpeechRecognitionEvent) => {
            let interimTranscript = ''
            let finalTranscript = ''

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i]
              if (result && result[0]) {
                const transcript = result[0].transcript
                if (result.isFinal) {
                  finalTranscript += transcript
                } else {
                  interimTranscript += transcript
                }
              }
            }

            // Update input with interim results
            setInput(interimTranscript || finalTranscript)

            // If we have a final transcript and we're not already processing
            if (finalTranscript && !isProcessingRef.current) {
              isProcessingRef.current = true
              finalTranscriptRef.current = finalTranscript
              await handleSubmit(new Event('submit') as any)
              isProcessingRef.current = false
            }
          }

          recognitionRef.current.onend = () => {
            if (isListening) {
              // Restart recognition if we're still supposed to be listening
              try {
                recognitionRef.current?.start()
              } catch (error) {
                console.error('Error restarting speech recognition:', error)
                setIsListening(false)
                setMicError('Error with speech recognition. Please try again.')
              }
            }
          }

          recognitionRef.current.onerror = (event) => {
            console.error('Speech recognition error:', event)
            setMicError('Error with speech recognition. Please try again.')
            setIsListening(false)
          }
        } catch (error) {
          console.error('Error initializing speech recognition:', error)
          setMicError('Speech recognition is not supported in your browser.')
        }
      } else {
        setMicError('Speech recognition is not supported in your browser.')
      }
    }

    // Initialize speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (synthRef.current) {
        synthRef.current.cancel()
      }
    }
  }, [])

  // If user is on a post page, try to infer context immediately and on route changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname && /^\/posts\//.test(pathname)) {
      const ctx = (window as any).postContext
      if (ctx?.context === 'post-article') {
        setCurrentContext(ctx)
      }
    }
  }, [pathname])

  const handleToggleOpen = () => {
    const opening = !isOpen
    if (opening && typeof window !== 'undefined') {
      const ctx = (window as any).postContext || (window as any).bookingContext
      if (ctx && !currentContext) {
        setCurrentContext(ctx)
      }
    }
    setIsOpen(opening)
  }

  const startListening = () => {
    if (!recognitionRef.current) {
      setMicError('Speech recognition is not available.')
      return
    }

    try {
      setMicError(null)
      finalTranscriptRef.current = ''
      recognitionRef.current.start()
      setIsListening(true)
    } catch (error) {
      console.error('Error starting speech recognition:', error)
      setMicError('Failed to start speech recognition. Please try again.')
      setIsListening(false)
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
        setIsListening(false)
      } catch (error) {
        console.error('Error stopping speech recognition:', error)
        setMicError('Error stopping speech recognition.')
      }
    }
  }

  const speak = (text: string) => {
    if (synthRef.current) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => {
        setIsSpeaking(false)
        // If we're still listening, restart recognition after speaking
        if (isListening && recognitionRef.current) {
          try {
            recognitionRef.current.start()
          } catch (error) {
            console.error('Error restarting speech recognition after speaking:', error)
          }
        }
      }
      synthRef.current.speak(utterance)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const messageToSend = (finalTranscriptRef.current || input || '').trim()
    if (!messageToSend) return
    handleSendMessage(messageToSend)
  }

  const handlePromptSubmit = (message: PromptInputMessage) => {
    const messageToSend = message.text?.trim() || ''
    if (messageToSend) {
      handleSendMessage(messageToSend)
      setInput('')
      finalTranscriptRef.current = ''
    }
  }

  const handleSendMessage = async (messageToSend: string) => {
    const userMessage: Message = { role: 'user', content: messageToSend }
    const threadId = beginNewThread([userMessage])

    if (!isLoggedIn) {
      const authMessage: Message = {
        role: 'assistant',
        content: 'Please log in to use the AI Assistant. This feature requires authentication for security.',
      }
      appendMessageToThread(threadId, authMessage)
      return
    }

    setIsLoading(true)

    const speakSafely = (text: string) => {
      if (activeThreadRef.current === threadId) {
        speak(text)
      }
    }

    try {
      // Check if this is a package suggestion request (only in package-suggestions context)
      if (currentContext?.context === 'package-suggestions') {

        // Determine if user has host/admin privileges
        const userRole = Array.isArray(currentUser?.role) ? currentUser?.role : [currentUser?.role].filter(Boolean)
        const isHostOrAdmin = userRole.includes('host') || userRole.includes('admin')

        // Call package suggestions API
        const res = await fetch('/api/packages/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: messageToSend,
            postId: currentContext?.postId,
            hostContext: isHostOrAdmin
          }),
        })
        
        if (res.ok) {
          const data = await res.json()
          if (activeThreadRef.current !== threadId) return

          const suggestions: PackageSuggestion[] = Array.isArray(data.recommendations) ? data.recommendations : []

          if (suggestions.length > 0) {
            setPackageSuggestionsForThread(threadId, suggestions)

            // Create a formatted response
            const suggestionText = suggestions
              .map(
                (s) =>
                  `**${s.suggestedName}**\n` +
                  `${s.description}\n` +
                  `- Duration: ${s.details.minNights}-${s.details.maxNights} nights\n` +
                  `- Category: ${s.details.category}\n` +
                  `- Multiplier: ${s.details.multiplier}x\n` +
                  `- Entitlement: ${s.details.customerTierRequired}\n` +
                  `- Base Rate: ${s.baseRate ? `R${s.baseRate}` : 'Not set'}\n` +
                  `- Features: ${
                    s.features && s.features.length > 0 ? s.features.join(', ') : s.details.features || 'Standard features'
                  }`,
              )
              .join('\n\n')

            const assistantMessage: Message = {
              role: 'assistant',
              content: `Here are some package suggestions based on your needs:\n\n${suggestionText}\n\nYou can click "Add Package" on any of these suggestions to create them.`,
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely('I found some package suggestions for you. Check the cards below.')
          } else {
            const assistantMessage: Message = {
              role: 'assistant',
              content: `I couldn't find specific package suggestions for "${messageToSend}". Try describing your needs more specifically, such as "I need a luxury weekend package" or "I want to offer hourly rentals for events".`,
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely("I couldn't find specific package suggestions. Please try describing your needs more specifically.")
          }
        } else {
          const data = await res.json().catch(() => ({}))
          if (activeThreadRef.current !== threadId) return

          const errorDetails = data.error || data.message || 'Unknown error'
          const assistantMessage: Message = {
            role: 'assistant',
            content: `Sorry, I encountered an error while generating package suggestions: ${errorDetails}. Please check the console for more details.`,
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely('Sorry, I encountered an error while generating package suggestions.')
          console.error('Package suggestions API error:', data)
        }
      } else if (currentContext?.context === 'package-rename') {
        // Handle package renaming with enhanced suggestions
        const currentName = currentContext?.currentName || 'this package'
        const postId = currentContext?.postId
        
        // Call the general chat API with package renaming context
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: `I want to rename my "${currentName}" package. ${messageToSend}. Please suggest a better name, description, and key features that would appeal to guests. Make it specific to this property and the package type.`,
            context: 'package-rename'
          }),
        })
        
        if (res.ok) {
          const data = await res.json()
          if (activeThreadRef.current !== threadId) return

          const usage = normalizeTokenUsage(data.usage)
          const baseContent =
            data.response || "I've provided some suggestions for renaming your package. You can review and apply them as needed."

          persistTokenUsage(usage)

          const assistantMessage: Message = {
            role: 'assistant',
            content: appendUsageToContent(baseContent, usage),
          }

          appendMessageToThread(threadId, assistantMessage)
          speakSafely("I've provided suggestions for renaming your package.")
        } else {
          if (activeThreadRef.current !== threadId) return
          const assistantMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error while generating renaming suggestions. Please try again.',
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely('Sorry, I encountered an error while generating renaming suggestions.')
        }
      } else if (currentContext?.context === 'package-update') {
        // Handle package updates including category changes
        const currentName = currentContext?.currentName || 'this package'
        const currentCategory = currentContext?.currentCategory || 'unknown'
        const postId = currentContext?.postId
        const packageId = currentContext?.packageId
        
        // Call the general chat API with package update context
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: `I want to update my "${currentName}" package (currently ${currentCategory} category). ${messageToSend}. Please suggest appropriate changes including category, name, description, features, and base rate if needed. Make it specific to this property and the requested changes.`,
            context: 'package-update',
            packageId,
            postId
          }),
        })
        
        if (res.ok) {
          const data = await res.json()
          if (activeThreadRef.current !== threadId) return

          const usage = normalizeTokenUsage(data.usage)
          const baseContent =
            data.response || "I've provided some suggestions for updating your package. You can review and apply them as needed."

          persistTokenUsage(usage)

          const assistantMessage: Message = {
            role: 'assistant',
            content: appendUsageToContent(baseContent, usage),
          }

          appendMessageToThread(threadId, assistantMessage)
          speakSafely("I've provided suggestions for updating your package.")
        } else {
          if (activeThreadRef.current !== threadId) return
          const assistantMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error while generating update suggestions. Please try again.',
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely('Sorry, I encountered an error while generating update suggestions.')
        }
      } else if (currentContext?.context === 'booking-reschedule') {
        const rescheduleData = currentContext?.rescheduleData || {}
        const postTitle = rescheduleData.postTitle || 'your stay'
        const packageName = rescheduleData.packageName || 'selected package'
        const formattedRange = rescheduleData.formattedDateRange || 'the selected dates'
        const formattedTotal = rescheduleData.formattedTotal
          || (typeof rescheduleData.total === 'number'
            ? `R${rescheduleData.total.toFixed(2)}`
            : 'the updated total')
        const redirectUrl: string | undefined = rescheduleData.redirectUrl

        if (activeThreadRef.current !== threadId) return

        const assistantMessage: Message = {
          role: 'assistant',
          content: `Great! I've prepared a fresh estimate for ${postTitle} from ${formattedRange} with the ${packageName}. Your updated total comes to ${formattedTotal}. I'll open the estimate builder so you can review and confirm.`,
        }

        appendMessageToThread(threadId, assistantMessage)
        speakSafely(`Your updated stay totals ${formattedTotal}. I'm opening the estimate builder now.`)

        if (rescheduleRedirectRef.current) {
          clearTimeout(rescheduleRedirectRef.current)
        }

        if (redirectUrl) {
          rescheduleRedirectRef.current = setTimeout(() => {
            if (activeThreadRef.current === threadId) {
              router.push(redirectUrl)
            }
            rescheduleRedirectRef.current = null
          }, 1500)
        }

        return
      } else if (currentContext?.context === 'booking-details') {
        // Handle booking-specific queries
        const bookingContext = currentContext

        // Create a comprehensive context string for the AI
        const contextString = `
Booking Context:
- Property: ${bookingContext.property?.title || 'Unknown property'}
- Booking Title: ${bookingContext.booking?.title || 'Unknown'}
- Booking ID: ${bookingContext.booking?.id || 'Unknown'}
- Dates: ${bookingContext.booking?.fromDate ? new Date(bookingContext.booking.fromDate).toLocaleDateString() : 'Unknown'} to ${bookingContext.booking?.toDate ? new Date(bookingContext.booking.toDate).toLocaleDateString() : 'Unknown'}
- Payment Status: ${bookingContext.booking?.paymentStatus || 'Unknown'}
- Customer: ${bookingContext.guests?.customer?.name || 'Unknown'}
- Guests: ${bookingContext.guests?.guests?.map((g: any) => g.name).join(', ') || 'None'}
- Available Add-ons: ${bookingContext.addons?.map((a: any) => `${a.name} (R${a.price})`).join(', ') || 'None'}
- Check-in Information: ${bookingContext.checkinInfo?.map((c: any) => c.title).join(', ') || 'None'}

Property Article Content:
${bookingContext.property?.content ? JSON.stringify(bookingContext.property.content) : 'No property content available'}
        `

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `${contextString}\n\nUser question: ${messageToSend}`,
            context: 'booking-details'
          }),
        })

        const data = await response.json()
        if (activeThreadRef.current !== threadId) return
        const usage = normalizeTokenUsage(data.usage)
        const baseContent = data.message || data.response || 'No response received'

        persistTokenUsage(usage)

        const assistantMessage: Message = {
          role: 'assistant',
          content: appendUsageToContent(baseContent, usage),
        }
        appendMessageToThread(threadId, assistantMessage)
        speakSafely(baseContent)
      } else if (currentContext?.context === 'post-article') {
        // Handle post article queries
        const postContext = currentContext

        // Create a comprehensive context string for the AI
        const fullContentTextRaw = extractPlainTextFromContent(postContext.post?.content)
        // Limit to a reasonable length to avoid token overuse while keeping relevance
        const fullContentText = (fullContentTextRaw || 'No content available').split('\n').map((l: string) => l.trim()).filter(Boolean).join('\n')
        // Expand content chunk limit to include more of the article body
        const CONTENT_LIMIT = 60000
        const limitedContentText = fullContentText.length > CONTENT_LIMIT ? fullContentText.slice(0, CONTENT_LIMIT) + '\n[...truncated...]' : fullContentText

        const categoriesLine =
          Array.isArray(postContext.post?.categories) && postContext.post?.categories.length > 0
            ? postContext.post.categories.join(', ')
            : 'None'

        const hero = postContext.post?.heroImage
        const heroSummary =
          hero && typeof hero === 'object'
            ? `${hero.filename || 'image'}${hero.width && hero.height ? ` (${hero.width}x${hero.height})` : ''}`
            : 'None'

        const sourceUrls = extractAutolinksFromContent(postContext.post?.content)
        const sourcesBlock =
          sourceUrls.length > 0
            ? `\nSources:\n${sourceUrls.map((u) => `- ${u}`).join('\n')}\n`
            : ''

        // If user asks for a summary, enrich the instruction to include key aspects
        const lower = messageToSend.toLowerCase()
        const isSummaryRequest =
          lower === 'summarize this page' ||
          lower === 'tell me about my bookings' ||
          lower.includes('summarize this article') ||
          lower.includes('summary')
        const enrichedUserQuestion = isSummaryRequest
          ? `Summarize the property using the article content. Include:
- guest-focused highlights first: who it’s perfect for (couples, families, groups), typical group size, and guest vibe
- suitability for children and families (sleeping arrangements, provisions)
- accessibility or ease-of-stay considerations if implied
- location clues (e.g., Llandudno / beach proximity)
- minimum stay requirements
- key amenities and features
- notable house rules or restrictions (e.g., no BBQ/candles/fires)
- notable categories: ${categoriesLine}
- any standout details users should know
Finish with a concise, guest-friendly blurb.`
          : messageToSend

        const contextString = `
Article Context:
- Title: ${postContext.post?.title || 'Unknown title'}
- Description: ${postContext.post?.description || 'No description'}
- Base Rate: ${postContext.post?.baseRate ? `R${postContext.post.baseRate}` : 'Not set'}
- Related Posts: ${postContext.post?.relatedPosts?.map((p: any) => p.title || p).join(', ') || 'None'}
- Categories: ${categoriesLine}
- Hero Image: ${heroSummary}
${sourcesBlock}

Full Article Content:
${limitedContentText}
        `

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `${contextString}\n\nUser question: ${enrichedUserQuestion}`,
            context: 'post-article'
          }),
        })

        const data = await response.json()
        if (activeThreadRef.current !== threadId) return
        const usage = normalizeTokenUsage(data.usage)
        const baseContent = data.message || data.response || 'No response received'

        persistTokenUsage(usage)

        const assistantMessage: Message = {
          role: 'assistant',
          content: appendUsageToContent(baseContent, usage),
        }
        appendMessageToThread(threadId, assistantMessage)
        speakSafely(baseContent)
      } else if (messageToSend.toLowerCase().includes('debug packages') || 
                 messageToSend.toLowerCase().includes('debug') ||
                 messageToSend.toLowerCase().includes('show packages')) {
        // Handle debug packages request
        try {
          // Get postId from context
          const postId = currentContext?.post?.id || currentContext?.property?.id
          
          if (postId) {
            const response = await fetch(`/api/packages/post/${postId}`)
            if (response.ok) {
              const data = await response.json()
              if (activeThreadRef.current !== threadId) return
              const packages = data.packages || []

              // Get user's subscription status for entitlement info
              const userEntitlement = currentUser?.role === 'admin' ? 'pro' : 
                                     currentUser?.subscriptionStatus?.plan || 'none'
              
              const debugInfo = `
**Debug Package Information:**
- Total packages found: ${packages.length}
- User role: ${currentUser?.role || 'guest'}
- Subscription plan: ${currentUser?.subscriptionStatus?.plan || 'none'}
- Entitlement level: ${userEntitlement}

**Available Packages:**
${packages.map((pkg: any, index: number) => 
  `${index + 1}. **${pkg.name}**
     - Category: ${pkg.category || 'N/A'}
     - Entitlement: ${pkg.entitlement || 'N/A'}
     - Enabled: ${pkg.isEnabled ? 'Yes' : 'No'}
     - Min/Max nights: ${pkg.minNights}-${pkg.maxNights}
     - Multiplier: ${pkg.multiplier}x
     - RevenueCat ID: ${pkg.revenueCatId || 'N/A'}
     - Features: ${pkg.features?.length || 0} features`
).join('\n\n')}

**Filtering Logic:**
- Non-subscribers see: hosted, special packages only
- Standard subscribers see: standard, hosted, special packages
- Pro subscribers see: all packages
- Addon packages are filtered out (booking page only)
              `
              
              const assistantMessage: Message = {
                role: 'assistant',
                content: debugInfo,
              }
              appendMessageToThread(threadId, assistantMessage)
              speakSafely("Here's the debug information for packages and entitlements.")
            } else {
              throw new Error('Failed to fetch packages')
            }
          } else {
            if (activeThreadRef.current !== threadId) return
            const assistantMessage: Message = {
              role: 'assistant',
              content: 'No post context available for debugging packages. Please navigate to a property page first.',
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely('No property context available for debugging.')
          }
        } catch (error) {
          console.error('Debug packages error:', error)
          if (activeThreadRef.current !== threadId) return
          const assistantMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error while fetching debug information. Please try again.',
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely('Error fetching debug information.')
        }
      } else if (
        (messageToSend.toLowerCase().includes('both') && 
         (messageToSend.toLowerCase().includes('available') || messageToSend.toLowerCase().includes('availability'))) ||
        messageToSend.toLowerCase().includes('when are both') ||
        messageToSend.toLowerCase().includes('simultaneously') ||
        messageToSend.toLowerCase().includes('at the same time')
      ) {
        // Handle multi-post availability queries
        try {
          // First, use chat API to help identify post names from the message
          const chatResponse = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `I need to identify which properties the user is asking about. User message: "${messageToSend}"

Please extract the property/post names mentioned. Respond ONLY with a JSON array of property names/slugs you can identify, like: ["the-shack", "sea-side-cottage"] or ["The Shack", "Seaside Cottage"]. If you can't identify specific properties, respond with an empty array: [].`,
              context: 'multi-post-availability-extraction'
            }),
          })

          const chatData = await chatResponse.json()
          const extractionText = chatData.message || chatData.response || '[]'
          
          // Try to parse JSON from the response
          let postIdentifiers: string[] = []
          try {
            // Try to extract JSON array from the response
            const jsonMatch = extractionText.match(/\[.*?\]/s)
            if (jsonMatch) {
              postIdentifiers = JSON.parse(jsonMatch[0])
            }
          } catch (e) {
            // If parsing fails, try to extract post names manually
            const lowerMessage = messageToSend.toLowerCase()
            // Look for common patterns like "the shack and sea side cottage"
            const matches = messageToSend.match(/(?:the\s+)?([a-z\s-]+?)(?:\s+and\s+(?:the\s+)?([a-z\s-]+?))?(?:\s+available|availability|sleep|both|simultaneously)/i)
            if (matches) {
              if (matches[1]) postIdentifiers.push(matches[1].trim())
              if (matches[2]) postIdentifiers.push(matches[2].trim())
            }
          }

          if (postIdentifiers.length < 2) {
            // Ask user to clarify
            const assistantMessage: Message = {
              role: 'assistant',
              content: 'I can help you check availability for multiple properties! Please specify which properties you\'d like to check (e.g., "the shack and sea side cottage"). You can provide post names, slugs, or IDs.',
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely('Please specify which properties you\'d like to check.')
            return
          }

          // Look up post IDs from names/slugs
          const postIdPromises = postIdentifiers.map(async (identifier: string) => {
            try {
              // Try to find by slug first (normalize to slug format)
              const slug = identifier.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
              const response = await fetch(`/api/posts/search?slug=${encodeURIComponent(slug)}`, {
                credentials: 'include',
              })
              if (response.ok) {
                const data = await response.json()
                if (data.docs && data.docs.length > 0) {
                  return data.docs[0].id
                }
              }
              
              // Try to find by title/name
              const titleResponse = await fetch(`/api/posts/search?title=${encodeURIComponent(identifier)}`, {
                credentials: 'include',
              })
              if (titleResponse.ok) {
                const titleData = await titleResponse.json()
                if (titleData.docs && titleData.docs.length > 0) {
                  return titleData.docs[0].id
                }
              }
            } catch (e) {
              console.error(`Error looking up post: ${identifier}`, e)
            }
            return null
          })

          const postIds = (await Promise.all(postIdPromises)).filter((id): id is string => id !== null)

          if (postIds.length < 2) {
            const assistantMessage: Message = {
              role: 'assistant',
              content: `I couldn't find both properties you mentioned. I found ${postIds.length} of ${postIdentifiers.length} properties. Please check the property names and try again, or provide post IDs directly.`,
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely('I couldn\'t find both properties. Please check the names and try again.')
            return
          }

          // Call the multi-post availability endpoint
          const availabilityResponse = await fetch(
            `/api/bookings/multi-post-availability?postIds=${postIds.join(',')}`,
            {
              credentials: 'include',
            }
          )

          if (!availabilityResponse.ok) {
            throw new Error('Failed to fetch availability data')
          }

          const availabilityData = await availabilityResponse.json()
          
          // Process the data to find when both are available
          const unavailableInAnyPost = new Set(availabilityData.unavailableInAnyPost || [])
          
          // Get post details
          const postDetails = availabilityData.posts || []
          const postNames = postDetails.map((p: any) => p.title).join(' and ')
          
          // Calculate available date ranges (simplified - show next 90 days)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const futureDate = new Date(today)
          futureDate.setDate(futureDate.getDate() + 90)
          
          const availableRanges: Array<{ start: Date; end: Date }> = []
          let currentRangeStart: Date | null = null
          
          const checkDate = new Date(today)
          while (checkDate <= futureDate) {
            const dateStr = checkDate.toISOString()
            const isUnavailable = unavailableInAnyPost.has(dateStr)
            
            if (!isUnavailable && !currentRangeStart) {
              // Start of available range
              currentRangeStart = new Date(checkDate)
            } else if (isUnavailable && currentRangeStart) {
              // End of available range
              availableRanges.push({
                start: currentRangeStart,
                end: new Date(checkDate.getTime() - 24 * 60 * 60 * 1000), // Previous day
              })
              currentRangeStart = null
            }
            
            checkDate.setDate(checkDate.getDate() + 1)
          }
          
          // If we ended in an available range, close it
          if (currentRangeStart) {
            availableRanges.push({
              start: currentRangeStart,
              end: futureDate,
            })
          }

          // Format the response
          let responseText = `I checked availability for **${postNames}**. Here's when both properties are available simultaneously:\n\n`
          
          if (availableRanges.length === 0) {
            responseText += '❌ **No overlapping availability found** in the next 90 days. Both properties have conflicting bookings.\n\n'
          } else {
            responseText += `✅ **Found ${availableRanges.length} available period${availableRanges.length > 1 ? 's' : ''}** when both properties are free:\n\n`
            
            availableRanges.slice(0, 10).forEach((range, idx) => {
              const startStr = format(range.start, 'MMM d, yyyy')
              const endStr = format(range.end, 'MMM d, yyyy')
              const nights = Math.ceil((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000))
              responseText += `${idx + 1}. **${startStr}** to **${endStr}** (${nights} night${nights !== 1 ? 's' : ''})\n`
            })
            
            if (availableRanges.length > 10) {
              responseText += `\n...and ${availableRanges.length - 10} more period${availableRanges.length - 10 > 1 ? 's' : ''}.\n`
            }
          }
          
          responseText += `\n💡 **Tip:** Both properties can sleep 2 people each, so booking both together gives you capacity for 4 guests!`

          const assistantMessage: Message = {
            role: 'assistant',
            content: responseText,
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely(`I found ${availableRanges.length} available period${availableRanges.length !== 1 ? 's' : ''} when both properties are free.`)
        } catch (error) {
          console.error('Multi-post availability error:', error)
          if (activeThreadRef.current !== threadId) return
          const assistantMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error while checking multi-property availability. Please try again or specify the property names more clearly.',
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely('Error checking multi-property availability.')
        }
      } else if (
        isHostOrAdmin && (
          messageToSend.toLowerCase().includes('cleaner') ||
          messageToSend.toLowerCase().includes('cleaning') ||
          messageToSend.toLowerCase().includes('send') && messageToSend.toLowerCase().includes('cleaner')
        )
      ) {
        // Handle cleaning schedule queries for hosts
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `As a host, I'm asking about cleaning schedules. ${messageToSend}

Please help me understand:
- When to send cleaners based on booking check-out dates
- How many cleaners to send (e.g., "send 1 cleaner instead of 2")
- Cleaning schedule optimization

If I mentioned specific bookings or dates, please reference them.`,
              context: 'cleaning-schedule',
              userRole: isHostOrAdmin ? 'host' : 'admin'
            }),
          })

          const data = await response.json()
          if (activeThreadRef.current !== threadId) return
          const usage = normalizeTokenUsage(data.usage)
          const baseContent = data.message || data.response || 'I can help you with cleaning schedules. Please provide more details about which bookings or dates you\'re referring to.'

          persistTokenUsage(usage)

          const assistantMessage: Message = {
            role: 'assistant',
            content: appendUsageToContent(baseContent, usage),
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely(baseContent)
        } catch (error) {
          console.error('Cleaning schedule error:', error)
          if (activeThreadRef.current !== threadId) return
          const assistantMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error while processing your cleaning schedule query. Please try again.',
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely('Error processing cleaning schedule query.')
        }
      } else if (
        (currentContext?.context === 'estimate-details' || currentContext?.context === 'booking-details') &&
        (messageToSend.toLowerCase().includes('other properties') ||
         messageToSend.toLowerCase().includes('suggest other') ||
         messageToSend.toLowerCase().includes('find other') ||
         messageToSend.toLowerCase().includes('available for my dates'))
      ) {
        // Handle property suggestions for estimates or bookings
        try {
          const context = currentContext
          let fromDate: string | undefined
          let toDate: string | undefined
          let currentPostId: string | undefined
          let currentPostCategories: string[] = []
          
          if (context.context === 'estimate-details') {
            fromDate = context.estimate?.fromDate
            toDate = context.estimate?.toDate
            currentPostId = context?.post?.id
            // Get categories from current post if available
            if (context?.post && typeof context.post === 'object') {
              const postCategories = (context.post as any).categories
              if (Array.isArray(postCategories)) {
                currentPostCategories = postCategories.map((c: any) => 
                  typeof c === 'object' ? (c.id || c.slug || c.title) : c
                ).filter(Boolean)
              }
            }
          } else if (context.context === 'booking-details') {
            fromDate = context.booking?.fromDate
            toDate = context.booking?.toDate
            currentPostId = context?.property?.id
            // Get categories from property if available
            if (context?.property && typeof context.property === 'object') {
              const propertyCategories = (context.property as any).categories
              if (Array.isArray(propertyCategories)) {
                currentPostCategories = propertyCategories.map((c: any) => 
                  typeof c === 'object' ? (c.id || c.slug || c.title) : c
                ).filter(Boolean)
              }
            }
          }
          
          if (!fromDate || !toDate) {
            const assistantMessage: Message = {
              role: 'assistant',
              content: 'I need dates to find other available properties. Please make sure your booking/estimate has check-in and check-out dates set.',
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely('I need dates to find other available properties.')
            return
          }
          
          // Fetch all posts
          const postsResponse = await fetch('/api/posts?limit=100&depth=2', {
            credentials: 'include',
          })
          
          if (!postsResponse.ok) {
            throw new Error('Failed to fetch posts')
          }
          
          const postsData = await postsResponse.json()
          const allPosts = postsData.docs || []
          
          // Filter out current post if specified
          let otherPosts = currentPostId 
            ? allPosts.filter((p: any) => p.id !== currentPostId)
            : allPosts
          
          // Filter by same categories if we have categories from current post
          if (currentPostCategories.length > 0) {
            const categoryFiltered = otherPosts.filter((p: any) => {
              const postCategories = Array.isArray(p.categories) 
                ? p.categories.map((c: any) => typeof c === 'object' ? (c.id || c.slug || c.title) : c).filter(Boolean)
                : []
              // Check if any category matches
              return postCategories.some((catId: string) => currentPostCategories.includes(catId))
            })
            
            // If we found category matches, use those; otherwise use all posts
            if (categoryFiltered.length > 0) {
              otherPosts = categoryFiltered
            }
          }
          
          if (otherPosts.length === 0) {
            const assistantMessage: Message = {
              role: 'assistant',
              content: 'No other properties found to check availability for.',
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely('No other properties found.')
            return
          }
          
          // Check availability for each post
          const availabilityChecks = await Promise.all(
            otherPosts.slice(0, 20).map(async (post: any) => {
              try {
                const availResponse = await fetch(
                  `/api/bookings/unavailable-dates?postId=${post.id}`,
                  { credentials: 'include' }
                )
                if (!availResponse.ok) return { post, available: false, error: true }
                
                const availData = await availResponse.json()
                const unavailableDates = new Set(availData.unavailableDates || [])
                
                // Check if the date range overlaps with unavailable dates
                const from = new Date(fromDate)
                const to = new Date(toDate)
                const checkDate = new Date(from)
                let isAvailable = true
                
                while (checkDate < to && isAvailable) {
                  const dateStr = checkDate.toISOString()
                  if (unavailableDates.has(dateStr)) {
                    isAvailable = false
                    break
                  }
                  checkDate.setDate(checkDate.getDate() + 1)
                }
                
                return { post, available: isAvailable, error: false }
              } catch (e) {
                return { post, available: false, error: true }
              }
            })
          )
          
          const availablePosts = availabilityChecks
            .filter((result: any) => result.available && !result.error)
            .map((result: any) => result.post)
          
          // Format response with available properties
          const fromStr = format(new Date(fromDate), 'MMM d, yyyy')
          const toStr = format(new Date(toDate), 'MMM d, yyyy')
          
          if (availablePosts.length === 0) {
            const assistantMessage: Message = {
              role: 'assistant',
              content: `I checked ${otherPosts.length} other properties for availability from **${fromStr}** to **${toStr}**, but none are available for those exact dates. You may want to consider adjusting your dates slightly or checking back later.`,
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely('No other properties are available for those dates.')
            return
          }
          
          // Build property list with links
          const propertyList = availablePosts.map((p: any, idx: number) => {
            const postUrl = p.slug ? `/posts/${p.slug}` : `/posts/${p.id}`
            const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${postUrl}` : postUrl
            const categories = Array.isArray(p.categories) 
              ? p.categories.map((c: any) => typeof c === 'object' ? (c.title || c.slug) : c).join(', ')
              : 'None'
            return `${idx + 1}. **[${p.title}](${postUrl})** - [View Property](${postUrl})
   - **Link:** [${fullUrl}](${postUrl})
   - **Description:** ${p.meta?.description || 'No description'}
   - **Base Rate:** ${p.baseRate ? `R${p.baseRate}` : 'Not set'}
   - **Categories:** ${categories}`
          }).join('\n\n')

          // Use chat API to format a nice response with property details and links
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `User has dates ${fromStr} to ${toStr}. I found ${availablePosts.length} other properties available for these exact dates:

${propertyList}

IMPORTANT: You MUST include clickable markdown links to each property in your response. Use the format [Property Name](${typeof window !== 'undefined' ? window.location.origin : ''}/posts/slug) for each property. List each property with its link prominently. Format it nicely with markdown, making sure every property name is a clickable link.`,
              context: 'property-suggestions',
            }),
          })

          const data = await response.json()
          if (activeThreadRef.current !== threadId) return
          const usage = normalizeTokenUsage(data.usage)
          let baseContent = data.message || data.response || `I found ${availablePosts.length} other properties available for your dates from ${fromStr} to ${toStr}.`

          // Ensure links are included even if AI didn't add them
          if (!baseContent.includes('[') || !baseContent.includes('](')) {
            const linksSection = '\n\n**Available Properties:**\n\n' + 
              availablePosts.map((p: any) => {
                const postUrl = p.slug ? `/posts/${p.slug}` : `/posts/${p.id}`
                return `- [${p.title}](${postUrl})`
              }).join('\n')
            baseContent += linksSection
          }

          persistTokenUsage(usage)

          // Prepare property suggestions data for Plan component
          const propertySuggestionsData = {
            fromDate: fromStr,
            toDate: toStr,
            properties: availablePosts.map((p: any) => ({
              id: p.id,
              title: p.title,
              slug: p.slug || p.id,
              description: p.meta?.description || '',
              baseRate: p.baseRate,
              categories: Array.isArray(p.categories) 
                ? p.categories.map((c: any) => typeof c === 'object' ? (c.title || c.slug) : c).join(', ')
                : 'None',
            })),
          }

          const assistantMessage: Message = {
            role: 'assistant',
            content: appendUsageToContent(baseContent, usage),
            propertySuggestions: propertySuggestionsData,
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely(`I found ${availablePosts.length} other properties available for your dates.`)
        } catch (error) {
          console.error('Property suggestions error:', error)
          if (activeThreadRef.current !== threadId) return
          const assistantMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error while finding other properties. Please try again.',
          }
          appendMessageToThread(threadId, assistantMessage)
          speakSafely('Error finding other properties.')
        }
      } else {
        // Regular chat API call
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageToSend }),
        })

        const data = await response.json()
        if (activeThreadRef.current !== threadId) return
        const usage = normalizeTokenUsage(data.usage)
        const baseContent = data.message || data.response || 'No response received'

        persistTokenUsage(usage)

        const assistantMessage: Message = {
          role: 'assistant',
          content: appendUsageToContent(baseContent, usage),
        }
        appendMessageToThread(threadId, assistantMessage)
        speakSafely(baseContent)
      }
    } catch (error) {
      console.error('Error:', error)
      if (activeThreadRef.current === threadId) {
        const errorMessage = 'Sorry, I encountered an error. Please try again.'
        appendMessageToThread(threadId, { role: 'assistant', content: errorMessage })
        speakSafely(errorMessage)
      }
    } finally {
      if (activeThreadRef.current === threadId) {
        setIsLoading(false)
      }
    }
  }

  // Auto-scroll is now handled by Conversation component

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        onClick={handleToggleOpen}
        className={cn(
          'rounded-full w-12 h-12 p-0',
          isOpen ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90',
        )}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </Button>

      {isOpen && (
        <Card className="absolute bottom-16 right-0 w-[400px] shadow-lg">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">AI Assistant</h3>
              <div className="flex items-center gap-3">
                <AIContextCard usage={lastUsage || undefined}>
                  <ContextTrigger />
                  <ContextContent />
                </AIContextCard>
                {!isLoggedIn && (
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <Lock className="h-3 w-3" />
                    <span>Login Required</span>
                  </div>
                )}
              </div>
            </div>
            {currentContext?.context === 'package-suggestions' && (
              <p className="text-xs text-muted-foreground">Package suggestions mode</p>
            )}
            {currentContext?.context === 'booking-details' && (
              <p className="text-xs text-muted-foreground">Booking assistant - I can help with your booking details, guests, and check-in info</p>
            )}
            {currentContext?.context === 'post-article' && (
              <p className="text-xs text-muted-foreground">Article assistant - I can help you explore and understand this article content</p>
            )}
            {!currentContext && (
              <p className="text-xs text-muted-foreground">Ask me about packages, bookings, or use "debug packages" to see entitlements</p>
            )}
          </div>
          
          <Conversation className="h-[300px]">
            <ConversationContent className="p-4">
              {/* Quick Actions */}
              {isLoggedIn && messages.length === 0 && (
                <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Quick Actions:</p>
                  <div className="flex flex-wrap gap-1">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6 px-2"
                      onClick={() => {
                        setInput('show me available packages')
                        handleSubmit(new Event('submit') as any)
                      }}
                    >
                      Show Packages
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6 px-2"
                      onClick={() => {
                        setInput('help me understand my entitlements')
                        handleSubmit(new Event('submit') as any)
                      }}
                    >
                      My Entitlements
                    </Button>
                    {currentContext?.context === 'booking-details' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 px-2"
                        onClick={() => {
                          try {
                            const fromISO = currentContext?.booking?.fromDate
                            const toISO = currentContext?.booking?.toDate
                            const from = fromISO ? new Date(fromISO) : null
                            const to = toISO ? new Date(toISO) : null
                            const msPerDay = 24 * 60 * 60 * 1000
                            const nights =
                              from && to
                                ? Math.max(1, Math.round((to.getTime() - from.getTime()) / msPerDay))
                                : undefined
                            const guestsArr = Array.isArray(currentContext?.guests?.guests)
                              ? currentContext.guests.guests
                              : []
                            const guestCount = guestsArr.length || 0
                            const guestPhrase =
                              guestCount > 0
                                ? `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}`
                                : 'guests'
                            const stayPhrase =
                              typeof nights === 'number'
                                ? `${nights} ${nights === 1 ? 'day' : 'days'}`
                                : 'your stay'
                            const summary = `Your booking includes ${guestPhrase} for ${stayPhrase}.`
                            const msg = `Tell me about this booking. ${summary} Please include dates, package, payment status, and the guest list.`
                            setInput(msg)
                            handleSubmit(new Event('submit') as any)
                          } catch {
                            setInput('Tell me about this booking including the guest list and length of stay')
                            handleSubmit(new Event('submit') as any)
                          }
                        }}
                      >
                        Tell me about this booking
                      </Button>
                    )}
                    {isHostOrAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 px-2"
                        onClick={() => {
                          const today = new Date()
                          const todayStr = today.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                          const msg = `Plan same-day checkout cleaning routes for cleaners.\n\nFocus on bookings checking out today (${todayStr}). Group properties by proximity/area and tell me when to send a cleaner, and whether to send 1 cleaner instead of 2.\n\nThis is about my cleaners, not guests.`
                          setInput(msg)
                          handleSubmit(new Event('submit') as any)
                        }}
                      >
                        Same-day checkout cleaning
                      </Button>
                    )}
                    {currentContext?.context === 'post-article' && hasStandardOrPro && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 px-2"
                        onClick={() => {
                          setInput('Tell me about my bookings')
                          handleSubmit(new Event('submit') as any)
                        }}
                      >
                        Tell me about my bookings
                      </Button>
                    )}
                    {(currentContext?.context === 'post-article' || currentContext?.context === 'booking-details') && hasStandardOrPro && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 px-2"
                        onClick={() => {
                          setInput('Summarize this page')
                          handleSubmit(new Event('submit') as any)
                        }}
                      >
                        Summarize this page
                      </Button>
                    )}
                    {currentContext?.context === 'estimate-details' && currentContext?.estimate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 px-2"
                        onClick={() => {
                          try {
                            const fromDate = currentContext.estimate?.fromDate
                            const toDate = currentContext.estimate?.toDate
                            const currentPostId = currentContext?.post?.id
                            
                            if (!fromDate || !toDate) {
                              setInput('Find other properties available for my dates')
                              handleSubmit(new Event('submit') as any)
                              return
                            }
                            
                            const from = new Date(fromDate)
                            const to = new Date(toDate)
                            const fromStr = format(from, 'MMM d, yyyy')
                            const toStr = format(to, 'MMM d, yyyy')
                            
                            const msg = `Find other properties available from ${fromStr} to ${toStr}${currentPostId ? ` (excluding the current property)` : ''}. Show me properties that are available for these exact dates.`
                            setInput(msg)
                            handleSubmit(new Event('submit') as any)
                          } catch {
                            setInput('Find other properties available for my dates')
                            handleSubmit(new Event('submit') as any)
                          }
                        }}
                      >
                        Suggest Other Properties
                      </Button>
                    )}
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <React.Fragment key={index}>
                  <Message from={message.role}>
                    <MessageContent>
                      <MessageResponse>{message.content || ''}</MessageResponse>
                    </MessageContent>
                  </Message>
                  {message.propertySuggestions && message.propertySuggestions.properties.length > 0 && (
                    <div className="mb-4">
                      <Plan defaultOpen={true}>
                        <PlanHeader>
                          <PlanTitle>
                            {`Available Properties for ${message.propertySuggestions.fromDate} to ${message.propertySuggestions.toDate}`}
                          </PlanTitle>
                          <PlanDescription>
                            {`${message.propertySuggestions.properties.length} properties available for your selected dates`}
                          </PlanDescription>
                        </PlanHeader>
                        <PlanTrigger>View Properties</PlanTrigger>
                        <PlanContent>
                          <div className="space-y-4">
                            {(() => {
                              const suggestions = message.propertySuggestions!
                              const fromDateParam = new Date(suggestions.fromDate).toISOString().split('T')[0]
                              const toDateParam = new Date(suggestions.toDate).toISOString().split('T')[0]
                              
                              return suggestions.properties.map((property, idx) => {
                                const basePostUrl = property.slug ? `/posts/${property.slug}` : `/posts/${property.id}`
                                // Add date parameters to the URL
                                const postUrl = `${basePostUrl}?fromDate=${fromDateParam}&toDate=${toDateParam}`
                                return (
                                  <div key={property.id} className="border-b pb-4 last:border-0 last:pb-0">
                                    <h4 className="font-semibold mb-2">
                                      <a 
                                        href={postUrl} 
                                        className="text-primary hover:underline"
                                      >
                                        {idx + 1}. {property.title}
                                      </a>
                                    </h4>
                                    {property.description && (
                                      <p className="text-sm text-muted-foreground mb-2">
                                        {property.description}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-2">
                                      {property.baseRate && (
                                        <span>Base Rate: R{property.baseRate}</span>
                                      )}
                                      {property.categories && property.categories !== 'None' && (
                                        <span>Categories: {property.categories}</span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mb-2">
                                      <span>Available: {suggestions.fromDate} to {suggestions.toDate}</span>
                                    </div>
                                    <div className="mt-2">
                                      <PlanAction asChild size="sm" variant="outline">
                                        <a href={postUrl}>View Property with Dates</a>
                                      </PlanAction>
                                    </div>
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        </PlanContent>
                      </Plan>
                    </div>
                  )}
                </React.Fragment>
              ))}
              {isLoading && (
                <div className="flex w-fit max-w-[85%] rounded-lg bg-muted px-4 py-2 items-center justify-center">
                  <Loader size={16} />
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          
          {/* Package Suggestions Display */}
          {packageSuggestions.length > 0 && (
            <div className="border-t p-4 max-h-[200px] overflow-y-auto">
              <h4 className="font-medium text-sm mb-2">Suggested Packages:</h4>
              <div className="space-y-2">
                {packageSuggestions.map((suggestion, index) => (
                  <div key={index} className="text-xs bg-muted p-2 rounded">
                    <div className="font-medium">{suggestion.suggestedName}</div>
                    <div className="text-muted-foreground">{suggestion.description}</div>
                    {suggestion.features && suggestion.features.length > 0 && (
                      <div className="mt-1 text-xs text-blue-600">
                        Features: {suggestion.features.join(', ')}
                      </div>
                    )}
                    <div className="mt-1 text-xs">
                      {suggestion.details.minNights}-{suggestion.details.maxNights} nights • {suggestion.details.category} • {suggestion.details.multiplier}x
                      {suggestion.baseRate && ` • R${suggestion.baseRate}`}
                    </div>
                    <div className="mt-2">
                      <Button 
                        size="sm" 
                        className="text-xs h-6 px-2"
                        onClick={() => {
                          // Dispatch event to apply this suggestion
                          const event = new CustomEvent('applyPackageSuggestion', { 
                            detail: { 
                              suggestion,
                              postId: currentContext?.postId
                            }
                          })
                          window.dispatchEvent(event)
                          // Close AI Assistant after applying
                          setIsOpen(false)
                        }}
                      >
                        Apply Suggestion
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="border-t p-4">
            {!isLoggedIn && (
              <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 mb-2">
                  Authentication required to use AI Assistant
                </p>
                <Button size="sm" className="text-xs h-6" asChild>
                  <a href="/login">Log In</a>
                </Button>
              </div>
            )}
            <PromptInput 
              onSubmit={handlePromptSubmit} 
              className="mt-2"
            >
              {currentContext?.context === 'post-article' && dateSuggestions.length > 0 && (
                <PromptInputHeader className="pb-2">
                  <Suggestions>
                    {dateSuggestions.map((suggestion, idx) => (
                      <Suggestion
                        key={idx}
                        suggestion={suggestion.label}
                        onClick={(label) => {
                          const fromStr = format(suggestion.startDate, 'MMM d, yyyy')
                          const toStr = format(suggestion.endDate, 'MMM d, yyyy')
                          const nights = Math.ceil((suggestion.endDate.getTime() - suggestion.startDate.getTime()) / (24 * 60 * 60 * 1000))
                          setInput(`Check availability for ${fromStr} to ${toStr} (${nights} ${nights === 1 ? 'night' : 'nights'})`)
                        }}
                        className="text-xs"
                      />
                    ))}
                  </Suggestions>
                </PromptInputHeader>
              )}
              <PromptInputBody>
                <PromptInputTextarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                  placeholder={
                    !isLoggedIn ? "Please log in to use AI Assistant..." :
                    isListening ? "I'm listening..." : 'Type your message...'
                  }
                  disabled={isLoading || isListening || !isLoggedIn}
                  className="pr-12"
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputSpeechButton
                    onTranscriptionChange={(text: string) => {
                      setInput(text)
                      finalTranscriptRef.current = text
                    }}
                    textareaRef={textareaRef}
                  />
                </PromptInputTools>
                <PromptInputSubmit 
                  status={isLoading ? 'streaming' : 'ready'} 
                  disabled={!input.trim() || isListening || !isLoggedIn} 
                />
              </PromptInputFooter>
            </PromptInput>
            {micError && <p className="text-sm text-destructive mt-2">{micError}</p>}
          </div>
        </Card>
      )}
    </div>
  )
}
