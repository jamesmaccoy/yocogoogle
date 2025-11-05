'use client'

import { useState, useEffect, useCallback } from 'react'
import { Estimate, User } from '@/payload-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useYoco } from '@/providers/Yoco'
import { yocoService, YocoProduct, YocoPaymentLink } from '@/lib/yocoService'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, PlusCircleIcon, TrashIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
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
import { Calendar } from '@/components/ui/calendar'
import { DateRange } from 'react-day-picker'
import Link from 'next/link'
import { format } from 'date-fns'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'
// Import package suggestion system
import {
  getCustomerEntitlement,
  type CustomerEntitlement,
} from '@/utils/packageSuggestions'
import { useSubscription } from '@/hooks/useSubscription'

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

interface RevenueCatError extends Error {
  code?: ErrorCode
}

interface RevenueCatProduct {
  identifier?: string
  title?: string
  description?: string
  price?: number
  priceString?: string
  currencyCode?: string
}

type Props = {
  data: Estimate
  user: User
}

export default function EstimateDetailsClientPage({ data, user }: Props) {
  const router = useRouter()
  const { isInitialized } = useYoco()

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
  const [offerings, setOfferings] = useState<YocoProduct[]>([])
  const [loadingOfferings, setLoadingOfferings] = useState(true)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Package suggestion states
  const [selectedPackage, setSelectedPackage] = useState<PostPackage | null>(null)
  const [customerEntitlement, setCustomerEntitlement] = useState<CustomerEntitlement>('none')
  const [isWineSelected, setIsWineSelected] = useState(false)
  const [packagePrice, setPackagePrice] = useState<number | null>(null)

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

  // Load RevenueCat offerings when initialized
  useEffect(() => {
    if (isInitialized) {
      loadOfferings()
    }
  }, [isInitialized])

  const loadOfferings = async () => {
    setLoadingOfferings(true)
    try {
      const purchases = await Purchases.getSharedInstance()
      const fetchedOfferings = await purchases.getOfferings()
      console.log('Offerings:', fetchedOfferings)
      
      // Collect all packages from all offerings instead of just 'per_night'
      const allPackages: Package[] = []
      
      // Add packages from current offering if it exists
      if (fetchedOfferings.current && fetchedOfferings.current.availablePackages.length > 0) {
        allPackages.push(...fetchedOfferings.current.availablePackages)
      }
      
      // Add packages from all other offerings
      Object.values(fetchedOfferings.all).forEach(offering => {
        if (offering && offering.availablePackages.length > 0) {
          allPackages.push(...offering.availablePackages)
        }
      })
      
      // Remove duplicates based on identifier
      const uniquePackages = allPackages.filter((pkg, index, self) => 
        index === self.findIndex(p => p.webBillingProduct?.identifier === pkg.webBillingProduct?.identifier)
      )
      
      console.log('All available packages:', uniquePackages.map(p => p.webBillingProduct?.identifier))
      setOfferings(uniquePackages)
    } catch (err) {
      console.error('Error loading offerings:', err)
      setPaymentError('Failed to load booking options')
    } finally {
      setLoadingOfferings(false)
    }
  }

  // Update package price when package or duration changes
  useEffect(() => {
    if (!selectedPackage) return

    // Use the post's baseRate for calculations
    const basePrice = _postBaseRate

    if (selectedPackage.baseRate && selectedPackage.baseRate > 0) {
      // If package has its own baseRate, use that
      setPackagePrice(selectedPackage.baseRate)
    } else if (selectedPackage.revenueCatId && offerings.length > 0) {
      // Try to find the package in RevenueCat offerings
      const packageToUse = offerings.find(
        (pkg) => pkg.webBillingProduct?.identifier === selectedPackage.revenueCatId,
      )

      if (packageToUse?.webBillingProduct) {
        const product = packageToUse.webBillingProduct as unknown as RevenueCatProduct
        if (product.price) {
          // Use RevenueCat price
          setPackagePrice(Number(product.price))
        } else {
          // Fallback to post baseRate with multiplier
          const calculatedPrice = basePrice * selectedPackage.multiplier
          setPackagePrice(calculatedPrice)
        }
      } else {
        // Package not found in RevenueCat offerings, use post baseRate with multiplier
        const calculatedPrice = basePrice * selectedPackage.multiplier
        setPackagePrice(calculatedPrice)
      }
    } else {
      // For database packages or other cases, use post baseRate with multiplier
      const calculatedPrice = basePrice * selectedPackage.multiplier
      setPackagePrice(calculatedPrice)
    }
  }, [selectedPackage, offerings, _postBaseRate])

  const formatPrice = (price: number | null) => {
    if (price === null) return 'N/A'
    return `R${price.toFixed(2)}`
  }

  // Handle estimate completion
  const handleEstimate = async () => {
    if (!areDatesAvailable || !selectedPackage) return

    setPaymentLoading(true)
    setPaymentError(null)

    try {
      console.log('=== ESTIMATE HANDLING DEBUG ===')
      console.log('Selected package:', {
        id: selectedPackage.id,
        name: selectedPackage.name,
        revenueCatId: selectedPackage.revenueCatId,
        source: selectedPackage.source,
        isEnabled: selectedPackage.isEnabled
      })
      console.log('Available offerings count:', offerings.length)
      console.log('Available offerings:', offerings.map(p => p.webBillingProduct?.identifier))
      
      // Special handling for gathering_monthly package (pro entitlement only)
      if (selectedPackage.revenueCatId === 'gathering_monthly') {
        console.log('🎯 Special handling for gathering_monthly package (pro entitlement only)')
        console.log('🔍 Available offerings:', offerings.map(p => ({
          identifier: p.webBillingProduct?.identifier,
          title: p.webBillingProduct?.title
        })))
        
        // Check if user has pro subscription first
        if (customerEntitlement !== 'pro') {
          console.warn('⚠️ User does not have pro entitlement required for gathering_monthly')
          throw new Error('This package requires a pro subscription. Please upgrade your account.')
        }
        
        // For gathering_monthly, we should go through RevenueCat payment flow
        console.log('🔍 Looking for gathering_monthly product in RevenueCat offerings')
        
        // Try to find the product in offerings
        const gatheringPackage = offerings.find((pkg) => {
          const identifier = pkg.webBillingProduct?.identifier
          console.log('Checking gathering package:', identifier, 'against:', selectedPackage.revenueCatId)
          return identifier === selectedPackage.revenueCatId
        })
        
        if (gatheringPackage) {
          console.log('✅ Found gathering_monthly package in RevenueCat offerings, proceeding with normal payment flow')
          
          // Proceed with normal RevenueCat payment flow
          try {
            const purchases = await Purchases.getSharedInstance()
            const purchaseResult = await purchases.purchase({
              rcPackage: gatheringPackage,
            })

            // After successful purchase, confirm the estimate in backend
            const fromDate = new Date(data.fromDate)
            const toDate = new Date(data.toDate)
            const estimateData = {
              postId: _postId,
              fromDate: fromDate.toISOString(),
              toDate: toDate.toISOString(),
              guests: [],
              baseRate: packagePrice,
              duration: _bookingDuration,
              customer: user.id,
              packageType: selectedPackage.revenueCatId || selectedPackage.id,
            }
            const response = await fetch(`/api/estimates/${data.id}/confirm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(estimateData),
            })
            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.error || 'Failed to confirm estimate')
            }
            const result = await response.json()
            setPaymentSuccess(true)
            setTimeout(() => {
              router.push(`/booking-confirmation?total=${packagePrice}&duration=${_bookingDuration}`)
            }, 1500)
            return
          } catch (purchaseError) {
            const rcError = purchaseError as RevenueCatError
            console.error('RevenueCat Purchase Error:', rcError)
            if (rcError.code === ErrorCode.UserCancelledError) {
              console.log('User cancelled the purchase flow.')
              return
            }
            throw new Error('Failed to complete purchase. Please try again.')
          }
        } else {
          console.warn('❌ gathering_monthly package not found in RevenueCat offerings, using fallback')
          console.log('💡 To enable payment modal, add gathering_monthly to your RevenueCat offerings')
          
          // Fallback to simulated purchase only if package not in offerings
          try {
            console.log('🔄 Simulating purchase for gathering_monthly package (fallback)')
            
            // After successful simulated purchase, confirm the estimate in backend
            const fromDate = new Date(data.fromDate)
            const toDate = new Date(data.toDate)
            const estimateData = {
              postId: _postId,
              fromDate: fromDate.toISOString(),
              toDate: toDate.toISOString(),
              guests: [],
              baseRate: packagePrice,
              duration: _bookingDuration,
              customer: user.id,
              packageType: selectedPackage.revenueCatId || selectedPackage.id,
            }
            
            console.log('📤 Sending estimate confirmation data:', estimateData)
            
            const response = await fetch(`/api/estimates/${data.id}/confirm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(estimateData),
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              console.error('❌ Estimate confirmation failed:', errorData)
              throw new Error(errorData.error || 'Failed to confirm estimate')
            }
            
            const result = await response.json()
            console.log('✅ Estimate confirmed successfully:', result)
            setPaymentSuccess(true)
            setTimeout(() => {
              router.push(`/booking-confirmation?total=${packagePrice}&duration=${_bookingDuration}`)
            }, 1500)
            return
          } catch (simulationError) {
            console.error('❌ Simulated purchase failed:', simulationError)
            throw new Error('Failed to complete purchase. Please try again.')
          }
        }
      }
      
      const estimatePackage = offerings.find((pkg) => {
        const identifier = pkg.webBillingProduct?.identifier
        console.log('Checking package:', identifier, 'against:', selectedPackage.revenueCatId)
        return identifier === selectedPackage.revenueCatId
      })
      
      if (!estimatePackage) {
        console.warn(`❌ Package ${selectedPackage.revenueCatId} not found in RevenueCat offerings`)
        console.log('Selected package details:', {
          id: selectedPackage.id,
          name: selectedPackage.name,
          revenueCatId: selectedPackage.revenueCatId,
          source: selectedPackage.source
        })
        
        // Enhanced fallback logic for both RevenueCat and database packages
        if (selectedPackage.revenueCatId) {
          console.log('✅ Attempting fallback purchase for package:', selectedPackage.revenueCatId)
          
          try {
            // Simulate successful purchase for packages not in RevenueCat offerings
            console.log('🔄 Simulating purchase for package:', selectedPackage.revenueCatId)
            
            // After successful simulated purchase, confirm the estimate in backend
            const fromDate = new Date(data.fromDate)
            const toDate = new Date(data.toDate)
            const estimateData = {
              postId: _postId,
              fromDate: fromDate.toISOString(),
              toDate: toDate.toISOString(),
              guests: [],
              baseRate: packagePrice,
              duration: _bookingDuration,
              customer: user.id,
              packageType: selectedPackage.revenueCatId || selectedPackage.id,
            }
            
            console.log('📤 Sending estimate confirmation data:', estimateData)
            
            const response = await fetch(`/api/estimates/${data.id}/confirm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(estimateData),
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              console.error('❌ Estimate confirmation failed:', errorData)
              throw new Error(errorData.error || 'Failed to confirm estimate')
            }
            
            const result = await response.json()
            console.log('✅ Estimate confirmed successfully:', result)
            setPaymentSuccess(true)
            setTimeout(() => {
              router.push(`/booking-confirmation?total=${packagePrice}&duration=${_bookingDuration}`)
            }, 1500)
            return
          } catch (simulationError) {
            console.error('❌ Simulated purchase failed:', simulationError)
            throw new Error('Failed to complete purchase. Please try again.')
          }
        }
        
        // If we get here, it means no fallback was attempted
        console.error('❌ No fallback logic triggered for package:', selectedPackage.revenueCatId)
        throw new Error(
          `Estimate package not found for ${selectedPackage.revenueCatId}. Please contact support.`,
        )
      }

      console.log('✅ Package found in RevenueCat offerings, proceeding with normal purchase flow')
      
      // RevenueCat Payment Flow
      try {
        const purchaseResult = await Purchases.getSharedInstance().purchase({
          rcPackage: estimatePackage,
        })

        // After successful purchase, confirm the estimate in backend
        const fromDate = new Date(data.fromDate)
        const toDate = new Date(data.toDate)
        const estimateData = {
          postId: _postId,
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          guests: [],
          baseRate: packagePrice,
          duration: _bookingDuration,
          customer: user.id,
          packageType: selectedPackage.revenueCatId || selectedPackage.id,
        }
        const response = await fetch(`/api/estimates/${data.id}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(estimateData),
        })
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to confirm estimate')
        }
        const result = await response.json()
        setPaymentSuccess(true)
        setTimeout(() => {
          router.push(`/booking-confirmation?total=${packagePrice}&duration=${_bookingDuration}`)
        }, 1500)
      } catch (purchaseError) {
        const rcError = purchaseError as RevenueCatError
        console.error('RevenueCat Purchase Error:', rcError)
        if (rcError.code === ErrorCode.UserCancelledError) {
          console.log('User cancelled the purchase flow.')
          return
        }
        throw new Error('Failed to complete purchase. Please try again.')
      }
    } catch (err) {
      console.error('❌ Purchase Error:', err)
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
                    <div className="font-medium">{formatPrice(data.total)}</div>
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
                    <span className="text-2xl font-bold">{formatPrice(_bookingTotal)}</span>
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
                  `Complete Estimate - ${formatPrice(_bookingTotal)}`
                )}
              </Button>
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
