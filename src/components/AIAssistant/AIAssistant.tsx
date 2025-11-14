'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Bot, Send, X, Mic, MicOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUserContext } from '@/context/UserContext'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
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
  const router = useRouter()
  
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
  const [currentContext, setCurrentContext] = useState<any>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const isProcessingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const finalTranscriptRef = useRef('')
  const rescheduleRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeThreadRef = useRef(0)
  const historyKeyRef = useRef<string | null>(null)

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
      } else if ((window as any).postContext) {
        setCurrentContext((window as any).postContext)
      }
    }

    window.addEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
    
    // Check for context after a short delay to ensure it's set
    const timeoutId = setTimeout(checkContext, 100)
    
    return () => {
      window.removeEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
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
        const contextString = `
Article Context:
- Title: ${postContext.post?.title || 'Unknown title'}
- Description: ${postContext.post?.description || 'No description'}
- Base Rate: ${postContext.post?.baseRate ? `R${postContext.post.baseRate}` : 'Not set'}
- Related Posts: ${postContext.post?.relatedPosts?.map((p: any) => p.title || p).join(', ') || 'None'}

Full Article Content:
${JSON.stringify(postContext.post?.content || 'No content available')}
        `

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `${contextString}\n\nUser question: ${messageToSend}`,
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
        onClick={() => setIsOpen(!isOpen)}
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
              {!isLoggedIn && (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <Lock className="h-3 w-3" />
                  <span>Login Required</span>
                </div>
              )}
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
                        setInput('debug packages')
                        handleSubmit(new Event('submit') as any)
                      }}
                    >
                      Debug Packages
                    </Button>
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
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <Message key={index} from={message.role}>
                  <MessageContent>
                    <MessageResponse>{message.content || ''}</MessageResponse>
                  </MessageContent>
                </Message>
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
