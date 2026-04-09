'use client'

import React, { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Loader2, Sparkles, ArrowRight, X, Package, ExternalLink, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { PackagePreview } from '@/components/PackagePreview'

interface PackageOnboardingProps {
  postId: string
  /** When set, user is enriching an existing package (updatePackageTool) instead of creating new */
  existingPackageId?: string
  onComplete?: (packageData: any) => void
  onCancel?: () => void
  className?: string
}

type Step = 'describe' | 'details'

function getToolName(part: { type?: string }): string {
  const type = typeof part?.type === 'string' ? part.type : ''
  return type.startsWith('tool-') ? type.replace('tool-', '') : ''
}

export function PackageOnboarding({
  postId,
  existingPackageId,
  onComplete,
  onCancel,
  className,
}: PackageOnboardingProps) {
  const [step, setStep] = useState<Step>('describe')
  const [packageName, setPackageName] = useState('')
  const [packageDescription, setPackageDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pendingPackagePreview, setPendingPackagePreview] = useState<any>(null)
  const [isSavingPackage, setIsSavingPackage] = useState(false)
  const [createdPackageId, setCreatedPackageId] = useState<string | null>(null)
  const [lastSuccessWasUpdate, setLastSuccessWasUpdate] = useState(false)

  const isUpdateMode = Boolean(existingPackageId?.trim())

  const manageTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat/manage',
        body: {
          pageData: {
            posts: [{ id: postId }],
            postId,
            ...(existingPackageId?.trim() ? { existingPackageId: existingPackageId.trim() } : {}),
          },
        },
      }),
    [postId, existingPackageId],
  )

  const chatHook = useChat({
    transport: manageTransport,
    onFinish: (result: any) => {
      const message = result?.message || result

      if (message?.role !== 'assistant' || !message.parts) return

      const parts = message.parts as any[]

      const previewPart = parts.find(
        (p: any) =>
          getToolName(p) === 'previewPackage' && p.state === 'output-available',
      )
      if (previewPart?.output && !isUpdateMode) {
        setPendingPackagePreview({
          ...previewPart.output,
          name: packageName || previewPart.output.name,
          description: packageDescription || previewPart.output.description,
        })
        setIsGenerating(false)
        setStep('details')
      }

      const updatePart = parts.find(
        (p: any) => getToolName(p) === 'updatePackage' && p.state === 'output-available',
      )
      if (updatePart?.output?.success) {
        setIsGenerating(false)
        setIsSavingPackage(false)
        const id =
          updatePart.output.package?.id || existingPackageId || null
        if (id) setCreatedPackageId(id)
        setLastSuccessWasUpdate(true)
        setStep('details')
        if (onComplete) {
          onComplete({
            ...updatePart.output.package,
            id,
            ...pendingPackagePreview,
          })
        }
        return
      }
      if (updatePart?.output && updatePart.output.success === false) {
        setIsGenerating(false)
        setIsSavingPackage(false)
        console.error('Package update failed:', updatePart.output)
      }

      const createPart = parts.find(
        (p: any) => getToolName(p) === 'createPackage' && p.state === 'output-available',
      )
      if (createPart?.output?.success) {
        setIsSavingPackage(false)
        setLastSuccessWasUpdate(false)
        const createdPackage = createPart.output.package || createPart.output
        const packageId =
          createPart.output.packageId ||
          createPart.output.package?.id ||
          createdPackage.id ||
          createPart.output.id

        if (packageId) setCreatedPackageId(packageId)

        if (onComplete) {
          onComplete({
            ...createdPackage,
            id: packageId || createdPackage.id,
            ...pendingPackagePreview,
          })
        }
      } else if (createPart?.output && createPart.output.success === false) {
        setIsSavingPackage(false)
        console.error('Package creation failed:', createPart.output)
      }
    },
  } as any)

  const { messages = [], sendMessage, status } = (chatHook || {}) as any
  const chatIsLoading = status === 'submitted' || status === 'streaming'

  const handleDescribeSubmit = async () => {
    if (!packageDescription.trim()) return
    if (!sendMessage) {
      console.error('sendMessage is not available on useChat')
      return
    }

    setIsGenerating(true)
    setStep('details')

    const name = packageName.trim() || 'New Package'
    const desc = packageDescription.trim()

    const prompt = isUpdateMode
      ? `CALL updatePackageTool NOW with packageId="${existingPackageId!.trim()}", property postId="${postId}", name="${name}", description="${desc}". Infer category, minNights, maxNights, baseRate (ZAR cents), multiplier, features, entitlement from the description. Do not respond with text first — call the tool immediately.`
      : `CALL previewPackageTool NOW with name="${name}", description="${desc}", postId="${postId}". DO NOT respond with text — call the tool immediately.`

    try {
      await sendMessage({ role: 'user', content: prompt })
    } catch (e) {
      console.error(e)
      setIsGenerating(false)
    }
  }

  const handleConfirmPackage = async () => {
    if (!pendingPackagePreview || isUpdateMode) return
    if (!sendMessage) {
      setIsSavingPackage(false)
      return
    }

    setIsSavingPackage(true)
    const previewData = { ...pendingPackagePreview }
    const packagePostId = previewData.postId || postId

    const createMessage = `Create this package now using createPackageTool. Package details: name="${previewData.name}", description="${previewData.description}", category="${previewData.category}", minNights=${previewData.minNights}, maxNights=${previewData.maxNights}, baseRate=${previewData.baseRate || 0}, multiplier=${previewData.multiplier || 1}, entitlement="${previewData.entitlement || 'standard'}", postId="${packagePostId}", features=${JSON.stringify(previewData.features || [])}${previewData.revenueCatId ? `, revenueCatId="${previewData.revenueCatId}"` : ''}${previewData.yocoId ? `, yocoId="${previewData.yocoId}"` : ''}.`

    try {
      await sendMessage({ role: 'user', content: createMessage })
    } catch (e) {
      console.error(e)
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

  const renderToolPart = (part: any, index: number) => {
    const tool = getToolName(part)

    if (tool === 'previewPackage') {
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

    if (tool === 'updatePackage') {
      switch (part.state) {
        case 'input-available':
          return (
            <div key={index} className="text-sm text-slate-500 italic">
              Updating package...
            </div>
          )
        case 'output-available':
          return (
            <div
              key={index}
              className={cn(
                'text-sm p-3 rounded-lg',
                part.output.success
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200',
              )}
            >
              {part.output.message || (part.output.success ? 'Package updated.' : 'Update failed.')}
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

    if (tool === 'createPackage') {
      switch (part.state) {
        case 'input-available':
          return (
            <div key={index} className="text-sm text-slate-500 italic">
              Creating package...
            </div>
          )
        case 'output-available':
          return (
            <div
              key={index}
              className={cn(
                'text-sm p-3 rounded-lg',
                part.output.success
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200',
              )}
            >
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
  }

  const renderMessages = () => {
    return (
      <div className="space-y-4">
        {messages.map((message: any) => (
          <div key={message.id} className="flex gap-3">
            <div className="flex-shrink-0">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center shadow-sm',
                  message.role === 'user' ? 'bg-slate-200' : 'bg-primary',
                )}
              >
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
                if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
                  const rendered = renderToolPart(part, index)
                  if (rendered) return rendered
                }
                return null
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const showLoadingCard =
    (isGenerating || chatIsLoading) && !pendingPackagePreview && !createdPackageId

  if (step === 'describe') {
    return (
      <div className={cn('w-full max-w-2xl mx-auto', className)}>
        <Card className="border-2 border-slate-200 shadow-lg">
          <div className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {isUpdateMode ? 'Update package' : 'Create a Package'}
              </h2>
              <p className="text-slate-500">
                {isUpdateMode
                  ? 'Describe how you want this package to read and price. We will apply it to your existing listing.'
                  : 'Start by describing your package'}
              </p>
            </div>

            <div className="mb-8">
              <div className="relative w-full aspect-square max-w-[200px] mx-auto mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-100 via-pink-100 to-blue-100 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                    <Package className="h-8 w-8 text-slate-600" />
                  </div>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900">
                  {isUpdateMode ? 'Existing package' : 'Custom Package'}
                </h3>
                {isUpdateMode && (
                  <p className="text-xs text-slate-500 mt-1 font-mono">{existingPackageId}</p>
                )}
              </div>
            </div>

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

            <div className="mb-6">
              <label htmlFor="package-description" className="block text-sm font-medium text-slate-700 mb-2">
                Description
              </label>
              <Textarea
                id="package-description"
                value={packageDescription}
                onChange={(e) => setPackageDescription(e.target.value)}
                placeholder={
                  isUpdateMode
                    ? 'e.g., Winter special, 3-night min, R4500 base...'
                    : 'Describe what guests get, pricing hints, and duration...'
                }
                className="min-h-[120px] resize-none border-slate-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              {onCancel && (
                <Button variant="outline" onClick={onCancel} className="flex-1">
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleDescribeSubmit}
                disabled={!packageDescription.trim() || isGenerating || chatIsLoading}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
              >
                {isGenerating || chatIsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isUpdateMode ? 'Applying...' : 'Generating...'}
                  </>
                ) : (
                  <>
                    {isUpdateMode ? 'Apply' : 'Next'}
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

  return (
    <div className={cn('w-full max-w-3xl mx-auto space-y-6', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {isUpdateMode ? 'Package update' : 'Package Details'}
          </h2>
          <p className="text-slate-500 mt-1">
            {isUpdateMode
              ? 'Review the assistant result below'
              : 'Review and customize your package settings'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setStep('describe')
            setPendingPackagePreview(null)
            setCreatedPackageId(null)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {renderMessages()}

      {pendingPackagePreview && !createdPackageId && !isUpdateMode && (
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

      {createdPackageId && (
        <Card className="p-6 border-green-200 bg-green-50">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <Package className="h-5 w-5 text-green-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900 mb-1">
                  {lastSuccessWasUpdate ? 'Package updated!' : 'Package created successfully!'}
                </h3>
                <p className="text-sm text-green-700">
                  {lastSuccessWasUpdate
                    ? 'Changes are saved; you can keep editing in the dashboard.'
                    : 'Your package is saved and ready to use.'}
                </p>
              </div>
            </div>

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
                  window.open(`/manage/packages/${postId}`, '_blank')
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
                  setLastSuccessWasUpdate(false)
                  setStep('describe')
                  setPackageName('')
                  setPackageDescription('')
                }}
                className="bg-white hover:bg-green-50 border-green-300"
              >
                <Package className="h-4 w-4 mr-2" />
                {isUpdateMode ? 'Another update' : 'Create Another'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {showLoadingCard && (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            <p className="text-sm text-slate-500">
              {isUpdateMode ? 'Applying your package changes...' : 'Generating package details...'}
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
