'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Loader2, Sparkles, ArrowRight, X, Package, ExternalLink, Edit, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat } from '@ai-sdk/react'
import { PackagePreview } from '@/components/PackagePreview'

interface PackageOnboardingProps {
  postId: string
  onComplete?: (packageData: any) => void
  onCancel?: () => void
  className?: string
}

type Step = 'describe' | 'details'

export function PackageOnboarding({ 
  postId, 
  onComplete, 
  onCancel,
  className 
}: PackageOnboardingProps) {
  const [step, setStep] = useState<Step>('describe')
  const [packageName, setPackageName] = useState('')
  const [packageDescription, setPackageDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pendingPackagePreview, setPendingPackagePreview] = useState<any>(null)
  const [isSavingPackage, setIsSavingPackage] = useState(false)
  const [createdPackageId, setCreatedPackageId] = useState<string | null>(null)

  // Use AI SDK's useChat hook for generative UI
  const chatHook = useChat({
    api: '/api/chat/manage',
    body: {
      pageData: {
        posts: [{ id: postId }],
        postId,
      },
    },
    onFinish: (result: any) => {
      // onFinish receives an object with a 'message' property, not the message directly
      const message = result?.message || result
      
      // Check if the finished message has a package preview tool call
      if (message?.role === 'assistant' && message.parts) {
        const previewPart = message.parts.find((part: any) => 
          part.type === 'tool-previewPackage' && part.state === 'output-available'
        )
        if (previewPart?.output) {
          setPendingPackagePreview({
            ...previewPart.output,
            name: packageName || previewPart.output.name,
            description: packageDescription || previewPart.output.description,
          })
          setIsGenerating(false)
          setStep('details')
        }

        // Check if package was created successfully
        const createPart = message.parts.find((part: any) => 
          part.type === 'tool-createPackage' && part.state === 'output-available'
        )
        if (createPart?.output?.success) {
          setIsSavingPackage(false)
          // Extract package ID from the tool output structure
          // createPackageTool returns: { success: true, package: { id, ... }, packageId: "...", message: "..." }
          const createdPackage = createPart.output.package || createPart.output
          // Try multiple paths to get the package ID
          const packageId = createPart.output.packageId || 
                           createPart.output.package?.id || 
                           createdPackage.id ||
                           createPart.output.id
          
          console.log('✅ Package created successfully:', { 
            packageId, 
            output: createPart.output,
            createdPackage,
            availablePaths: {
              topLevelPackageId: createPart.output.packageId,
              nestedPackageId: createPart.output.package?.id,
              createdPackageId: createdPackage.id,
              outputId: createPart.output.id,
            }
          })
          
          if (packageId) {
            setCreatedPackageId(packageId)
          } else {
            console.error('❌ Package created but ID not found in response:', createPart.output)
            // Still try to proceed - maybe the ID will be available later
          }
          
          if (onComplete) {
            // Pass the full created package data including ID
            onComplete({
              ...createdPackage,
              id: packageId || createdPackage.id,
              ...pendingPackagePreview, // Merge preview data for any missing fields
            })
          }
        } else if (createPart?.output?.success === false) {
          // Handle creation failure
          setIsSavingPackage(false)
          const errorMessage = createPart.output.error || createPart.output.message || 'Unknown error'
          console.error('❌ Package creation failed:', {
            error: errorMessage,
            output: createPart.output
          })
          // TODO: Show error message to user in UI
        }
      }
    },
  } as any)

  // Extract values from chat hook with fallbacks (using type assertion to handle AI SDK types)
  const { 
    messages = [], 
    input: chatInput = '', 
    handleInputChange: handleChatInputChange, 
    handleSubmit, 
    isLoading = false,
    append
  } = (chatHook || {}) as any

  const handleDescribeSubmit = async () => {
    if (!packageDescription.trim()) return

    setIsGenerating(true)
    setStep('details')

    // Create a message that asks the AI to generate package details
    // Use direct command format to trigger immediate tool call
    // Make it extremely explicit to force tool execution
    const prompt = `CALL previewPackageTool NOW with name="${packageName || 'New Package'}", description="${packageDescription}", postId="${postId}". DO NOT respond with text - call the tool immediately.`

    // Use append method if available, otherwise use handleInputChange + handleSubmit
    if (append && typeof append === 'function') {
      await append({ role: 'user', content: prompt })
    } else if (handleChatInputChange && handleSubmit) {
      // Create synthetic event to set input
      const syntheticChangeEvent = {
        target: { value: prompt }
      } as React.ChangeEvent<HTMLTextAreaElement>
      handleChatInputChange(syntheticChangeEvent)
      
      // Wait a tick for input to update, then submit
      setTimeout(() => {
        const syntheticSubmitEvent = {
          preventDefault: () => {},
        } as React.FormEvent<HTMLFormElement>
        handleSubmit(syntheticSubmitEvent)
      }, 100)
    }
  }

  const handleConfirmPackage = async () => {
    if (!pendingPackagePreview) return
    
    setIsSavingPackage(true)
    const previewData = { ...pendingPackagePreview }
    
    // Create a message that explicitly asks the AI to use createPackageTool
    // Use direct command format to trigger immediate tool call
    // Ensure postId is included - use previewData.postId if available, otherwise use prop postId
    const packagePostId = previewData.postId || postId
    const createMessage = `Create this package now using createPackageTool. Package details: name="${previewData.name}", description="${previewData.description}", category="${previewData.category}", minNights=${previewData.minNights}, maxNights=${previewData.maxNights}, baseRate=${previewData.baseRate || 0}, multiplier=${previewData.multiplier || 1}, entitlement="${previewData.entitlement || 'standard'}", postId="${packagePostId}", features=${JSON.stringify(previewData.features || [])}${previewData.revenueCatId ? `, revenueCatId="${previewData.revenueCatId}"` : ''}${previewData.yocoId ? `, yocoId="${previewData.yocoId}"` : ''}.`
    
    console.log('📦 Creating package with postId:', { 
      packagePostId, 
      previewPostId: previewData.postId, 
      propPostId: postId,
      previewData 
    })
    
    // Use append method if available, otherwise use handleInputChange + handleSubmit
    if (append && typeof append === 'function') {
      await append({ role: 'user', content: createMessage })
      // Don't call onComplete here - wait for onFinish callback to handle it
    } else if (handleChatInputChange && handleSubmit) {
      // Create synthetic event to set input
      const syntheticChangeEvent = {
        target: { value: createMessage }
      } as React.ChangeEvent<HTMLTextAreaElement>
      handleChatInputChange(syntheticChangeEvent)
      
      // Wait a tick for input to update, then submit
      setTimeout(() => {
        const syntheticSubmitEvent = {
          preventDefault: () => {},
        } as React.FormEvent<HTMLFormElement>
        handleSubmit(syntheticSubmitEvent)
        // Don't call onComplete here - wait for onFinish callback to handle it
      }, 100)
    } else {
      setIsSavingPackage(false)
    }
  }

  const handleCancelPackage = () => {
    setPendingPackagePreview(null)
    if (onCancel) {
      onCancel()
    } else {
      setStep('describe')
      setPackageName('')
      setPackageDescription('')
    }
  }

  // Render messages for generative UI
  const renderMessages = () => {
    return (
      <div className="space-y-4">
        {messages.map((message: any) => (
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
                          Generating package details...
                        </div>
                      )
                    case 'output-available':
                      return (
                        <div key={index} className="my-4">
                          <PackagePreview
                            {...part.output}
                            name={packageName || part.output.name}
                            description={packageDescription || part.output.description}
                            onConfirm={handleConfirmPackage}
                            onCancel={handleCancelPackage}
                            isSaving={isSavingPackage}
                          />
                        </div>
                      )
                    case 'output-error':
                      return (
                        <div key={index} className="text-sm text-red-600">
                          Error: {part.errorText || 'Failed to generate package details'}
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

  // Step 1: Describe Package (Instagram AI Studio style)
  if (step === 'describe') {
    return (
      <div className={cn("w-full max-w-2xl mx-auto", className)}>
        <Card className="border-2 border-slate-200 shadow-lg">
          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Create a Package
              </h2>
              <p className="text-slate-500">
                Start by describing your package
              </p>
            </div>

            {/* Custom Package Card (Instagram style) */}
            <div className="mb-8">
              <div className="relative w-full aspect-square max-w-[200px] mx-auto mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-100 via-pink-100 to-blue-100 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                    <Package className="h-8 w-8 text-slate-600" />
                  </div>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900">Custom Package</h3>
              </div>
            </div>

            {/* Name Input */}
            <div className="mb-4">
              <label htmlFor="package-name" className="block text-sm font-medium text-slate-700 mb-2">
                Package Name (optional)
              </label>
              <input
                id="package-name"
                type="text"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="e.g., Weekend Getaway"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              />
            </div>

            {/* Description Input */}
            <div className="mb-6">
              <label htmlFor="package-description" className="block text-sm font-medium text-slate-700 mb-2">
                Description
              </label>
              <Textarea
                id="package-description"
                value={packageDescription}
                onChange={(e) => setPackageDescription(e.target.value)}
                placeholder="Package that creates packages in the real world. Survive..."
                className="min-h-[120px] resize-none border-slate-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-4">
              {onCancel && (
                <Button
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleDescribeSubmit}
                disabled={!packageDescription.trim() || isGenerating}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Step 2: Package Details (Generative UI)
  return (
    <div className={cn("w-full max-w-3xl mx-auto space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Package Details
          </h2>
          <p className="text-slate-500 mt-1">
            Review and customize your package settings
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setStep('describe')
            setPendingPackagePreview(null)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Generative UI Messages */}
      {renderMessages()}

      {/* Pending Package Preview */}
      {pendingPackagePreview && !createdPackageId && (
        <div className="my-4">
          <PackagePreview
            {...pendingPackagePreview}
            name={packageName || pendingPackagePreview.name}
            description={packageDescription || pendingPackagePreview.description}
            onConfirm={handleConfirmPackage}
            onCancel={handleCancelPackage}
            isSaving={isSavingPackage}
          />
        </div>
      )}

      {/* Success State with Quick Actions */}
      {createdPackageId && (
        <Card className="p-6 border-green-200 bg-green-50">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <Package className="h-5 w-5 text-green-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 mb-1">
                  Package Created Successfully!
                </h3>
                <p className="text-sm text-green-700">
                  Your package has been created and is ready to use.
                </p>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-green-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(`/api/packages/${createdPackageId}?depth=2`, '_blank')
                }}
                className="bg-white hover:bg-green-50 border-green-300"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Package API
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(`/manage/packages?postId=${postId}`, '_blank')
                }}
                className="bg-white hover:bg-green-50 border-green-300"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Manage Packages
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreatedPackageId(null)
                  setPendingPackagePreview(null)
                  setStep('describe')
                  setPackageName('')
                  setPackageDescription('')
                }}
                className="bg-white hover:bg-green-50 border-green-300"
              >
                <Package className="h-4 w-4 mr-2" />
                Create Another
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading State */}
      {(isGenerating || isLoading) && !pendingPackagePreview && !createdPackageId && (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            <p className="text-sm text-slate-500">
              Generating package details...
            </p>
            {(isGenerating || isLoading) && (
              <p className="text-xs text-slate-400 mt-2">
                This may take a few seconds. The AI is analyzing your request...
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

