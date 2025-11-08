'use client'

import { useState, useEffect } from 'react'
import { Estimate, User } from '@/payload-types'
import { Button } from '@/components/ui/button'
import { useYoco } from '@/providers/Yoco'
import { FileText, Loader2, PlusCircleIcon, TrashIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import InviteUrlDialog from './_components/invite-url-dialog'
import { Media } from '@/components/Media'
import { formatDateTime } from '@/utilities/formatDateTime'
import { UserIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import Link from 'next/link'
import { format } from 'date-fns'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'
// Import package suggestion system
import {
  getCustomerEntitlement,
  type CustomerEntitlement,
} from '@/utils/packageSuggestions'
import { useSubscription } from '@/hooks/useSubscription'

type TokenUsageSummary = {
  total: number | null
  prompt: number | null
  candidates: number | null
  cached: number | null
  thoughts: number | null
  timestamp: number
}

// --- Add the usePackages hook here ---
export interface PostPackage {
  id: string
  name: string
  originalName?: string // Keep track of original name
  description?: string
  multiplier: number
  features: { feature: string }[]
  category: string
  minNights: number
  maxNights: number
  yocoId?: string
  revenueCatId?: string
  baseRate?: number // Package-specific base rate
  isEnabled: boolean
  source?: 'database' | 'yoco'
  hasCustomName?: boolean // Indicates if this package has a custom name set by host
}

export function usePackages(postId: string) {
  const [packages, setPackages] = useState<PostPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!postId) return
    setLoading(true)
    // Use the new endpoint that includes custom names
    fetch(`/api/packages/post/${postId}`)
      .then(res => res.json())
      .then(data => {
        // Transform the data to match PostPackage interface
        const transformedPackages = (data.packages || []).map((pkg: any) => ({
          id: pkg.id,
          name: pkg.name, // This will be the custom name if available
          originalName: pkg.originalName,
          description: pkg.description,
          multiplier: pkg.multiplier,
          features: pkg.features?.map((f: any) => 
            typeof f === 'string' ? { feature: f } : f
          ) || [],
          category: pkg.category,
          minNights: pkg.minNights,
          maxNights: pkg.maxNights,
          revenueCatId: pkg.revenueCatId,
          baseRate: pkg.baseRate, // Include package-specific base rate
          isEnabled: pkg.isEnabled,
          source: pkg.source,
          hasCustomName: pkg.hasCustomName
        }))
        setPackages(transformedPackages)
        setLoading(false)
      })
      .catch(err => {
        setError(err)
        setLoading(false)
      })
  }, [postId])

  return { packages, loading, error }
}

type Props = {
  data: Estimate
  user: User
}

export default function EstimateDetailsClientPage({ data, user }: Props) {
  const { createPaymentLinkFromDatabase } = useYoco()

  // Helper function to get display name from either package type
  const getPackageDisplayName = (pkg: PostPackage | null): string => {
    if (!pkg) return ''
    return pkg.name // PostPackage (which includes custom name)
  }

  // Helper function to check if package is a PostPackage
  const isPostPackage = (pkg: PostPackage | null): pkg is PostPackage => {
    return pkg !== null && 'name' in pkg && !('title' in pkg)
  }

  // Calculate duration and use a fallback for total
  const _bookingDuration =
    data?.fromDate && data?.toDate
      ? Math.max(
          1,
          Math.round(
            (new Date(data.toDate).getTime() - new Date(data.fromDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 1
  
  // Get the post's baseRate properly
  const _postBaseRate = typeof data?.post === 'object' && data?.post?.baseRate 
    ? Number(data.post.baseRate) 
    : 150 // Default fallback
  
  // Use the estimate total if it's valid, otherwise calculate from baseRate
  const _bookingTotal = data?.total && !isNaN(Number(data.total)) && Number(data.total) > 0
    ? Number(data.total)
    : _postBaseRate * _bookingDuration
  
  const _postId = typeof data?.post === 'object' && data?.post?.id ? data.post.id : ''
  const { packages, loading, error } = usePackages(_postId)

  // Payment states
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Package suggestion states
  const [selectedPackage, setSelectedPackage] = useState<PostPackage | null>(null)
  const [customerEntitlement, setCustomerEntitlement] = useState<CustomerEntitlement>('none')
  const [isWineSelected, setIsWineSelected] = useState(false)
  const [packagePrice, setPackagePrice] = useState<number | null>(null)
  const [latestTokenUsage, setLatestTokenUsage] = useState<TokenUsageSummary | null>(null)

  const subscriptionStatus = useSubscription()
  const [areDatesAvailable, setAreDatesAvailable] = useState(true)
  const [removedGuests, setRemovedGuests] = useState<string[]>([])

  // Remove guest handler for estimates
  const removeGuestHandler = async (guestId: string) => {
    try {
      const res = await fetch(`/api/estimates/${data.id}/guests/${guestId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error('Failed to remove guest')
      }

      // Add to removed guests list to update UI immediately
      setRemovedGuests(prev => [...prev, guestId])
    } catch (error) {
      console.error('Error removing guest:', error)
    }
  }

  // Update customer entitlement when subscription status changes
  useEffect(() => {
    const entitlement = getCustomerEntitlement(subscriptionStatus)
    setCustomerEntitlement(entitlement)
  }, [subscriptionStatus])

  // Update package selection when packages are loaded and duration is available
  useEffect(() => {
    if (packages.length > 0 && _bookingDuration > 0 && !selectedPackage) {
      // Find the best package based on duration and enabled status
      const enabledPackages = packages.filter(pkg => pkg.isEnabled)
      
      console.log('Available packages:', enabledPackages.map(pkg => ({
        name: pkg.name,
        minNights: pkg.minNights,
        maxNights: pkg.maxNights,
        revenueCatId: pkg.revenueCatId
      })))
      console.log('Booking duration:', _bookingDuration, 'nights')
      
      if (enabledPackages.length > 0) {
        // Find package that best matches the duration
        let bestPackage = enabledPackages.find(pkg => 
          _bookingDuration >= pkg.minNights && _bookingDuration <= pkg.maxNights
        )
        
        console.log('Exact match found:', bestPackage?.name)
        
        // If no exact match, find the package that can accommodate this duration
        // Prefer packages where maxNights >= duration (can handle the stay)
        if (!bestPackage) {
          const accommodatingPackages = enabledPackages.filter(pkg => 
            pkg.maxNights >= _bookingDuration || pkg.maxNights === 1 // Include per-night packages
          )
          
          if (accommodatingPackages.length > 0) {
            // Sort by how close the minNights is to the duration
            bestPackage = accommodatingPackages.reduce((best, current) => {
              const bestScore = Math.abs(best.minNights - _bookingDuration)
              const currentScore = Math.abs(current.minNights - _bookingDuration)
              return currentScore < bestScore ? current : best
            })
          } else {
            // Fallback to any enabled package
            bestPackage = enabledPackages[0]
          }
        }
        
        // If wine is selected and we have a hosted option, prefer that
        if (isWineSelected) {
          const hostedOption = enabledPackages.find(pkg => 
            pkg.category === 'hosted' || pkg.category === 'special'
          )
          if (hostedOption) {
            bestPackage = hostedOption
          }
        }
        
        setSelectedPackage(bestPackage || null)
        console.log('Auto-selected package:', bestPackage?.name, 'for duration:', _bookingDuration, 'nights')
        console.log('Package details:', {
          minNights: bestPackage?.minNights,
          maxNights: bestPackage?.maxNights,
          multiplier: bestPackage?.multiplier
        })
      }
    }
  }, [packages, _bookingDuration, isWineSelected, selectedPackage])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const readStoredUsage = (): TokenUsageSummary | null => {
      try {
        const stored = window.localStorage.getItem('ai:lastTokenUsage')
        if (!stored) return null
        const parsed = JSON.parse(stored)
        if (!parsed || typeof parsed !== 'object') return null
        return parsed as TokenUsageSummary
      } catch (storageError) {
        console.warn('Failed to load stored AI token usage', storageError)
        return null
      }
    }

    const initialUsage = readStoredUsage()
    if (initialUsage) {
      setLatestTokenUsage(initialUsage)
    }

    const handleTokenUsage = (event: Event) => {
      const customEvent = event as CustomEvent<TokenUsageSummary>
      if (customEvent.detail) {
        setLatestTokenUsage(customEvent.detail)
      }
    }

    window.addEventListener('aiTokenUsage', handleTokenUsage as EventListener)

    return () => {
      window.removeEventListener('aiTokenUsage', handleTokenUsage as EventListener)
    }
  }, [])

  // Update package price when package or duration changes
  useEffect(() => {
    if (!selectedPackage) {
      setPackagePrice(null)
      return
    }

    // Use package-specific base rate when available, otherwise apply multiplier to the post base rate
    if (selectedPackage.baseRate && selectedPackage.baseRate > 0) {
      setPackagePrice(selectedPackage.baseRate)
      return
    }

    const calculatedPrice = _postBaseRate * (selectedPackage.multiplier || 1)
    setPackagePrice(calculatedPrice)
  }, [selectedPackage, _postBaseRate])

  const formatPrice = (price: number | null) => {
    if (price === null) return 'N/A'
    return `R${price.toFixed(2)}`
  }

  const bookingTotal = packagePrice !== null ? packagePrice * _bookingDuration : _bookingTotal

  // Handle estimate completion
  const handleEstimate = async () => {
    if (!areDatesAvailable || !selectedPackage) return

    setPaymentLoading(true)
    setPaymentError(null)

    try {
      if (selectedPackage.revenueCatId === 'gathering_monthly' && customerEntitlement !== 'pro') {
        throw new Error('This package requires a pro subscription. Please upgrade your account.')
      }

      const metadata = {
        estimateId: data.id,
        postId: _postId,
        duration: _bookingDuration,
        startDate: data.fromDate ? new Date(data.fromDate).toISOString() : undefined,
        endDate: data.toDate ? new Date(data.toDate).toISOString() : undefined,
      }

      const paymentLink = await createPaymentLinkFromDatabase?.(
        {
          id: selectedPackage.id,
          name: selectedPackage.name,
          description: selectedPackage.description,
          baseRate: selectedPackage.baseRate,
          revenueCatId: selectedPackage.revenueCatId,
        },
        user?.name || 'Guest',
        bookingTotal,
        metadata,
      )

      if (!paymentLink) {
        throw new Error('Failed to create payment link. Please try again.')
      }

      setPaymentSuccess(true)
      window.location.href = paymentLink.url
    } catch (err) {
      console.error('❌ Payment Error:', err)
      setPaymentError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setPaymentLoading(false)
    }
  }

  if (!data) {
    return <div className="container py-16">Estimate not found</div>
  }

  return (
    <div className="container py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center space-x-4 mb-8">
          <Link
            href="/estimates"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← Back to Estimates
          </Link>
        </div>

        <Tabs defaultValue="details" className="mt-10">
          <TabsList className="mb-6 bg-muted p-2 rounded-full flex flex-row gap-2">
            <TabsTrigger value="details" className="px-3 py-2 rounded-full flex items-center gap-2 data-[state=active]:bg-secondary data-[state=active]:text-foreground">
              <FileText className="h-5 w-5" />
              <span className="hidden sm:inline">Estimate Details</span>
            </TabsTrigger>
            <TabsTrigger value="guests" className="px-3 py-2 rounded-full flex items-center gap-2 data-[state=active]:bg-secondary data-[state=active]:text-foreground">
              <UserIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Guests</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Estimate Details */}
            {data ? (
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-bold">Estimate Details</h1>
                  <p className="text-muted-foreground mt-2">
                    Review and complete your booking estimate
                  </p>
                </div>

                <div className="w-full rounded-md overflow-hidden bg-muted p-2 flex items-center gap-3">
                  {!!(typeof data?.post === 'object' && data?.post?.meta?.image) && (
                    <div className="w-24 h-24 flex-shrink-0 rounded-md overflow-hidden border border-border bg-white">
                      <Media
                        resource={typeof data?.post === 'object' && data?.post?.meta?.image ? data.post.meta.image : undefined}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex flex-col text-white">
                    <span className="font-medium">
                      Date Estimated: {formatDateTime(data?.createdAt)}
                    </span>
                    <span className="font-medium">
                      Guests: {Array.isArray(data?.guests) ? data.guests.length : 0}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-8">Error loading estimate details</div>
            )}

            {/* Package Selection */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                Available Packages 
                <span className="text-sm text-muted-foreground font-normal ml-2">
                  ({_bookingDuration} {_bookingDuration === 1 ? 'night' : 'nights'})
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {loading ? (
                  <div>Loading packages...</div>
                ) : error ? (
                  <div>Error loading packages.</div>
                ) : !packages.length ? (
                  <div>No packages available for this post.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {packages
                      .filter(pkg => pkg.isEnabled)
                      .sort((a, b) => {
                        // Sort packages by how well they match the duration
                        const aDurationMatch = _bookingDuration >= a.minNights && _bookingDuration <= a.maxNights
                        const bDurationMatch = _bookingDuration >= b.minNights && _bookingDuration <= b.maxNights
                        
                        if (aDurationMatch && !bDurationMatch) return -1
                        if (!aDurationMatch && bDurationMatch) return 1
                        
                        // If both match or both don't match, sort by minNights closest to duration
                        const aDistance = Math.abs(a.minNights - _bookingDuration)
                        const bDistance = Math.abs(b.minNights - _bookingDuration)
                        return aDistance - bDistance
                      })
                      .map((pkg) => {
                        const isDurationMatch = _bookingDuration >= pkg.minNights && _bookingDuration <= pkg.maxNights
                        const canAccommodate = pkg.maxNights >= _bookingDuration || pkg.maxNights === 1
                        
                        return (
                          <Card
                            key={pkg.id}
                            className={cn(
                              'cursor-pointer transition-all',
                              selectedPackage?.id === pkg.id
                                ? 'border-primary bg-primary/5'
                                : isDurationMatch
                                ? 'border-green-500/50 hover:border-green-500'
                                : canAccommodate
                                ? 'border-amber-500/50 hover:border-amber-500'
                                : 'border-border hover:border-primary/50'
                            )}
                            onClick={() => setSelectedPackage(pkg)}
                          >
                            <CardHeader>
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <CardTitle>{pkg.name}</CardTitle>
                                    {isDurationMatch && (
                                      <span className="text-xs bg-green-500/10 text-green-700 px-2 py-1 rounded-full">
                                        Perfect Match
                                      </span>
                                    )}
                                    {!isDurationMatch && canAccommodate && (
                                      <span className="text-xs bg-amber-500/10 text-amber-700 px-2 py-1 rounded-full">
                                        Can Accommodate
                                      </span>
                                    )}
                                  </div>
                                  <CardDescription>{pkg.description}</CardDescription>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Duration: {pkg.minNights === pkg.maxNights 
                                      ? `${pkg.minNights} ${pkg.minNights === 1 ? 'night' : 'nights'}`
                                      : `${pkg.minNights}-${pkg.maxNights} nights`
                                    }
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-lg font-bold">
                                    {pkg.baseRate && pkg.baseRate > 0
                                      ? `R${pkg.baseRate.toFixed(0)}/night`
                                      : pkg.multiplier === 1
                                      ? 'Base rate'
                                      : pkg.multiplier > 1
                                      ? `+${((pkg.multiplier - 1) * 100).toFixed(0)}%`
                                      : `-${((1 - pkg.multiplier) * 100).toFixed(0)}%`}
                                  </div>
                                  {pkg.baseRate && pkg.baseRate > 0 && pkg.multiplier !== 1 && (
                                    <div className="text-xs text-muted-foreground">
                                      {pkg.multiplier > 1
                                        ? `+${((pkg.multiplier - 1) * 100).toFixed(0)}% rate`
                                        : `-${((1 - pkg.multiplier) * 100).toFixed(0)}% rate`}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <ul className="space-y-2">
                                {pkg.features.map((f, idx) => (
                                  <li key={idx} className="flex items-center text-sm">
                                    <Check className="mr-2 h-4 w-4 text-primary" />
                                    {f.feature}
                                  </li>
                                ))}
                              </ul>
                            </CardContent>
                            {selectedPackage?.id === pkg.id && (
                              <CardFooter>
                                <span className="text-2xl font-bold text-primary">
                                  {formatPrice(packagePrice)}
                                </span>
                              </CardFooter>
                            )}
                          </Card>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Date Selection */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Booking Period</h2>
              <div className="bg-muted p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Check-in:</span>
                    <div className="font-medium">
                      {data.fromDate ? format(new Date(data.fromDate), 'PPP') : 'Not set'}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Check-out:</span>
                    <div className="font-medium">
                      {data.toDate ? format(new Date(data.toDate), 'PPP') : 'Not set'}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <div className="font-medium">{_bookingDuration} nights</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total:</span>
                    <div className="font-medium">{formatPrice(bookingTotal)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Estimate Summary */}
            <div className="bg-muted p-6 rounded-lg border border-border">
              <h2 className="text-2xl font-semibold mb-4">Estimate Summary</h2>
              {selectedPackage && (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground">Package:</span>
                    <span className="font-medium">{getPackageDisplayName(selectedPackage)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground">Rate per night:</span>
                    <span className="font-medium">{formatPrice(packagePrice)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground">Base rate:</span>
                    <span className="font-medium">R{_postBaseRate.toFixed(0)}/night</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">{_bookingDuration} nights</span>
                  </div>
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="text-2xl font-bold">{formatPrice(bookingTotal)}</span>
                  </div>
                </>
              )}
              
              {/* Complete Estimate Button */}
              <Button
                onClick={handleEstimate}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={
                  paymentLoading || paymentSuccess || !_postId || !selectedPackage || !areDatesAvailable
                }
              >
                {paymentLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : paymentSuccess ? (
                  'Estimate Confirmed!'
                ) : !_postId ? (
                  'Missing Property Information'
                ) : !selectedPackage ? (
                  'Please Select a Package'
                ) : !areDatesAvailable ? (
                  'Dates Not Available'
                ) : (
                  `Complete Estimate - ${formatPrice(bookingTotal)}`
                )}
              </Button>
              <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Latest AI tokens
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latestTokenUsage
                    ? `Total ${typeof latestTokenUsage.total === 'number' ? latestTokenUsage.total : '—'} • Prompt ${typeof latestTokenUsage.prompt === 'number' ? latestTokenUsage.prompt : '—'} • Response ${typeof latestTokenUsage.candidates === 'number' ? latestTokenUsage.candidates : '—'}${typeof latestTokenUsage.cached === 'number' ? ` • Cached ${latestTokenUsage.cached}` : ''}`
                    : 'Interact with the assistant to see Gemini token usage here.'}
                </p>
                {latestTokenUsage?.timestamp && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                    Updated {new Date(latestTokenUsage.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
              <AIAssistant />
              {paymentError && (
                <div className="mt-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {paymentError}
                </div>
              )}
            </div>

          </div>
        </div>
          </TabsContent>

          <TabsContent value="guests">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Guests</h2>
                {data &&
                  'customer' in data &&
                  typeof data?.customer !== 'string' &&
                  data.customer?.id === user.id && (
                    <InviteUrlDialog
                      trigger={
                        <Button>
                          <PlusCircleIcon className="size-4 mr-2" />
                          <span>Invite</span>
                        </Button>
                      }
                      estimateId={data.id}
                      type="estimates"
                    />
                  )}
              </div>
              <div className="mt-2 space-y-3">
                <div className="shadow-sm p-2 border border-border rounded-lg flex items-center gap-2">
                  <div className="p-2 border border-border rounded-full">
                    <UserIcon className="size-6" />
                  </div>
                  <div>
                    <div>{typeof data.customer === 'string' ? 'Customer' : data.customer?.name}</div>
                    <div className="font-medium text-sm">Customer</div>
                  </div>
                </div>
                {data.guests
                  ?.filter((guest) =>
                    typeof guest === 'string'
                      ? !removedGuests.includes(guest)
                      : !removedGuests.includes(guest.id),
                  )
                  ?.map((guest) => {
                    if (typeof guest === 'string') {
                      return <div key={guest}>{guest}</div>
                    }
                    return (
                      <div
                        key={guest.id}
                        className="shadow-sm p-2 border border-border rounded-lg flex items-center gap-2 justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-2 border border-border rounded-full">
                            <UserIcon className="size-6" />
                          </div>
                          <div>
                            <div>{guest.name}</div>
                            <div className="font-medium text-sm">Guest</div>
                          </div>
                        </div>
                        {data &&
                          'customer' in data &&
                          typeof data?.customer !== 'string' &&
                          data.customer?.id === user.id && (
                            <Button
                              variant="secondary"
                              size="icon"
                              onClick={() => removeGuestHandler(guest.id)}
                            >
                              <TrashIcon className="size-4" />
                              <span className="sr-only">Remove Guest</span>
                            </Button>
                          )}
                      </div>
                    )
                  })}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
