'use client'

import { Media } from '@/components/Media'
import { Booking, User } from '@/payload-types'
import { formatDateTime } from '@/utilities/formatDateTime'
import { PlusCircleIcon, TrashIcon, UserIcon, FileText, Lock } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import InviteUrlDialog from './_components/invite-url-dialog'
import SimplePageRenderer from './_components/SimplePageRenderer'
import { Button } from '@/components/ui/button'
import { useYoco } from '@/providers/Yoco'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'
import { DateRange } from 'react-day-picker'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'

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

  // Addon packages state
  const [addonPackages, setAddonPackages] = useState<AddonPackage[]>([])
  const [loadingAddons, setLoadingAddons] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const { isInitialized } = useRevenueCat();

  // Related pages state
  const [relatedPages, setRelatedPages] = useState<any[]>([])
  const [loadingPages, setLoadingPages] = useState(true)

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
                    <label className="text-lg font-medium">Booking Dates:</label>
                    <Calendar
                      mode="range"
                      selected={{
                        from: data?.fromDate ? new Date(data.fromDate) : undefined,
                        to: data?.toDate ? new Date(data.toDate) : undefined,
                      }}
                      numberOfMonths={2}
                      className="max-w-md"
                      disabled={() => true}
                    />
                    <div className="text-muted-foreground text-sm mt-1">
                      {data?.fromDate && data?.toDate
                        ? `From ${formatDateTime(data.fromDate)} to ${formatDateTime(data.toDate)}`
                        : 'Select a start and end date'}
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
                    <div key={page.id || index} className="border rounded-lg p-6">
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
                    onClick={async () => {
                      setPaymentLoading(true)
                      setPaymentError(null)
                      try {
                        // For now, we'll use a placeholder purchase flow
                        // In the future, this could integrate with RevenueCat or a custom payment system
                        console.log('Purchasing addon:', addon)
                        // Simulate purchase delay
                        await new Promise(resolve => setTimeout(resolve, 1000))
                        setPaymentSuccess(true)
                      } catch (err) {
                        setPaymentError('Failed to purchase add-on')
                      } finally {
                        setPaymentLoading(false)
                      }
                    }}
                    disabled={paymentLoading}
                  >
                    {isWine ? 'Buy Bottle of Wine' : 
                     isCleaning ? 'Add Cleaning' : 
                     isHike ? 'Book Guided Hike' : 
                     isBathBomb ? 'Add Bath Bomb' : 
                     `Purchase ${addon.name}`}
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
