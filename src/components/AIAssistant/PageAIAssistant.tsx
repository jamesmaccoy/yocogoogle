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
import { useChat } from '@ai-sdk/react'
import { PackagePreview } from '@/components/PackagePreview'

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
  const [isListening, setIsListening] = useState(false)
  const [lastResponse, setLastResponse] = useState<string | null>(null)
  const [pendingPackagePreview, setPendingPackagePreview] = useState<any>(null)
  const [isSavingPackage, setIsSavingPackage] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  const userRole = useMemo(() => 
    Array.isArray(currentUser?.role) ? currentUser?.role : [currentUser?.role].filter(Boolean),
    [currentUser]
  )
  const isHostOrAdmin = userRole.includes('host') || userRole.includes('admin')
  const subscriptionPlan = currentUser?.subscriptionStatus?.plan || 'none'

  // Use AI SDK's useChat hook for manage context (generative UI)
  const isManageContext = context?.type === 'manage' && isHostOrAdmin
  const { messages, input: chatInput, handleInputChange, handleSubmit, isLoading, setInput: setChatInput } = useChat({
    api: '/api/chat/manage',
    body: {
      pageData: context?.data || {},
    },
    onFinish: (message) => {
      // Check if the finished message has a package preview tool call
      if (message?.role === 'assistant' && message.parts) {
        const previewPart = message.parts.find((part: any) => 
          part.type === 'tool-previewPackage' && part.state === 'output-available'
        )
        if (previewPart?.output) {
          setPendingPackagePreview(previewPart.output)
        }
      }
    },
  })

  // Use simple fetch for non-manage contexts
  const [isLoadingSimple, setIsLoadingSimple] = useState(false)

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
        if (isManageContext) {
          setChatInput(transcript)
        } else {
          setInput(transcript)
        }
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
    if (isLoadingSimple) return
    
    setIsLoadingSimple(true)
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
      setIsLoadingSimple(false)
    }
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    if (isManageContext) {
      // Use AI SDK's handleSubmit for manage context
      handleSubmit(e)
    } else {
      // Use simple fetch for other contexts
      if (!input.trim() || isLoadingSimple) return
      const messageToSend = input.trim()
      setInput('')
      await sendMessage(messageToSend)
    }
  }

  const handleConfirmPackage = async () => {
    if (!pendingPackagePreview || !isManageContext) return
    
    setIsSavingPackage(true)
    const previewData = { ...pendingPackagePreview }
    setPendingPackagePreview(null)
    
    // Create a message that explicitly asks the AI to use createPackageTool
    const createMessage = `Please create the package using createPackageTool with these details:
- name: "${previewData.name}"
- description: "${previewData.description}"
- category: "${previewData.category}"
- minNights: ${previewData.minNights}
- maxNights: ${previewData.maxNights}
- baseRate: ${previewData.baseRate || 0}
- multiplier: ${previewData.multiplier}
- entitlement: "${previewData.entitlement}"
- postId: "${previewData.postId}"
- features: ${JSON.stringify(previewData.features || [])}
${previewData.revenueCatId ? `- revenueCatId: "${previewData.revenueCatId}"` : ''}`
    
    setChatInput(createMessage)
    
    // Wait a tick for input to update, then submit
    setTimeout(() => {
      const syntheticEvent = {
        preventDefault: () => {},
      } as React.FormEvent<HTMLFormElement>
      handleSubmit(syntheticEvent)
      setIsSavingPackage(false)
    }, 100)
  }

  const handleCancelPackage = () => {
    setPendingPackagePreview(null)
  }

  const handleActionClick = (action: string) => {
    sendMessage(action)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e as any)
    }
  }

  // Sync input state for manage context
  const currentInput = isManageContext ? (chatInput || '') : (input || '')
  const setCurrentInput = isManageContext ? setChatInput : setInput
  const currentIsLoading = isManageContext ? isLoading : isLoadingSimple

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

  // Render messages for manage context (generative UI)
  const renderManageMessages = () => {
    if (!isManageContext) return null

    return (
      <div className="space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="flex gap-3">
            <div className="flex-shrink-0">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shadow-sm",
                message.role === 'user' ? "bg-slate-200" : "bg-primary"
              )}>
                {message.role === 'user' ? (
                  <span className="text-xs font-semibold text-slate-600">You</span>
                ) : (
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                )}
              </div>
            </div>
            <div className="flex-1 space-y-2">
              {message.parts?.map((part: any, index: number) => {
                if (part.type === 'text') {
                  return (
                    <p key={index} className="text-sm text-foreground leading-relaxed">
                      {part.text}
                    </p>
                  )
                }
                
                if (part.type === 'tool-previewPackage') {
                  switch (part.state) {
                    case 'input-available':
                      return (
                        <div key={index} className="text-sm text-slate-500 italic">
                          Preparing package preview...
                        </div>
                      )
                    case 'output-available':
                      return (
                        <div key={index} className="my-4">
                          <PackagePreview
                            {...part.output}
                            onConfirm={handleConfirmPackage}
                            onCancel={handleCancelPackage}
                            isSaving={isSavingPackage}
                          />
                        </div>
                      )
                    case 'output-error':
                      return (
                        <div key={index} className="text-sm text-red-600">
                          Error: {part.errorText || 'Failed to preview package'}
                        </div>
                      )
                    default:
                      return null
                  }
                }

                if (part.type === 'tool-createPackage') {
                  switch (part.state) {
                    case 'input-available':
                      return (
                        <div key={index} className="text-sm text-slate-500 italic">
                          Creating package...
                        </div>
                      )
                    case 'output-available':
                      return (
                        <div key={index} className={cn(
                          "text-sm p-3 rounded-lg",
                          part.output.success 
                            ? "bg-green-50 text-green-800 border border-green-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                        )}>
                          {part.output.message}
                        </div>
                      )
                    case 'output-error':
                      return (
                        <div key={index} className="text-sm text-red-600">
                          Error: {part.errorText || 'Failed to create package'}
                        </div>
                      )
                    default:
                      return null
                  }
                }

                return null
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {getActionButtons()}
      
      {/* Render manage context messages with generative UI */}
      {isManageContext && renderManageMessages()}
      
      {/* Render simple response for other contexts */}
      {!isManageContext && lastResponse && (
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

      {/* Pending package preview (fallback) */}
      {pendingPackagePreview && (
        <div className="my-4">
          <PackagePreview
            {...pendingPackagePreview}
            onConfirm={handleConfirmPackage}
            onCancel={handleCancelPackage}
            isSaving={isSavingPackage}
          />
        </div>
      )}

      <form onSubmit={handleSendMessage}>
        <InputGroup className="shadow-sm">
          <InputGroupTextarea
            ref={textareaRef}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || defaultPlaceholder}
            className="min-h-[60px] max-h-[120px] py-3"
            disabled={currentIsLoading}
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
              disabled={!currentInput.trim() || currentIsLoading}
              className="rounded-full"
              type="submit"
            >
              {currentIsLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUpIcon className="h-3.5 w-3.5" />
              )}
              <span className="sr-only">Send</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  )
}

