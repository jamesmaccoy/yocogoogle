'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Media } from '@/components/Media'
import { type Media as MediaType, Post, Package } from '@/payload-types'
import Link from 'next/link'
import { formatDate } from 'date-fns'
import { useYoco } from '@/providers/Yoco'
import { useUserContext } from '@/context/UserContext'

interface SuggestedPackage {
  id: string
  name: string
  description?: string | null
  baseRate?: number | null
  post?: Post | string | null
  category?: string
  features?: Array<{ feature: string }>
  relatedPage?: string | null
  isActive?: boolean
  bookingCount?: number
  guestCount?: number
  nextBookingDate?: string
  availableCount?: number
  participantsCount?: number
  bookingId?: string // For addons - the booking this addon is tokenized to
  postId?: string // Post ID for payment link creation
  purchasedAddonCount?: number // Number of addons already purchased for this booking
  totalAvailableAddons?: number // Total addons available for this booking
  purchasedAddons?: Array<{ name: string; features: string[] }> // Details of purchased addons
}

interface SuggestedPackagesProps {
  userId: string
}

export default function SuggestedPackages({ userId }: SuggestedPackagesProps) {
  const [activePackages, setActivePackages] = useState<SuggestedPackage[]>([])
  const [inactivePackages, setInactivePackages] = useState<SuggestedPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSuggestedPackages = async () => {
      try {
        setLoading(true)
        
        // Fetch upcoming bookings with full depth to get addonTransactions
        const bookingsResponse = await fetch('/api/bookings?type=upcoming')
        const bookingsData = await bookingsResponse.json()
        const upcomingBookings = bookingsData.bookings || []

        // Fetch addon transactions for each booking
        // The bookings already have addonTransactions populated at depth: 2
        const bookingsWithAddons = upcomingBookings.map((booking: any) => {
          const addonTransactions = booking.addonTransactions || []
          // Extract transaction details if they're populated objects
          const addonDetails = addonTransactions.map((tx: any) => {
            if (typeof tx === 'object' && tx) {
              return {
                id: tx.id,
                packageName: tx.packageName || tx.productName || 'Addon',
                metadata: tx.metadata || {},
                features: tx.metadata?.features || []
              }
            }
            return null
          }).filter(Boolean)
          
          return {
            ...booking,
            addonTransactions: addonDetails
          }
        })

        // Get unique post IDs from bookings
        const bookingPostIds = Array.from(
          new Set(
            bookingsWithAddons
              .map((b: any) => {
                const post = typeof b.post === 'object' ? b.post?.id : b.post
                return post
              })
              .filter(Boolean)
          )
        ) as string[]

        // Also fetch all enabled packages (for market/subscription packages)
        const allPackagesResponse = await fetch('/api/packages?where[isEnabled][equals]=true')
        const allPackagesData = await allPackagesResponse.json()
        const allEnabledPackages = allPackagesData.docs || []
        
        // Get unique post IDs from all enabled packages
        const allPostIds = Array.from(
          new Set([
            ...bookingPostIds,
            ...allEnabledPackages
              .map((pkg: any) => {
                const post = typeof pkg.post === 'object' ? pkg.post?.id : pkg.post
                return post
              })
              .filter(Boolean)
          ])
        ) as string[]

        // Fetch packages for all relevant posts
        const packagePromises = allPostIds.map(async (postId) => {
          try {
            const [packagesRes, addonsRes] = await Promise.all([
              fetch(`/api/packages/post/${postId}`),
              fetch(`/api/packages/addons/${postId}`)
            ])
            
            const packagesData = await packagesRes.json()
            const addonsData = await addonsRes.json()
            
            const allPackages = [
              ...(packagesData.packages || []),
              ...(addonsData.addons || [])
            ]
            
            return { 
              postId, 
              packages: allPackages, 
              bookings: bookingsWithAddons.filter((b: any) => {
                const post = typeof b.post === 'object' ? b.post?.id : b.post
                return post === postId
              }) 
            }
          } catch (error) {
            console.error(`Error fetching packages for post ${postId}:`, error)
            return { postId, packages: [], bookings: [] }
          }
        })

        const results = await Promise.all(packagePromises)
        
        // Process packages and categorize as active/inactive
        const active: SuggestedPackage[] = []
        const inactive: SuggestedPackage[] = []

        // Track packages we've already processed to avoid duplicates
        const processedPackageIds = new Set<string>()

        results.forEach(({ postId, packages, bookings }) => {
          // Get post data for image
          const postData = bookings.length > 0 && typeof bookings[0].post === 'object' 
            ? bookings[0].post 
            : null

          packages.forEach((pkg: any) => {
            // Skip if we've already processed this package
            if (processedPackageIds.has(pkg.id)) {
              return
            }
            processedPackageIds.add(pkg.id)
            const postBookings = bookings.filter((b: any) => {
              const selectedPkg = b.selectedPackage
              if (!selectedPkg) return false
              const pkgId = typeof selectedPkg === 'object' && selectedPkg.package
                ? (typeof selectedPkg.package === 'object' ? selectedPkg.package.id : selectedPkg.package)
                : null
              return pkgId === pkg.id
            })

            // Calculate total guest count across all bookings for this post
            const guestCount = bookings.reduce((sum: number, b: any) => {
              const guests = b.guests || []
              return sum + (Array.isArray(guests) ? guests.length : 0)
            }, 0)

            // Determine if package is checkin service, addon, or market
            const isCheckinService = pkg.name?.toLowerCase().includes('checkin') || 
                                     pkg.revenueCatId === 'per_night_luxury' ||
                                     pkg.yocoId === 'per_night_luxury'
            const isAddon = pkg.category === 'addon'
            const isMarket = pkg.name?.toLowerCase().includes('market') || 
                            pkg.revenueCatId === 'monthly_subscription' ||
                            pkg.yocoId === 'monthly_subscription' ||
                            pkg.revenueCatId === 'rc_weekly' ||
                            pkg.yocoId === 'rc_weekly'

            // For addons, only show if there are bookings to tokenize to
            if (isAddon && bookings.length === 0) {
              // Skip addons without bookings - they're not applicable
              return
            }

            // Get the first booking ID for addon tokenization
            const firstBooking = bookings.length > 0 ? bookings[0] : undefined
            const firstBookingId = firstBooking?.id

            // For addons, calculate purchased count and details
            let purchasedAddonCount = 0
            let purchasedAddons: Array<{ name: string; features: string[] }> = []
            let totalAvailableAddons = 0

            if (isAddon && firstBooking) {
              // Count purchased addons for this booking
              const addonTransactions = firstBooking.addonTransactions || []
              purchasedAddonCount = addonTransactions.length
              
              // Get details of purchased addons
              purchasedAddons = addonTransactions
                .map((tx: any) => {
                  if (typeof tx === 'object' && tx) {
                    return {
                      name: tx.packageName || tx.productName || 'Addon',
                      features: tx.metadata?.features || []
                    }
                  }
                  return null
                })
                .filter(Boolean)
              
              // Get total available addons for this post
              const addonPackages = packages.filter((p: any) => p.category === 'addon')
              totalAvailableAddons = addonPackages.length || 8 // Default to 8 if can't determine
            }

            const packageData: SuggestedPackage = {
              id: pkg.id,
              name: pkg.name,
              description: pkg.description,
              baseRate: pkg.baseRate,
              post: postData || (typeof pkg.post === 'object' ? pkg.post : { id: postId } as Post),
              category: pkg.category,
              features: pkg.features,
              relatedPage: pkg.relatedPage,
              isActive: postBookings.length > 0 || isCheckinService,
              bookingCount: postBookings.length || (isCheckinService ? 1 : 0),
              guestCount,
              nextBookingDate: postBookings.length > 0 
                ? postBookings[0]?.fromDate 
                : undefined,
              availableCount: pkg.maxConcurrentBookings || (isMarket ? 33 : undefined),
              participantsCount: isMarket ? 3 : undefined,
              bookingId: isAddon ? firstBookingId : undefined, // Tokenize addon to booking
              postId: postId,
              purchasedAddonCount,
              totalAvailableAddons,
              purchasedAddons
            }

            // Categorize packages:
            // Active = packages with upcoming bookings OR checkin services/addons for posts with bookings
            // Inactive = market/subscription packages available but not currently booked
            
            const hasBookingsForPost = bookings.length > 0
            
            if (hasBookingsForPost) {
              // Post has upcoming bookings - show checkin service and addons as active
              if (isCheckinService || isAddon || postBookings.length > 0) {
                active.push(packageData)
              }
            } else if (isMarket) {
              // Market/subscription packages - show as inactive
              inactive.push(packageData)
            } else if (isCheckinService && !hasBookingsForPost) {
              // Checkin service available but no bookings - could show as active suggestion
              active.push(packageData)
            }
            // Note: Addons without bookings are now skipped above
          })
        })

        // Sort active by booking date, inactive by name
        active.sort((a, b) => {
          if (a.nextBookingDate && b.nextBookingDate) {
            return new Date(a.nextBookingDate).getTime() - new Date(b.nextBookingDate).getTime()
          }
          // Prioritize checkin service
          const aIsCheckin = a.name?.toLowerCase().includes('checkin')
          const bIsCheckin = b.name?.toLowerCase().includes('checkin')
          if (aIsCheckin && !bIsCheckin) return -1
          if (!aIsCheckin && bIsCheckin) return 1
          return 0
        })

        inactive.sort((a, b) => {
          // Prioritize market packages
          const aIsMarket = a.name?.toLowerCase().includes('market')
          const bIsMarket = b.name?.toLowerCase().includes('market')
          if (aIsMarket && !bIsMarket) return -1
          if (!aIsMarket && bIsMarket) return 1
          return (a.name || '').localeCompare(b.name || '')
        })

        // Prioritize: checkin service and addons for active, market for inactive
        const checkinPackages = active.filter(p => p.name?.toLowerCase().includes('checkin'))
        const addonPackages = active.filter(p => p.category === 'addon')
        const otherActive = active.filter(p => !p.name?.toLowerCase().includes('checkin') && p.category !== 'addon')
        
        const marketPackages = inactive.filter(p => p.name?.toLowerCase().includes('market'))
        const otherInactive = inactive.filter(p => !p.name?.toLowerCase().includes('market'))

        // Create a special addon summary card if we have bookings with addons
        const addonSummaryCard = addonPackages.length > 0 ? addonPackages[0] : null

        setActivePackages([
          ...checkinPackages.slice(0, 1),
          ...(addonSummaryCard ? [addonSummaryCard] : []),
          ...otherActive.slice(0, 1)
        ].slice(0, 2))
        
        setInactivePackages([
          ...marketPackages.slice(0, 1),
          ...otherInactive.slice(0, 1)
        ].slice(0, 1))

        // Track Meta Pixel and Google Tag events for addon suggestions
        if (typeof window !== 'undefined') {
          // Meta Pixel - ViewContent event for addon suggestions
          if ((window as any).fbq && addonPackages.length > 0) {
            addonPackages.forEach((addon) => {
              (window as any).fbq('track', 'ViewContent', {
                content_name: addon.name,
                content_category: 'addon',
                content_ids: [addon.id],
                value: addon.baseRate || 0,
                currency: 'ZAR'
              })
            })
          }

          // Google Tag - view_item event for addon suggestions
          if ((window as any).gtag && addonPackages.length > 0) {
            addonPackages.forEach((addon) => {
              (window as any).gtag('event', 'view_item', {
                currency: 'ZAR',
                value: addon.baseRate || 0,
                items: [{
                  item_id: addon.id,
                  item_name: addon.name,
                  item_category: 'addon',
                  price: addon.baseRate || 0,
                  quantity: 1
                }]
              })
            })
          }
        }
      } catch (error) {
        console.error('Error fetching suggested packages:', error)
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchSuggestedPackages()
    }
  }, [userId])

  if (loading) {
    return null // Or a loading skeleton
  }

  if (activePackages.length === 0 && inactivePackages.length === 0) {
    return null
  }

  return (
    <div className="space-y-10">
      {activePackages.length > 0 && (
        <div>
          <h2 className="text-4xl font-medium tracking-tighter my-6 text-teal-400">Active</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePackages.map((pkg, index) => (
              <PackageSuggestionCard key={`active-${pkg.id}-${index}`} package={pkg} />
            ))}
          </div>
        </div>
      )}

      {inactivePackages.length > 0 && (
        <div>
          <h2 className="text-4xl font-medium tracking-tighter my-6 text-teal-400">Inactive</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inactivePackages.map((pkg, index) => (
              <PackageSuggestionCard key={`inactive-${pkg.id}-${index}`} package={pkg} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PackageSuggestionCard({ package: pkg }: { package: SuggestedPackage }) {
  const post = typeof pkg.post === 'object' ? pkg.post : null
  const postSlug = post?.slug
  const image = post?.meta?.image
  const { createPaymentLinkFromDatabase } = useYoco()
  const { currentUser } = useUserContext()
  const [isLoading, setIsLoading] = useState(false)
  
  const formatPrice = (price?: number | null) => {
    if (!price) return 'R0'
    return `R${price.toLocaleString('en-ZA')}`
  }

  const getButtonText = () => {
    if (pkg.category === 'addon') {
      return `Include the special addon - ${formatPrice(pkg.baseRate)}`
    }
    if (pkg.name?.includes('Checkin') || pkg.name?.includes('checkin')) {
      return `🛎️ CHECKIN SERVICE - ${formatPrice(pkg.baseRate)}`
    }
    if (pkg.name?.includes('Market') || pkg.name?.includes('market')) {
      return `JOIN THE MARKET - ${formatPrice(pkg.baseRate)}`
    }
    return `Book - ${formatPrice(pkg.baseRate)}`
  }

  const handleAddonPurchase = async (e: React.MouseEvent) => {
    if (pkg.category !== 'addon' || !pkg.bookingId || !pkg.baseRate) {
      return
    }

    e.preventDefault()
    setIsLoading(true)

    try {
      if (!createPaymentLinkFromDatabase) {
        throw new Error('Payment service not available')
      }

      const paymentLink = await createPaymentLinkFromDatabase(
        {
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          baseRate: pkg.baseRate,
          revenueCatId: pkg.id,
        },
        currentUser?.name || currentUser?.email || 'Guest',
        pkg.baseRate,
        {
          postId: pkg.postId,
          bookingId: pkg.bookingId, // Tokenize addon to this booking
          intent: 'product',
        },
      )

      if (!paymentLink?.url) {
        throw new Error('Failed to create payment link')
      }

      // Navigate directly to Yoco payment
      window.location.href = paymentLink.url
    } catch (error) {
      console.error('Failed to purchase add-on:', error)
      alert(error instanceof Error ? error.message : 'Failed to create payment link. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const getTitle = () => {
    if (pkg.bookingCount && pkg.bookingCount > 0) {
      return `${pkg.bookingCount} ${pkg.bookingCount === 1 ? 'Stay' : 'Stays'}`
    }
    if (pkg.category === 'addon') {
      // Show "X of Y Add-ons" format
      const purchased = pkg.purchasedAddonCount || 0
      const total = pkg.totalAvailableAddons || 8
      return `${purchased} of ${total} Add-ons`
    }
    if (pkg.name?.includes('Add-on') || pkg.name?.includes('addon')) {
      return '2 of 8 Add-ons'
    }
    if (pkg.name?.includes('Market') || pkg.name?.includes('market')) {
      return `${pkg.participantsCount || 2} Shops online this month`
    }
    return pkg.name || 'Package'
  }

  const getDescription = () => {
    const lines: string[] = []
    
    const isCheckin = pkg.name?.toLowerCase().includes('checkin')
    const isAddon = pkg.category === 'addon'
    const isMarket = pkg.name?.toLowerCase().includes('market')
    
    if (isCheckin && pkg.nextBookingDate) {
      const date = new Date(pkg.nextBookingDate)
      const month = formatDate(date, 'MMMM')
      lines.push(`3 months time in ${month}`)
    }
    
    if (isCheckin && pkg.guestCount && pkg.guestCount > 0) {
      lines.push(`You have invited ${pkg.guestCount} guests`)
    }
    
    if (isAddon) {
      // Show purchased addon details if available
      if (pkg.purchasedAddons && pkg.purchasedAddons.length > 0) {
        const addonDetails = pkg.purchasedAddons.flatMap((addon, idx) => {
          if (addon.features && addon.features.length > 0) {
            return addon.features.map((feature, fIdx) => {
              const featureText = typeof feature === 'string' ? feature : feature.feature || ''
              return `${idx + 1}X ${featureText}`
            })
          }
          return [`${idx + 1}X ${addon.name}`]
        })
        lines.push(...addonDetails.slice(0, 3))
        
        // Add additional addon if available
        if (pkg.purchasedAddons.length > 0 && pkg.features) {
          const availableAddons = pkg.features.filter((f: any) => {
            const featureText = typeof f === 'string' ? f : f.feature || ''
            return !pkg.purchasedAddons?.some(pa => 
              pa.features.some(pf => pf === featureText)
            )
          })
          if (availableAddons.length > 0) {
            const extraFeature = availableAddons[0]
            const extraText = typeof extraFeature === 'string' ? extraFeature : extraFeature.feature || ''
            if (extraText) {
              lines.push(`1X Include ${extraText}`)
            }
          }
        }
      } else if (pkg.features) {
        // No purchased addons - show available addon suggestions
        const featureTexts = pkg.features.slice(0, 3).map((f: any, idx: number) => {
          const feature = typeof f === 'string' ? f : f.feature || ''
          return `${idx + 1}X ${feature}`
        }).join(', ')
        if (featureTexts) {
          lines.push(featureTexts)
        }
        // Add additional addon line if available
        if (pkg.features.length > 3) {
          const extraFeature = pkg.features[3]
          const extraText = typeof extraFeature === 'string' ? extraFeature : extraFeature.feature || ''
          if (extraText) {
            lines.push(`1X Include ${extraText}`)
          }
        }
      }
      
      // Empty state message if no addons
      if ((!pkg.purchasedAddons || pkg.purchasedAddons.length === 0) && (!pkg.features || pkg.features.length === 0)) {
        lines.push('No addons available')
      }
    }
    
    if (isMarket) {
      if (pkg.participantsCount) {
        lines.push(`${pkg.participantsCount} people are joining the Monthly market stall`)
      }
      if (pkg.availableCount) {
        lines.push(`${pkg.availableCount} packages available`)
      }
    }
    
    // Fallback to description if no specific formatting
    if (lines.length === 0 && pkg.description) {
      lines.push(pkg.description)
    }
    
    return lines.length > 0 ? lines : ['']
  }

  // For addons, handle payment directly; for others, link to post
  const isAddon = pkg.category === 'addon'
  const href = !isAddon 
    ? (postSlug 
        ? `/posts/${postSlug}?package=${pkg.id}`
        : pkg.relatedPage 
          ? `/${pkg.relatedPage}?package=${pkg.id}`
          : '#')
    : '#'

  return (
    <Card className="h-full hover:shadow-md transition-shadow">
      <div className="relative">
        {image && typeof image !== 'string' && (
          <div className="relative w-full h-48 overflow-hidden">
            <Media resource={image} size="50vw" className="w-full h-full object-cover" />
          </div>
        )}
        <CardContent className="p-4">
          <h3 className="text-xl font-semibold mb-2 text-teal-400">{getTitle()}</h3>
          <div className="space-y-1 mb-4 text-sm text-muted-foreground">
            {getDescription().map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
          {isAddon && pkg.bookingId ? (
            <Button 
              className="w-full" 
              variant={pkg.isActive ? 'default' : 'secondary'}
              onClick={handleAddonPurchase}
              disabled={isLoading}
            >
              {isLoading ? 'Preparing checkout...' : getButtonText()}
            </Button>
          ) : (
            <Link href={href}>
              <Button className="w-full" variant={pkg.isActive ? 'default' : 'secondary'}>
                {getButtonText()}
              </Button>
            </Link>
          )}
        </CardContent>
      </div>
    </Card>
  )
}

