'use client'

import { Media } from '@/components/Media'
import { Booking, User } from '@/payload-types'
import { formatDateTime } from '@/utilities/formatDateTime'
import { PlusCircleIcon, TrashIcon, UserIcon, FileText, Lock, Package, Calendar as CalendarIcon } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import InviteUrlDialog from './_components/invite-url-dialog'
import SimplePageRenderer from './_components/SimplePageRenderer'
import { Button } from '@/components/ui/button'
import { useYoco } from '@/providers/Yoco'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'
import { DateRange } from 'react-day-picker'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { calculateTotal } from '@/lib/calculateTotal'
import { formatAmountToZAR } from '@/lib/currency'

type Props = {
  data: Booking
  user: User
}



interface AddonPackage {
  id: string;
  name: string;
  originalName: string;
  description?: string;
  multiplier: number;
  category: string;
  minNights: number;
  maxNights: number;
  revenueCatId: string;
  baseRate?: number;
  isEnabled: boolean;
  features: any[];
  relatedPage?: any; // Related page data
  source: string;
  hasCustomName: boolean;
}

// Helper to format and convert price (kept for potential future use)
function formatPriceWithUSD(product: any) {
  const price = product.price;
  const priceString = product.priceString;
  const currency = product.currencyCode || 'ZAR';
  // Fallback: if price is undefined, show N/A
  if (typeof price !== 'number') return 'N/A';
  // If already USD, just show
  if (currency === 'USD') return `$${price.toFixed(2)}`;
  // Convert ZAR to USD (example rate: 1 USD = 18 ZAR)
  const usd = price / 18;
  return `${priceString || `R${price.toFixed(2)}`} / $${usd.toFixed(2)}`;
}

export default function BookingDetailsClientPage({ data, user }: Props) {
  const [removedGuests, setRemovedGuests] = React.useState<string[]>([])
  const router = useRouter()

  // Addon packages state
  const [addonPackages, setAddonPackages] = useState<AddonPackage[]>([])
  const [loadingAddons, setLoadingAddons] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [currentAddonId, setCurrentAddonId] = useState<string | null>(null)
  const { isInitialized, createPaymentLinkFromDatabase } = useYoco();

  // Related pages state
  const [relatedPages, setRelatedPages] = useState<any[]>([])
  const [loadingPages, setLoadingPages] = useState(true)
  
  // Date picker states for new estimate requests
  const [selectedDates, setSelectedDates] = useState<DateRange | undefined>()
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isSubmittingEstimate, setIsSubmittingEstimate] = useState(false)
  
  // Available packages state
  const [availablePackages, setAvailablePackages] = useState<any[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  
  // Unavailable dates state
  const [unavailableDates, setUnavailableDates] = useState<Date[]>([])
  const [loadingUnavailableDates, setLoadingUnavailableDates] = useState(false)
  
  // Error state for estimate creation
  const [estimateError, setEstimateError] = useState<string | null>(null)

  const packageSnapshot = React.useMemo(() => {
    const selectedPackage = data?.selectedPackage

    let resolvedPackage: any =
      selectedPackage && typeof selectedPackage.package === 'object'
        ? selectedPackage.package
        : null

    let resolvedPackageId: string | null = null

    if (selectedPackage) {
      if (typeof selectedPackage.package === 'string') {
        resolvedPackageId = selectedPackage.package
      } else if (typeof selectedPackage.package === 'object' && selectedPackage.package?.id) {
        resolvedPackageId = selectedPackage.package.id
      }
    }

    if (!resolvedPackage && resolvedPackageId) {
      resolvedPackage = availablePackages.find((pkg) => pkg.id === resolvedPackageId) || null
    }

    if (!resolvedPackage) {
      const fallbackPackage = availablePackages.find((pkg) => pkg.isEnabled)
      if (fallbackPackage) {
        resolvedPackage = fallbackPackage
        resolvedPackageId = fallbackPackage.id
      }
    }

    const fallbackBaseRate =
      typeof data?.post === 'object' && data?.post?.baseRate
        ? Number(data.post.baseRate)
        : 150

    const resolvedBaseRateRaw = resolvedPackage?.baseRate
    const resolvedBaseRate =
      resolvedBaseRateRaw !== undefined && !isNaN(Number(resolvedBaseRateRaw))
        ? Number(resolvedBaseRateRaw)
        : fallbackBaseRate

    const selectedPackageMultiplier = selectedPackage ? (selectedPackage as any).multiplier : undefined
    const resolvedMultiplier =
      selectedPackageMultiplier !== undefined && !isNaN(Number(selectedPackageMultiplier))
        ? Number(selectedPackageMultiplier)
        : resolvedPackage && (resolvedPackage as any).multiplier !== undefined && !isNaN(Number((resolvedPackage as any).multiplier))
        ? Number((resolvedPackage as any).multiplier)
        : 1

    const resolvedName =
      selectedPackage?.customName || resolvedPackage?.name || 'Standard stay'

    return {
      id: resolvedPackageId,
      name: resolvedName,
      baseRate: resolvedBaseRate,
      multiplier: resolvedMultiplier,
    }
  }, [availablePackages, data?.post, data?.selectedPackage])

  const bookingDuration = React.useMemo(() => {
    if (!data?.fromDate || !data?.toDate) return null

    const from = new Date(data.fromDate)
    const to = new Date(data.toDate)

    return Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)))
  }, [data?.fromDate, data?.toDate])

  const currentPackageTotal = React.useMemo(() => {
    if (data?.total && !isNaN(Number(data.total))) {
      return Number(data.total)
    }

    if (!bookingDuration) return null

    return calculateTotal(packageSnapshot.baseRate, bookingDuration, packageSnapshot.multiplier)
  }, [bookingDuration, data?.total, packageSnapshot.baseRate, packageSnapshot.multiplier])

  useEffect(() => {
    const loadPackages = async () => {
      setLoadingAddons(true)
      try {
        // Get the post ID from the booking data
        const postId = typeof data?.post === 'string' ? data.post : data?.post?.id
        if (!postId) {
          throw new Error('No post ID found')
        }
        
        // Fetch both addon packages and all packages to check for related pages
        const [addonsResponse, allPackagesResponse] = await Promise.all([
          fetch(`/api/packages/addons/${postId}`),
          fetch(`/api/packages/post/${postId}`)
        ])
        
        if (!addonsResponse.ok || !allPackagesResponse.ok) {
          throw new Error('Failed to fetch packages')
        }
        
        const [addonsData, allPackagesData] = await Promise.all([
          addonsResponse.json(),
          allPackagesResponse.json()
        ])
        
        setAddonPackages(addonsData.addons || [])
        
        // Also collect related pages from all packages (not just addons)
        const allPackages = allPackagesData.packages || []
        const packagesWithPages = allPackages.filter((pkg: any) => pkg.relatedPage)
        
        if (packagesWithPages.length > 0) {
          // Fetch full page data for each related page
          const pagePromises = packagesWithPages.map(async (pkg: any) => {
            try {
              const pageResponse = await fetch(`/api/pages/${pkg.relatedPage.id}?depth=2&draft=false&locale=undefined`)
              if (pageResponse.ok) {
                const fullPageData = await pageResponse.json()
                return {
                  ...fullPageData,
                  packageName: pkg.name,
                  packageId: pkg.id
                }
              } else {
                // Fallback to basic data if full fetch fails
                return {
                  ...pkg.relatedPage,
                  packageName: pkg.name,
                  packageId: pkg.id
                }
              }
            } catch (error) {
              console.error(`Error fetching page ${pkg.relatedPage.id}:`, error)
              // Fallback to basic data
              return {
                ...pkg.relatedPage,
                packageName: pkg.name,
                packageId: pkg.id
              }
            }
          })
          
          const pages = await Promise.all(pagePromises)
          setRelatedPages(pages)
        }
        
        // Set all packages as available packages for display
        setAvailablePackages(allPackagesData.packages || [])
        setLoadingPackages(false)
      } catch (err) {
        console.error('Error loading packages:', err)
        setPaymentError('Failed to load packages')
      } finally {
        setLoadingAddons(false)
      }
    }
    
    loadPackages()
  }, [data?.post])

  // Set loading pages to false when packages are loaded
  useEffect(() => {
    if (!loadingAddons) {
      setLoadingPages(false)
    }
  }, [loadingAddons])

  const removeGuestHandler = async (guestId: string) => {
    const res = await fetch(`/api/bookings/${data.id}/guests/${guestId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      console.error('Error removing guest:', res.statusText)
      return
    }

    setRemovedGuests((prev) => [...prev, guestId])
  }

  const loadUnavailableDates = async () => {
    const postId = typeof data?.post === 'string' ? data.post : data?.post?.id
    if (!postId) return
    
    setLoadingUnavailableDates(true)
    try {
      const response = await fetch(`/api/bookings/unavailable-dates?postId=${postId}`)
      if (response.ok) {
        const data = await response.json()
        const dates = data.unavailableDates.map((dateStr: string) => new Date(dateStr))
        setUnavailableDates(dates)
      }
    } catch (error) {
      console.error('Error loading unavailable dates:', error)
    } finally {
      setLoadingUnavailableDates(false)
    }
  }

  const handleEstimateRequest = async () => {
    if (!selectedDates?.from || !selectedDates?.to) return

    setIsSubmittingEstimate(true)
    setEstimateError(null)

    try {
      const postId = typeof data?.post === 'string' ? data.post : data?.post?.id
      if (!postId) {
        throw new Error('No post ID found')
      }

      const availabilityResponse = await fetch(
        `/api/bookings/check-availability?postId=${postId}&startDate=${selectedDates.from.toISOString()}&endDate=${selectedDates.to.toISOString()}`,
      )

      if (!availabilityResponse.ok) {
        throw new Error('Failed to check availability')
      }

      const availabilityData = await availabilityResponse.json()

      if (!availabilityData.isAvailable) {
        setEstimateError('The selected dates are not available. Please choose different dates.')
        setIsSubmittingEstimate(false)
        return
      }

      const fromDateObj = new Date(selectedDates.from)
      const toDateObj = new Date(selectedDates.to)
      const duration = Math.max(
        1,
        Math.round((toDateObj.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24)),
      )

      const packageBaseRate = packageSnapshot.baseRate
      const packageMultiplier = packageSnapshot.multiplier
      const packageId = packageSnapshot.id
      const packageName = packageSnapshot.name

      const estimateTotal = calculateTotal(packageBaseRate, duration, packageMultiplier)

      const formattedDateRange = `${format(fromDateObj, 'LLL dd, y')} - ${format(toDateObj, 'LLL dd, y')}`
      const formattedTotal = formatAmountToZAR(estimateTotal)

      const redirectParams = new URLSearchParams({
        postId,
        startDate: fromDateObj.toISOString(),
        endDate: toDateObj.toISOString(),
        duration: duration.toString(),
        baseRate: packageBaseRate.toString(),
        multiplier: packageMultiplier.toString(),
        total: estimateTotal.toString(),
      })

      if (packageId) {
        redirectParams.set('packageId', packageId)
      }

      const redirectUrl = `/estimate?${redirectParams.toString()}`

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('openAIAssistant', {
            detail: {
              context: 'booking-reschedule',
              postId,
              message: `Please help me reschedule to ${formattedDateRange}.`,
              rescheduleData: {
                postTitle: typeof data?.post === 'object' ? data.post.title : 'your stay',
                packageName,
                fromDate: fromDateObj.toISOString(),
                toDate: toDateObj.toISOString(),
                duration,
                baseRate: packageBaseRate,
                multiplier: packageMultiplier,
                total: estimateTotal,
                formattedTotal,
                formattedDateRange,
                redirectUrl,
              },
            },
          }),
        )
      }

      router.prefetch(redirectUrl)
      setSelectedDates(undefined)
    } catch (error) {
      console.error('Error preparing estimate redirect:', error)
      setEstimateError('Failed to prepare estimate. Please try again.')
    } finally {
      setIsSubmittingEstimate(false)
    }
  }

  const handleAddonPurchase = async (addon: AddonPackage) => {
    if (!createPaymentLinkFromDatabase) {
      setPaymentError('Payments are not available right now. Please try again later.')
      return
    }

    const postId = typeof data?.post === 'string' ? data.post : data?.post?.id

    if (!postId) {
      setPaymentError('Missing property information for this add-on.')
      return
    }

    const baseRate = Number(addon.baseRate ?? 0)
    const multiplier = Number(addon.multiplier ?? 1)
    const total = Number((baseRate * multiplier).toFixed(2))

    if (!total || total <= 0) {
      setPaymentError('This add-on is not available for online purchase yet.')
      return
    }

    setPaymentLoading(true)
    setCurrentAddonId(addon.id)
    setPaymentError(null)
    setPaymentSuccess(false)

    try {
      const metadata = {
        postId,
        duration: bookingDuration ?? undefined,
        startDate: data?.fromDate ? new Date(data.fromDate).toISOString() : undefined,
        endDate: data?.toDate ? new Date(data.toDate).toISOString() : undefined,
        intent: 'product' as const,
      }

      const paymentLink = await createPaymentLinkFromDatabase(
        {
          id: addon.id,
          name: addon.name,
          description: addon.description,
          baseRate: addon.baseRate,
          revenueCatId: addon.revenueCatId,
        },
        user?.name || user?.email || 'Guest',
        total,
        metadata,
      )

      if (!paymentLink) {
        throw new Error('Failed to create payment link for this add-on.')
      }

      setPaymentSuccess(true)
      window.location.href = paymentLink.url
    } catch (err) {
      console.error('Failed to purchase add-on:', err)
      setPaymentError(err instanceof Error ? err.message : 'Failed to create payment link. Please try again.')
    } finally {
      setPaymentLoading(false)
      setCurrentAddonId(null)
    }
  }

  // Create booking context for AI Assistant
  const getBookingContext = () => {
    const booking = data
    const post = typeof booking?.post === 'string' ? null : booking?.post
    
    return {
      context: 'booking-details',
      booking: {
        id: booking?.id,
        title: booking?.title,
        fromDate: booking?.fromDate,
        toDate: booking?.toDate,
        paymentStatus: booking?.paymentStatus,
        createdAt: booking?.createdAt
      },
      property: post ? {
        id: post.id,
        title: post.title,
        description: post.meta?.description || '',
        content: post.content,
        baseRate: post.baseRate,
        relatedPosts: post.relatedPosts || []
      } : null,
      guests: {
        customer: typeof booking?.customer === 'string' ? null : {
          id: booking?.customer?.id,
          name: booking?.customer?.name,
          email: booking?.customer?.email
        },
        guests: booking?.guests?.filter(guest => typeof guest !== 'string').map(guest => ({
          id: guest.id,
          name: guest.name,
          email: guest.email
        })) || []
      },
      addons: addonPackages.map(addon => ({
        id: addon.id,
        name: addon.name,
        description: addon.description,
        price: (addon.baseRate || 0) * addon.multiplier,
        features: addon.features
      })),
      checkinInfo: relatedPages.map(page => ({
        id: page.id,
        title: page.title,
        packageName: page.packageName,
        content: page.layout
      }))
    }
  }

  return (
    <div className="container my-10">
      <Tabs defaultValue="details" className="mt-10 max-w-screen-md mx-auto">
        <TabsList className="mb-6 bg-muted p-2 rounded-full flex flex-row gap-2">
          <TabsTrigger value="details" className="px-3 py-2 rounded-full flex items-center gap-2 data-[state=active]:bg-secondary data-[state=active]:text-foreground">
            <FileText className="h-5 w-5" />
            <span className="hidden sm:inline">Booking & Guests</span>
          </TabsTrigger>
          {relatedPages.length > 0 && (
            <TabsTrigger value="sensitive" className="px-3 py-2 rounded-full flex items-center gap-2 data-[state=active]:bg-secondary data-[state=active]:text-foreground">
              <Lock className="h-5 w-5" />
              <span className="hidden sm:inline">Check-in Info</span>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="details">
          {data && 'post' in data && typeof data?.post !== 'string' ? (
            <div className="space-y-8">
              {/* Booking Details Section */}
              <div className="flex items-start flex-col md:flex-row gap-5 md:gap-10">
                <div className="md:py-5 py-3">
                  <h1 className="text-4xl mb-3 font-bold">{data?.post.title}</h1>
                  <div className="flex flex-col gap-2">
                    <label className="text-lg font-medium">Booking Details:</label>
                    <div className="text-muted-foreground text-sm">
                      {data?.selectedPackage && data.selectedPackage.package && typeof data.selectedPackage.package === 'object'
                        ? `Package: ${data.selectedPackage.customName || data.selectedPackage.package.name || 'Package'}`
                        : data?.selectedPackage && data.selectedPackage.customName
                        ? `Package: ${data.selectedPackage.customName}`
                        : 'Package: No package assigned'}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Rate: {formatAmountToZAR(packageSnapshot.baseRate)} · Multiplier: {packageSnapshot.multiplier.toFixed(2)}x
                      {currentPackageTotal !== null && typeof currentPackageTotal === 'number'
                        ? ` · Booking total: ${formatAmountToZAR(currentPackageTotal)}`
                        : ''}
                    </div>
                    <label className="text-lg font-medium">Booking Dates:</label>
                    <Calendar
                      mode="range"
                      selected={{
                        from: data?.fromDate ? new Date(data.fromDate) : undefined,
                        to: data?.toDate ? new Date(data.toDate) : undefined,
                      }}
                      numberOfMonths={2}
                      className="max-w-md"
                    />
                    <div className="text-muted-foreground text-sm mt-1">
                      {data?.fromDate && data?.toDate
                        ? `From ${formatDateTime(data.fromDate)} to ${formatDateTime(data.toDate)}`
                        : 'Select a start and end date'}
                    </div>
                    
                    {/* Request New Estimate Button */}
                    <div className="mt-4">
                      <Popover open={isDatePickerOpen} onOpenChange={(open) => {
                        setIsDatePickerOpen(open)
                        if (open) {
                          loadUnavailableDates()
                        }
                      }}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedDates?.from ? (
                              selectedDates.to ? (
                                <>
                                  {format(selectedDates.from, "LLL dd, y")} -{" "}
                                  {format(selectedDates.to, "LLL dd, y")}
                                </>
                              ) : (
                                format(selectedDates.from, "LLL dd, y")
                              )
                            ) : (
                              <span>Request new estimate for different dates</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={selectedDates?.from}
                            selected={selectedDates}
                            onSelect={(range) => {
                              setSelectedDates(range)
                              setEstimateError(null) // Clear error when dates change
                              if (range?.from && range?.to) {
                                setIsDatePickerOpen(false)
                              }
                            }}
                            numberOfMonths={2}
                            disabled={(date) => {
                              const today = new Date()
                              today.setHours(0, 0, 0, 0)
                              
                              // Disable past dates
                              if (date < today) return true
                              
                              // Disable unavailable dates
                              return unavailableDates.some(unavailableDate => {
                                const unavailable = new Date(unavailableDate)
                                unavailable.setHours(0, 0, 0, 0)
                                const checkDate = new Date(date)
                                checkDate.setHours(0, 0, 0, 0)
                                return unavailable.getTime() === checkDate.getTime()
                              })
                            }}
                          />
                          {loadingUnavailableDates && (
                            <div className="p-2 text-xs text-muted-foreground text-center">
                              Loading availability...
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                      
                      {selectedDates?.from && selectedDates?.to && (
                        <div className="mt-3 space-y-2">
                          <div className="text-sm text-muted-foreground">
                            Requesting estimate for: {format(selectedDates.from, "LLL dd, y")} to {format(selectedDates.to, "LLL dd, y")}
                          </div>
                          <Button 
                            onClick={handleEstimateRequest}
                            disabled={isSubmittingEstimate}
                            className="w-full"
                          >
                            {isSubmittingEstimate ? 'Creating Estimate...' : 'Create New Estimate'}
                          </Button>
                          {estimateError && (
                            <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                              {estimateError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                
                <div className="w-full rounded-md overflow-hidden bg-muted p-2 flex items-center gap-3">
                  {!!data?.post.meta?.image && (
                    <div className="w-24 h-24 flex-shrink-0 rounded-md overflow-hidden border border-border bg-white">
                      <Media
                        resource={data?.post.meta?.image || undefined}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex flex-col text-white">
                    <span className="font-medium">Date Booked: {formatDateTime(data?.post.createdAt)}</span>
                    <span className="font-medium">Guests: {Array.isArray(data?.guests) ? data.guests.length : 0}</span>
                  </div>
                </div>
              </div>

              {/* Guests Section */}
              <div className="border-t pt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold">Guests</h2>
                  {data &&
                    'customer' in data &&
                    typeof data?.customer !== 'string' &&
                    data.customer?.id === user.id && (
                      <InviteUrlDialog
                        bookingId={data.id}
                        trigger={
                          <Button>
                            <PlusCircleIcon className="size-4 mr-2" />
                            <span>Invite</span>
                          </Button>
                        }
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
            </div>
          ) : (
            <div>Error loading booking details</div>
          )}
        </TabsContent>
        {relatedPages.length > 0 && (
          <TabsContent value="sensitive">
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-2xl font-bold">Check-in Information</h2>
              </div>
              <div className="text-sm text-muted-foreground mb-4">
                This information is only visible to you and your guests. Please keep it confidential.
              </div>
              {loadingPages ? (
                <p>Loading check-in information...</p>
              ) : (
                <div className="space-y-6">
                  {relatedPages.map((page, index) => (
                    <div key={`${page.id || 'page'}-${page.packageId || index}`} className="border rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-primary/10 rounded-full">
                          <Lock className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{page.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            Related to: {page.packageName}
                          </p>
                        </div>
                      </div>
                      {page.layout && (
                        <SimplePageRenderer page={page} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
      {/* Addon packages from database */}
      <div className="mt-10 max-w-screen-md mx-auto">
        <h2 className="text-2xl font-bold mb-4">Add-ons</h2>
        {loadingAddons ? (
          <p>Loading add-ons...</p>
        ) : addonPackages.length === 0 ? (
          <p className="text-muted-foreground">No add-ons available for this property.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {addonPackages.map((addon) => {
              const isWine = addon.revenueCatId === 'Bottle_wine';
              const isCleaning = addon.revenueCatId === 'cleaning';
              const isHike = addon.revenueCatId === 'Hike';
              const isBathBomb = addon.revenueCatId === 'bathBomb';
              
              // Calculate price based on base rate and multiplier
              const baseRate = addon.baseRate || 0;
              const price = baseRate * addon.multiplier;
              const priceString = `R${price.toFixed(2)}`;
              
              return (
                <div key={addon.id} className="border rounded-lg p-4 flex flex-col items-center">
                  <div className="font-bold text-lg mb-2">{addon.name}</div>
                  <div className="mb-2 text-muted-foreground text-sm">{addon.description || addon.originalName}</div>
                  <div className="mb-4 text-xl font-bold">{priceString}</div>
                  {addon.features && addon.features.length > 0 && (
                    <div className="mb-3 text-xs text-muted-foreground text-center">
                      {addon.features.map((feature: any, index: number) => (
                        <div key={index}>{feature.label || feature}</div>
                      ))}
                    </div>
                  )}
                  <Button
                    className={
                      isWine ? "bg-primary text-primary-foreground hover:bg-primary/90" : 
                      isCleaning ? "bg-yellow-200 text-yellow-900" : 
                      isHike ? "bg-green-200 text-green-900" : 
                      isBathBomb ? "bg-pink-200 text-pink-900" : ""
                    }
                    onClick={() => handleAddonPurchase(addon)}
                    disabled={paymentLoading || !isInitialized}
                  >
                    {paymentLoading && currentAddonId === addon.id
                      ? 'Preparing checkout...'
                      : isWine
                      ? 'Buy Bottle of Wine'
                      : isCleaning
                      ? 'Add Cleaning'
                      : isHike
                      ? 'Book Guided Hike'
                      : isBathBomb
                      ? 'Add Bath Bomb'
                      : `Purchase ${addon.name}`}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
        {paymentError && <div className="text-red-500 mt-2">{paymentError}</div>}
        {paymentSuccess && <div className="text-green-600 mt-2">Add-on purchased successfully!</div>}
      </div>
      
      {/* AI Assistant with booking context */}
      <AIAssistant />
      
      {/* Set context for AI Assistant */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', function() {
              const context = ${JSON.stringify(getBookingContext())};
              window.bookingContext = context;
            });
          `
        }}
      />
    </div>
  )
}
