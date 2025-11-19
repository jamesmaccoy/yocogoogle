'use client'

import type { Booking, User } from '@/payload-types'
import { formatDateTime } from '@/utilities/formatDateTime'
import {
  PlusCircleIcon,
  TrashIcon,
  UserIcon,
  FileText,
  Lock,
  Package,
  Calendar as CalendarIcon,
  Sparkles,
} from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import InviteUrlDialog from './_components/invite-url-dialog'
import SimplePageRenderer from './_components/SimplePageRenderer'
import { Button } from '@/components/ui/button'
import { useYoco } from '@/providers/Yoco'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { calculateTotal } from '@/lib/calculateTotal'
import { PackageDisplay } from '@/components/PackageDisplay'
import { BookingInfoCard } from '@/components/BookingInfoCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import BookingSidebar from './_components/BookingSidebar'

type Props = {
  data: Booking
  user: User
}

interface AddonPackage {
  id: string
  name: string
  originalName: string
  description?: string
  multiplier: number
  category: string
  minNights: number
  maxNights: number
  revenueCatId: string
  baseRate?: number
  isEnabled: boolean
  features: any[]
  relatedPage?: any
  source: string
  hasCustomName: boolean
}

// Helper to format and convert price (kept for potential future use)
function formatPriceWithUSD(product: any) {
  const price = product.price
  const priceString = product.priceString
  const currency = product.currencyCode || 'ZAR'
  if (typeof price !== 'number') return 'N/A'
  if (currency === 'USD') return `$${price.toFixed(2)}`
  const usd = price / 18
  return `${priceString || `R${price.toFixed(2)}`} / $${usd.toFixed(2)}`
}

export default function BookingDetailsClientPage({ data, user }: Props) {
  const [removedGuests, setRemovedGuests] = React.useState<string[]>([])
  const router = useRouter()

  const [addonPackages, setAddonPackages] = useState<AddonPackage[]>([])
  const [loadingAddons, setLoadingAddons] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const { isInitialized, createPaymentLinkFromDatabase } = useYoco()
  const [currentAddonId, setCurrentAddonId] = useState<string | null>(null)

  const [relatedPages, setRelatedPages] = useState<any[]>([])
  const [loadingPages, setLoadingPages] = useState(true)

  const [availablePackages, setAvailablePackages] = useState<any[]>([])

  const [isSubmittingEstimate, setIsSubmittingEstimate] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [assistantHistory, setAssistantHistory] = useState<
    {
      role: 'user' | 'assistant'
      content: string
      timestamp: number
      threadId: number
    }[]
  >([])
  const historyKey = React.useMemo(() => (data?.id ? `ai:bookingHistory:${data.id}` : null), [data?.id])

  useEffect(() => {
    if (typeof window === 'undefined' || !historyKey) return

    try {
      const stored: any[] = JSON.parse(window.localStorage.getItem(historyKey) ?? '[]')
      if (Array.isArray(stored)) {
        setAssistantHistory(stored)
      } else {
        setAssistantHistory([])
      }
    } catch {
      setAssistantHistory([])
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail
      if (detail?.key === historyKey && Array.isArray(detail?.history)) {
        setAssistantHistory(detail.history)
      }
    }

    window.addEventListener('aiHistoryUpdate', handler as EventListener)
    return () => {
      window.removeEventListener('aiHistoryUpdate', handler as EventListener)
    }
  }, [historyKey])

  const clearAssistantHistory = useCallback(() => {
    if (typeof window === 'undefined' || !historyKey) return
    window.localStorage.removeItem(historyKey)
    const empty: any[] = []
    setAssistantHistory(empty)
    window.dispatchEvent(new CustomEvent('aiHistoryUpdate', { detail: { key: historyKey, history: empty } }))
  }, [historyKey])

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

  const getBookingContext = React.useCallback(() => {
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
        createdAt: booking?.createdAt,
      },
      property: post
        ? {
            id: post.id,
            title: post.title,
            description: post.meta?.description || '',
            content: post.content,
            baseRate: post.baseRate,
            relatedPosts: post.relatedPosts || [],
            categories: Array.isArray(post.categories)
              ? post.categories.map((c: any) => typeof c === 'object' ? c : c)
              : [],
          }
        : null,
      guests: {
        customer:
          typeof booking?.customer === 'string'
            ? null
            : {
                id: booking?.customer?.id,
                name: booking?.customer?.name,
                email: booking?.customer?.email,
              },
        guests:
          booking?.guests
            ?.filter((guest) => typeof guest !== 'string')
            .map((guest) => ({
              id: guest.id,
              name: guest.name,
              email: guest.email,
            })) || [],
      },
      addons: addonPackages.map((addon) => ({
        id: addon.id,
        name: addon.name,
        description: addon.description,
        price: (addon.baseRate || 0) * addon.multiplier,
        features: addon.features,
      })),
      checkinInfo: relatedPages.map((page) => ({
        id: page.id,
        title: page.title,
        packageName: page.packageName,
        content: page.layout,
      })),
    }
  }, [addonPackages, data, relatedPages])

  const bookingContext = React.useMemo(() => getBookingContext(), [getBookingContext])
  const bookingContextJson = React.useMemo(() => JSON.stringify(bookingContext ?? {}), [bookingContext])

  const handleAskAssistant = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('openAIAssistant', {
        detail: bookingContext,
      }),
    )
  }, [bookingContext])

  const handleScrollToAddons = useCallback(() => {
    const target = document.getElementById('booking-addons')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleAddonPurchase = useCallback(
    async (addon: AddonPackage) => {
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
      setPaymentSuccess(false)
      setPaymentError(null)
      setCurrentAddonId(addon.id)

      try {
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
          {
            postId,
            intent: 'product',
          },
        )

        if (!paymentLink?.url) {
          throw new Error('Failed to create payment link')
        }

        setPaymentSuccess(true)
        window.location.href = paymentLink.url
      } catch (error) {
        console.error('Failed to purchase add-on:', error)
        setPaymentError(error instanceof Error ? error.message : 'Failed to create payment link. Please try again.')
      } finally {
        setPaymentLoading(false)
        setCurrentAddonId(null)
      }
    },
    [createPaymentLinkFromDatabase, data?.post, user?.email, user?.name],
  )

  const packageSnapshot = React.useMemo(() => {
    const selectedPackage = data?.selectedPackage
    const packageTypeCode = data?.packageType?.toString().trim() || null

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
      resolvedPackage =
        availablePackages.find(
          (pkg) =>
            pkg.id === resolvedPackageId ||
            pkg.yocoId === resolvedPackageId ||
            pkg.revenueCatId === resolvedPackageId,
        ) || null
    }

    if (!resolvedPackage && packageTypeCode) {
      const code = packageTypeCode.toLowerCase()
      const matchedPackage = availablePackages.find((pkg: any) => {
        const idMatch = pkg?.id?.toString().toLowerCase() === code
        const yocoMatch = pkg?.yocoId?.toString().toLowerCase() === code
        const revenueCatMatch = pkg?.revenueCatId?.toString().toLowerCase() === code
        return idMatch || yocoMatch || revenueCatMatch
      })

      if (matchedPackage) {
        resolvedPackage = matchedPackage
        resolvedPackageId = matchedPackage.id
      } else {
        resolvedPackageId = resolvedPackageId ?? packageTypeCode
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
      selectedPackage?.customName ||
      resolvedPackage?.name ||
      (packageTypeCode ? packageTypeCode.replace(/[-_]/g, ' ') : undefined)

    const resolvedDescription = resolvedPackage?.description ?? null
    const resolvedCategory = resolvedPackage?.category ?? null
    const resolvedMinNights =
      resolvedPackage?.minNights !== undefined ? Number(resolvedPackage.minNights) : null
    const resolvedMaxNights =
      resolvedPackage?.maxNights !== undefined ? Number(resolvedPackage.maxNights) : null

    const resolvedFeatures = Array.isArray(resolvedPackage?.features)
      ? resolvedPackage.features
          .map((feature: any) => {
            if (!feature) return null
            if (typeof feature === 'string') return feature
            if (typeof feature === 'object') {
              if (typeof feature.label === 'string') return feature.label
              if (typeof feature.feature === 'string') return feature.feature
            }
            return null
          })
          .filter(Boolean)
      : []

    return {
      id: resolvedPackageId,
      name: resolvedName,
      description: resolvedDescription,
      features: resolvedFeatures,
      category: resolvedCategory,
      minNights: resolvedMinNights,
      maxNights: resolvedMaxNights,
      baseRate: resolvedBaseRate,
      multiplier: resolvedMultiplier,
      customName: selectedPackage?.customName || null,
      hasResolvedPackage: Boolean(resolvedPackage),
      packageTypeCode,
    }
  }, [availablePackages, data?.packageType, data?.post, data?.selectedPackage])

  useEffect(() => {
    console.log('Booking package snapshot', {
      bookingId: data?.id,
      packageType: data?.packageType,
      resolvedPackageId: packageSnapshot?.id,
      hasResolvedPackage: packageSnapshot?.hasResolvedPackage,
    })
  }, [data?.id, data?.packageType, packageSnapshot])

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

    if (!bookingDuration || !packageSnapshot) return null

    return calculateTotal(packageSnapshot.baseRate, bookingDuration, packageSnapshot.multiplier)
  }, [bookingDuration, data?.total, packageSnapshot])

  useEffect(() => {
    const loadPackages = async () => {
      setLoadingAddons(true)
      setPaymentError(null)
      try {
        const postId = typeof data?.post === 'string' ? data.post : data?.post?.id
        if (!postId) {
          throw new Error('No post ID found')
        }

        const [addonsResponse, allPackagesResponse] = await Promise.all([
          fetch(`/api/packages/addons/${postId}`),
          fetch(`/api/packages/post/${postId}`),
        ])

        if (!addonsResponse.ok || !allPackagesResponse.ok) {
          throw new Error('Failed to fetch packages')
        }

        const [addonsData, allPackagesData] = await Promise.all([
          addonsResponse.json(),
          allPackagesResponse.json(),
        ])

        const resolvedAddons = Array.isArray(addonsData)
          ? addonsData
          : Array.isArray(addonsData?.addons)
            ? addonsData.addons
            : []
        setAddonPackages(resolvedAddons)

        const resolvedPackages = Array.isArray(allPackagesData)
          ? allPackagesData
          : Array.isArray(allPackagesData?.packages)
            ? allPackagesData.packages
            : []
        const packagesWithPages = resolvedPackages.filter((pkg: any) => pkg.relatedPage)

        if (packagesWithPages.length > 0) {
          const pagePromises = packagesWithPages.map(async (pkg: any) => {
            try {
              const pageResponse = await fetch(`/api/pages/${pkg.relatedPage.id}?depth=2&draft=false&locale=undefined`)
              if (!pageResponse.ok) {
                throw new Error(`Failed to fetch page: ${pageResponse.statusText}`)
              }
              return pageResponse.json()
            } catch (err) {
              console.error(`Error fetching page ${pkg.relatedPage.id}:`, err)
              return null
            }
          })
          const pages = await Promise.all(pagePromises)
          setRelatedPages(pages)
        }

        setAvailablePackages(resolvedPackages)
      } catch (err) {
        console.error('Error loading packages:', err)
        setPaymentError('Failed to load packages')
      } finally {
        setLoadingAddons(false)
      }
    }

    loadPackages()
  }, [data?.post])

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <div className="container max-w-6xl mx-auto px-4 py-8 md:py-12">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="order-2 lg:order-1 lg:w-[280px] lg:flex-shrink-0">
            <BookingSidebar
              history={assistantHistory}
              onClearHistory={assistantHistory.length > 0 ? clearAssistantHistory : undefined}
            />
          </aside>
          <div className="order-1 flex-1 space-y-8 lg:order-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-1 bg-primary rounded-full" />
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {data && 'post' in data && typeof data?.post !== 'string' ? data?.post.title : 'Booking Details'}
                </h1>
              </div>
              <p className="text-muted-foreground text-lg">
                {data?.fromDate && data?.toDate
                  ? `${format(new Date(data.fromDate), 'MMM dd, yyyy')} - ${format(new Date(data.toDate), 'MMM dd, yyyy')}`
                  : 'View and manage your booking'}
              </p>
            </div>

            <Tabs defaultValue="details" className="space-y-8">
              <TabsList className="inline-flex h-12 items-center justify-center rounded-xl bg-muted p-1.5 text-muted-foreground shadow-sm">
                <TabsTrigger
                  value="details"
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow gap-2"
                >
                  <FileText className="h-4 w-4" />
                  <span>Details</span>
                </TabsTrigger>
                {relatedPages.length > 0 && (
                  <TabsTrigger
                    value="sensitive"
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow gap-2"
                  >
                    <Lock className="h-4 w-4" />
                    <span>Check-in Info</span>
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="details" className="space-y-8">
                {data && 'post' in data && typeof data?.post !== 'string' ? (
                  <>
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 space-y-6">
                        <Card className="overflow-hidden border-2">
                          <CardHeader className="bg-muted/50">
                            <div className="flex items-center gap-2">
                              <Package className="h-5 w-5 text-primary" />
                              <CardTitle>Your Package</CardTitle>
                            </div>
                            <CardDescription>
                              {data?.selectedPackage &&
                              data.selectedPackage.package &&
                              typeof data.selectedPackage.package === 'object'
                                ? data.selectedPackage.customName || data.selectedPackage.package.name || 'Package'
                                : data?.selectedPackage && data.selectedPackage.customName
                                  ? data.selectedPackage.customName
                                  : packageSnapshot?.hasResolvedPackage
                                    ? packageSnapshot?.name || 'Package'
                                    : 'No package assigned'}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pt-6">
                            {data?.selectedPackage &&
                            data.selectedPackage.package &&
                            typeof data.selectedPackage.package === 'object' ? (
                              <PackageDisplay
                                packageData={{
                                  name: data.selectedPackage.package.name || 'Package',
                                  description: data.selectedPackage.package.description || null,
                                  features:
                                    data.selectedPackage.package.features?.map((f: any) => f.feature || f) || null,
                                  category: data.selectedPackage.package.category || null,
                                  minNights: data.selectedPackage.package.minNights || null,
                                  maxNights: data.selectedPackage.package.maxNights || null,
                                  baseRate: data.selectedPackage.package.baseRate || null,
                                  multiplier: data.selectedPackage.package.multiplier || null,
                                }}
                                customName={data.selectedPackage.customName || null}
                                total={data.total}
                                variant="booking"
                              />
                            ) : data?.selectedPackage && data.selectedPackage.customName ? (
                              <div className="p-4 bg-muted/50 rounded-lg border">
                                <div className="flex items-center gap-2">
                                  <Package className="h-5 w-5 text-primary" />
                                  <div>
                                    <div className="font-medium">{data.selectedPackage.customName}</div>
                                    <div className="text-sm text-muted-foreground">Custom package</div>
                                  </div>
                                </div>
                              </div>
                            ) : packageSnapshot?.hasResolvedPackage ? (
                              <PackageDisplay
                                packageData={{
                                  name: packageSnapshot?.name || 'Package',
                                  description: packageSnapshot?.description,
                                  features:
                                    packageSnapshot?.features && packageSnapshot.features.length > 0
                                      ? packageSnapshot.features
                                      : null,
                                  category: packageSnapshot?.category,
                                  minNights: packageSnapshot?.minNights,
                                  maxNights: packageSnapshot?.maxNights,
                                  baseRate: packageSnapshot?.baseRate,
                                  multiplier: packageSnapshot?.multiplier,
                                }}
                                customName={packageSnapshot?.customName}
                                total={currentPackageTotal ?? undefined}
                                variant="booking"
                              />
                            ) : (
                              <div className="p-6 bg-muted/30 rounded-lg border border-dashed text-center">
                                <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">No package assigned to this booking</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center gap-2">
                              <CalendarIcon className="h-5 w-5 text-primary" />
                              <CardTitle>Booking Dates</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <Calendar
                              mode="range"
                              selected={{
                                from: data?.fromDate ? new Date(data.fromDate) : undefined,
                                to: data?.toDate ? new Date(data.toDate) : undefined,
                              }}
                              numberOfMonths={2}
                              className="rounded-md border"
                              disabled={() => true}
                            />
                            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                              <p className="text-sm font-medium">
                                {data?.fromDate && data?.toDate
                                  ? `${formatDateTime(data.fromDate)} → ${formatDateTime(data.toDate)}`
                                  : 'Select dates'}
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <UserIcon className="h-5 w-5 text-primary" />
                                <CardTitle>Guests</CardTitle>
                              </div>
                              {data &&
                                'customer' in data &&
                                typeof data?.customer !== 'string' &&
                                data.customer?.id === user.id && (
                                  <InviteUrlDialog
                                    bookingId={data.id}
                                    trigger={
                                      <Button size="sm" variant="outline">
                                        <PlusCircleIcon className="size-4 mr-2" />
                                        <span>Invite</span>
                                      </Button>
                                    }
                                  />
                                )}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border-2 border-primary/20">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <UserIcon className="h-5 w-5" />
                              </div>
                              <div className="flex-1">
                                <div className="font-medium">
                                  {typeof data.customer === 'string' ? 'Customer' : data.customer?.name}
                                </div>
                                <Badge variant="secondary" className="text-xs">
                                  Host
                                </Badge>
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
                                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border hover:border-primary/50 transition-colors"
                                  >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted border">
                                      <UserIcon className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1">
                                      <div className="font-medium">{guest.name}</div>
                                      <Badge variant="outline" className="text-xs">
                                        Guest
                                      </Badge>
                                    </div>
                                    {data &&
                                      'customer' in data &&
                                      typeof data?.customer !== 'string' &&
                                      data.customer?.id === user.id && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => removeGuestHandler(guest.id)}
                                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                          <TrashIcon className="size-4" />
                                          <span className="sr-only">Remove Guest</span>
                                        </Button>
                                      )}
                                  </div>
                                )
                              })}
                          </CardContent>
                        </Card>
                      </div>

                      <div className="md:col-span-1">
                        <div className="sticky top-6">
                          <BookingInfoCard
                            postImage={data?.post.meta?.image}
                            guests={data?.guests || []}
                            createdAt={data?.post.createdAt}
                            variant="booking"
                            postUrl={typeof data?.post === 'object' ? `/posts/${data.post.slug}` : undefined}
                            onEstimateRequest={async (dates) => {
                              setIsSubmittingEstimate(true)
                              setEstimateError(null)

                              try {
                                const postId = typeof data?.post === 'string' ? data.post : data?.post?.id
                                if (!postId) {
                                  throw new Error('No post ID found')
                                }

                                const availabilityResponse = await fetch(
                                  `/api/bookings/check-availability?postId=${postId}&startDate=${dates.from.toISOString()}&endDate=${dates.to.toISOString()}`,
                                )

                                if (!availabilityResponse.ok) {
                                  throw new Error('Failed to check availability')
                                }

                                const availabilityData = await availabilityResponse.json()

                                if (!availabilityData.isAvailable) {
                                  throw new Error('The selected dates are not available. Please choose different dates.')
                                }

                                const fromDateObj = new Date(dates.from)
                                const toDateObj = new Date(dates.to)
                                const duration = Math.max(
                                  1,
                                  Math.round((toDateObj.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24)),
                                )

                                const baseRate = typeof data?.post === 'object' ? data.post.baseRate || 150 : 150

                                const packagesResponse = await fetch(`/api/packages/post/${postId}`)
                                const packagesData = packagesResponse.ok ? await packagesResponse.json() : { packages: [] }
                                const availablePackagesForEstimate = packagesData.packages || []
                                const firstPackage = availablePackagesForEstimate.find((pkg: any) => pkg.isEnabled)

                                if (!firstPackage) {
                                  throw new Error('No packages available for this property')
                                }

                                const resp = await fetch('/api/estimates', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    postId,
                                    fromDate: dates.from.toISOString(),
                                    toDate: dates.to.toISOString(),
                                    guests: [],
                                    title: `New estimate for ${typeof data?.post === 'object' ? data.post.title : 'Property'} - ${duration} ${duration === 1 ? 'night' : 'nights'}`,
                                    packageType: firstPackage.id,
                                    total: calculateTotal(baseRate, duration, 1),
                                  }),
                                })

                                if (!resp.ok) {
                                  const err = await resp.json().catch(() => ({}))
                                  throw new Error(err?.error || 'Failed to create estimate')
                                }

                                const created = await resp.json()
                                router.push(`/estimate/${created.id}`)
                              } catch (error) {
                                console.error('Error creating estimate:', error)
                                setEstimateError(
                                  error instanceof Error ? error.message : 'Failed to create estimate. Please try again.',
                                )
                              } finally {
                                setIsSubmittingEstimate(false)
                              }
                            }}
                            isSubmittingEstimate={isSubmittingEstimate}
                            estimateError={estimateError}
                            postId={typeof data?.post === 'string' ? data.post : data?.post?.id}
                            postTitle={typeof data?.post === 'object' ? data.post.title : 'Property'}
                            baseRate={typeof data?.post === 'object' ? data.post.baseRate || 150 : 150}
                          />
                        </div>
                      </div>
                    </div>

                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                          <CardTitle className="text-base">Quick Actions</CardTitle>
                        </div>
                        <CardDescription>Shortcut tools for this booking</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2">
                        <Button onClick={handleAskAssistant} variant="secondary" className="justify-start gap-2">
                          <Sparkles className="h-4 w-4" />
                          Ask AI about this booking
                        </Button>
                        <Button onClick={handleScrollToAddons} variant="outline" className="justify-start gap-2">
                          <Package className="h-4 w-4" />
                          Browse add-ons
                        </Button>
                      </CardContent>
                    </Card>

                    {!loadingAddons && addonPackages.length > 0 && (
                      <Card className="mt-8" id="booking-addons">
                        <CardHeader>
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            <CardTitle>Enhance Your Stay</CardTitle>
                          </div>
                          <CardDescription>
                            Add special experiences and amenities to make your stay unforgettable
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {addonPackages.map((addon) => {
                              const baseRate = addon.baseRate || 0
                              const price = baseRate * addon.multiplier
                              const priceString = `R${price.toFixed(2)}`

                              return (
                                <Card key={addon.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-lg">{addon.name}</CardTitle>
                                    <CardDescription className="text-sm">
                                      {addon.description || addon.originalName}
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent className="space-y-4">
                                    <div className="text-2xl font-bold text-primary">{priceString}</div>
                                    {addon.features && addon.features.length > 0 && (
                                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                                        {addon.features.slice(0, 3).map((feature: any, index: number) => (
                                          <li key={index} className="flex items-start gap-2">
                                            <span className="text-primary mt-1">•</span>
                                            <span>{feature.label || feature}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    <Button
                                      className="w-full"
                                      onClick={() => handleAddonPurchase(addon)}
                                      disabled={(paymentLoading && currentAddonId === addon.id) || !isInitialized}
                                    >
                                      {paymentLoading && currentAddonId === addon.id
                                        ? 'Preparing checkout...'
                                        : 'Add to Booking'}
                                    </Button>
                                  </CardContent>
                                </Card>
                              )
                            })}
                          </div>
                          {paymentError && (
                            <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                              {paymentError}
                            </div>
                          )}
                          {paymentSuccess && (
                            <div className="mt-4 p-3 bg-green-500/10 text-green-600 rounded-lg text-sm">
                              Add-on purchased successfully!
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">Error loading booking details</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {relatedPages.length > 0 && (
                <TabsContent value="sensitive">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-primary" />
                        <CardTitle>Check-in Information</CardTitle>
                      </div>
                      <CardDescription>Confidential information for you and your guests only</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {loadingPages ? (
                        <p className="text-muted-foreground">Loading check-in information...</p>
                      ) : (
                        relatedPages.map((page, index) => (
                          <Card key={page.id || index} className="border-2">
                            <CardHeader className="bg-muted/30">
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                  <Lock className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <CardTitle className="text-base">{page.title}</CardTitle>
                                  <CardDescription className="text-xs">{page.packageName}</CardDescription>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-6">{page.layout && <SimplePageRenderer page={page} />}</CardContent>
                          </Card>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      <AIAssistant />

      {/* Set context for AI Assistant */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', function() {
              const context = ${bookingContextJson};
              window.bookingContext = context;
            });
          `,
        }}
      />
    </div>
  )
}
