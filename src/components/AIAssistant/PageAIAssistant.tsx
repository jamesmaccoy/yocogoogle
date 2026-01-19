'use client'

import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sparkles, ArrowUpIcon, Mic, Loader2, Package, Calendar, TrendingUp, Home, Star, FileText, BarChart2 } from 'lucide-react'
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
  variant?: 'default' | 'primary'
}

export function PageAIAssistant({ context, placeholder, className, showActions = true, variant }: PageAIAssistantProps) {
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
  // Always call useChat hook (React hooks must be called unconditionally)
  const isManageContext = context?.type === 'manage' && isHostOrAdmin
  const chatHook = useChat({
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

  // Extract values from chat hook with fallbacks
  const {
    messages = [],
    input: chatInput = '',
    handleInputChange: handleChatInputChange,
    handleSubmit,
    isLoading = false,
    setInput: setChatInput
  } = chatHook || {}

  // Ensure handleChatInputChange is always a function
  const safeHandleChatInputChange = useMemo(() => {
    if (handleChatInputChange && typeof handleChatInputChange === 'function') {
      return handleChatInputChange
    }
    return (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (setChatInput && typeof setChatInput === 'function') {
        setChatInput(e.target.value)
      }
    }
  }, [handleChatInputChange, setChatInput])

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
        // Use the appropriate input handler
        if (isManageContext) {
          if (setChatInput && typeof setChatInput === 'function') {
            setChatInput(transcript)
          } else if (handleChatInputChange) {
            // Fallback to handleInputChange if setInput not available
            handleChatInputChange({ target: { value: transcript } } as React.ChangeEvent<HTMLTextAreaElement>)
          }
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
        preventDefault: () => { },
      } as React.FormEvent<HTMLFormElement>
      handleSubmit(syntheticEvent)
      setIsSavingPackage(false)
    }, 100)
  }

  const handleCancelPackage = () => {
    setPendingPackagePreview(null)
  }

  // Test MCP endpoint
  const [testingMCP, setTestingMCP] = useState(false)
  const [mcpTestResult, setMcpTestResult] = useState<string | null>(null)

  const handleTestMCP = async () => {
    if (testingMCP) return

    setTestingMCP(true)
    setMcpTestResult(null)

    try {
      // First verify we're authenticated
      const meResponse = await fetch('/api/users/me')
      if (!meResponse.ok) {
        throw new Error('Not authenticated. Please log in.')
      }

      // Try to get an API key for MCP (MCP endpoint requires API key auth)
      let apiKey: string | null = null
      let apiKeyError: string | null = null

      try {
        const apiKeysResponse = await fetch(`/api/payload-mcp-api-keys?where[user][equals]=${currentUser?.id}`)

        if (!apiKeysResponse.ok) {
          apiKeyError = `Failed to fetch API keys (HTTP ${apiKeysResponse.status})`
        } else {
          const apiKeysData = await apiKeysResponse.json()
          console.log('API Keys Response:', apiKeysData) // Debug log

          if (apiKeysData.docs && apiKeysData.docs.length > 0) {
            // The API key value should be in the 'apiKey' field
            const firstKey = apiKeysData.docs[0]
            apiKey = firstKey.apiKey || firstKey.key || null

            if (!apiKey) {
              apiKeyError = 'API key found but value is empty. Please regenerate the API key in Payload Admin.'
            }
          } else {
            apiKeyError = 'No API keys found for your account.'
          }
        }
      } catch (e) {
        console.warn('Could not fetch API keys:', e)
        apiKeyError = `Error fetching API keys: ${e instanceof Error ? e.message : 'Unknown error'}`
      }

      // If no API key, provide helpful message
      if (!apiKey) {
        throw new Error(
          `${apiKeyError || 'No API key available'}\n\n💡 To use MCP:\n` +
          `1. Go to Payload Admin → Collections → API Keys (Payload MCP API Keys)\n` +
          `2. Create a new API key\n` +
          `3. Copy the key value and use it in your MCP client configuration\n\n` +
          `Note: The generative UI package creation works without MCP API keys!`
        )
      }

      // Test MCP endpoint by calling the list tools method
      // MCP uses JSON-RPC 2.0 protocol and requires API key authentication with Bearer token
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream', // MCP requires both (returns SSE format)
        'Authorization': `Bearer ${apiKey}`, // MCP endpoint expects "Bearer <token>" format
      }

      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers,
        credentials: 'include', // Include cookies as fallback
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.errors?.[0]?.message || errorData.error?.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        if (response.status === 401) {
          errorMessage += '\n\n💡 The API key may be invalid or expired. Try creating a new one in Payload Admin → Collections → API Keys (Payload MCP API Keys)'
        }

        throw new Error(errorMessage)
      }

      // Parse SSE (Server-Sent Events) response
      const responseText = await response.text()

      // SSE format: "event: message\ndata: {...}\n\n"
      // Extract JSON from SSE data field
      let data: any
      if (responseText.startsWith('event:')) {
        // Parse SSE format
        const lines = responseText.split('\n')
        const dataLine = lines.find(line => line.startsWith('data:'))
        if (dataLine) {
          const jsonStr = dataLine.substring(5).trim() // Remove "data:" prefix
          data = JSON.parse(jsonStr)
        } else {
          throw new Error('Invalid SSE response format')
        }
      } else {
        // Plain JSON response
        data = JSON.parse(responseText)
      }

      if (data.error) {
        setMcpTestResult(`Error: ${data.error.message || JSON.stringify(data.error)}`)
      } else {
        const tools = data.result?.tools || []
        const packageTools = tools.filter((t: any) =>
          t.name?.toLowerCase().includes('package') ||
          t.name?.toLowerCase().includes('create') ||
          t.name?.toLowerCase().includes('update') ||
          t.name?.toLowerCase().includes('delete') ||
          t.name?.toLowerCase().includes('find')
        )
        setMcpTestResult(
          `✅ MCP endpoint is working! Found ${tools.length} tool(s), ${packageTools.length} package-related tool(s) available.`
        )
      }
    } catch (error: any) {
      setMcpTestResult(`❌ MCP test failed: ${error.message || 'Unknown error'}`)
    } finally {
      setTestingMCP(false)
    }
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
  const handleCurrentInputChange = isManageContext
    ? safeHandleChatInputChange
    : (e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)
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

                if (part.type === 'tool-findPackages') {
                  switch (part.state) {
                    case 'input-available':
                      return (
                        <div key={index} className="text-sm text-slate-500 italic">
                          Finding packages...
                        </div>
                      )
                    case 'output-available':
                      const packages = part.output.packages || []
                      return (
                        <div key={index} className="text-sm">
                          <div className="mb-2 font-medium">{part.output.message}</div>
                          {packages.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {packages.map((pkg: any, idx: number) => (
                                <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                  <div className="font-medium">{pkg.name}</div>
                                  <div className="text-xs text-slate-500 mt-1">
                                    {pkg.category} • {pkg.minNights}-{pkg.maxNights} nights • {pkg.isEnabled ? 'Enabled' : 'Disabled'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    case 'output-error':
                      return (
                        <div key={index} className="text-sm text-red-600">
                          Error: {part.errorText || 'Failed to find packages'}
                        </div>
                      )
                    default:
                      return null
                  }
                }

                if (part.type === 'tool-updatePackage') {
                  switch (part.state) {
                    case 'input-available':
                      return (
                        <div key={index} className="text-sm text-slate-500 italic">
                          Updating package...
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
                          Error: {part.errorText || 'Failed to update package'}
                        </div>
                      )
                    default:
                      return null
                  }
                }

                if (part.type === 'tool-deletePackage') {
                  switch (part.state) {
                    case 'input-available':
                      return (
                        <div key={index} className="text-sm text-slate-500 italic">
                          Deleting package...
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
                          Error: {part.errorText || 'Failed to delete package'}
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

  // Primary variant for Magic Patterns design
  if (variant === 'primary' && isManageContext) {
    return (
      <div className={cn("w-full max-w-3xl mx-auto mb-12", className)}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-2 bg-teal-50 rounded-full mb-4 ring-1 ring-teal-100">
            <Sparkles className="h-5 w-5 text-teal-600 mr-2" />
            <span className="text-sm font-medium text-teal-900">
              AI Assistant
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">
            How can I help manage your properties today?
          </h1>
          <p className="text-slate-500 text-lg">
            Generate packages, analyze pricing, or draft statements instantly.
          </p>
        </div>

        {/* Render manage context messages with generative UI */}
        {renderManageMessages()}

        {/* Pending package preview */}
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

        {/* MCP Test Result */}
        {mcpTestResult && (
          <div className={cn(
            "rounded-lg border p-3 text-sm mb-6",
            mcpTestResult.includes('✅')
              ? "bg-green-50 text-green-800 border-green-200"
              : "bg-red-50 text-red-800 border-red-200"
          )}>
            {mcpTestResult}
          </div>
        )}

        {/* Input Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 mb-6 transition-shadow hover:shadow-md duration-300">
          <form onSubmit={handleSendMessage}>
            <textarea
              ref={textareaRef}
              value={currentInput}
              onChange={handleCurrentInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || "Describe a new package for your property or ask about recent bookings..."}
              className="w-full min-h-[120px] p-4 text-base text-slate-900 placeholder:text-slate-400 bg-transparent border-none focus:ring-0 resize-none outline-none"
              disabled={currentIsLoading}
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-2">
                {isManageContext && (
                  <>
                    <button
                      type="button"
                      onClick={handleTestMCP}
                      disabled={testingMCP}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
                      title="Test MCP endpoint"
                    >
                      {testingMCP ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Sparkles className="h-5 w-5" />
                      )}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    isListening
                      ? "text-red-500 hover:text-red-600 hover:bg-red-50"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Mic className="h-5 w-5" />
                </button>
              </div>
              <button
                type="submit"
                disabled={!currentInput.trim() || currentIsLoading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentIsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <span>Generate</span>
                    <ArrowUpIcon className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => handleActionClick('Create a new package for my property')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-medium text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 transition-all duration-200 shadow-sm"
          >
            <Package className="h-4 w-4" />
            Generate Packages
          </button>
          <button
            onClick={() => handleActionClick('Show booking statement')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-medium text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 transition-all duration-200 shadow-sm"
          >
            <FileText className="h-4 w-4" />
            Draft Statement
          </button>
          <button
            onClick={() => handleActionClick('Show my packages')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-medium text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 transition-all duration-200 shadow-sm"
          >
            <BarChart2 className="h-4 w-4" />
            View Analytics
          </button>
        </div>
      </div>
    )
  }

  // Default variant (existing design)
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

      {/* MCP Test Result */}
      {mcpTestResult && (
        <div className={cn(
          "rounded-lg border p-3 text-sm",
          mcpTestResult.includes('✅')
            ? "bg-green-50 text-green-800 border-green-200"
            : "bg-red-50 text-red-800 border-red-200"
        )}>
          {mcpTestResult}
        </div>
      )}

      <form onSubmit={handleSendMessage}>
        <InputGroup className="shadow-sm">
          <InputGroupTextarea
            ref={textareaRef}
            value={currentInput}
            onChange={handleCurrentInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || defaultPlaceholder}
            className="min-h-[60px] max-h-[120px] py-3"
            disabled={currentIsLoading}
          />
          <InputGroupAddon align="block-end">
            {isManageContext && (
              <>
                <InputGroupButton
                  variant="outline"
                  size="icon-xs"
                  onClick={handleTestMCP}
                  disabled={testingMCP}
                  type="button"
                  className="rounded-full"
                  title="Test MCP endpoint"
                >
                  {testingMCP ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only">Test MCP</span>
                </InputGroupButton>
                <Separator orientation="vertical" className="!h-4" />
              </>
            )}
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

