'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { useRouter } from 'next/navigation'

// Helper function to generate MD5 hash (required for Gravatar)
const md5 = (str: string): string => {
  // Simple MD5 implementation for client-side use
  const rotateLeft = (value: number, amount: number): number => {
    return (value << amount) | (value >>> (32 - amount))
  }
  
  const addUnsigned = (x: number, y: number): number => {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xFFFF)
  }
  
  const md5cmn = (q: number, a: number, b: number, x: number, s: number, t: number): number => {
    a = addUnsigned(a, addUnsigned(addUnsigned((b & q) | ((~b) & x), t), s))
    return addUnsigned(rotateLeft(a, s), b)
  }
  
  const md5ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn((b & c) | ((~b) & d), a, b, x, s, t)
  }
  
  const md5gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn((b & d) | (c & (~d)), a, b, x, s, t)
  }
  
  const md5hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
  }
  
  const md5ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number): number => {
    return md5cmn(c ^ (b | (~d)), a, b, x, s, t)
  }
  
  const convertToWordArray = (str: string): number[] => {
    let wordCount: number
    const messageLength = str.length
    const numberOfWords_temp1 = messageLength + 8
    const numberOfWords_temp2 = (numberOfWords_temp1 - (numberOfWords_temp1 % 64)) / 64
    const numberOfWords = (numberOfWords_temp2 + 1) * 16
    const wordArray: number[] = Array(numberOfWords - 1)
    let bytePosition = 0
    let byteCount = 0
    
    while (byteCount < messageLength) {
      wordCount = (byteCount - (byteCount % 4)) / 4
      bytePosition = (byteCount % 4) * 8
      wordArray[wordCount] = (wordArray[wordCount] ?? 0) | (str.charCodeAt(byteCount) << bytePosition)
      byteCount++
    }
    
    wordCount = (byteCount - (byteCount % 4)) / 4
    bytePosition = (byteCount % 4) * 8
    wordArray[wordCount] = (wordArray[wordCount] ?? 0) | (0x80 << bytePosition)
    wordArray[numberOfWords - 2] = messageLength << 3
    wordArray[numberOfWords - 1] = messageLength >>> 29
    
    return wordArray
  }
  
  const wordToHex = (lValue: number): string => {
    let wordToHexValue = '', wordToHexValue_temp = '', lByte: number, lCount: number
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255
      wordToHexValue_temp = '0' + lByte.toString(16)
      wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2)
    }
    return wordToHexValue
  }
  
  let x: number[] = []
  let k: number, AA: number, BB: number, CC: number, DD: number, a: number, b: number, c: number, d: number
  const S11 = 7, S12 = 12, S13 = 17, S14 = 22
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21
  
  str = unescape(encodeURIComponent(str))
  x = convertToWordArray(str)
  a = 0x67452301
  b = 0xEFCDAB89
  c = 0x98BADCFE
  d = 0x10325476
  
  for (k = 0; k < x.length; k += 16) {
    AA = a
    BB = b
    CC = c
    DD = d
    a = md5ff(a, b, c, d, x[k + 0] ?? 0, S11, 0xD76AA478)
    d = md5ff(d, a, b, c, x[k + 1] ?? 0, S12, 0xE8C7B756)
    c = md5ff(c, d, a, b, x[k + 2] ?? 0, S13, 0x242070DB)
    b = md5ff(b, c, d, a, x[k + 3] ?? 0, S14, 0xC1BDCEEE)
    a = md5ff(a, b, c, d, x[k + 4] ?? 0, S11, 0xF57C0FAF)
    d = md5ff(d, a, b, c, x[k + 5] ?? 0, S12, 0x4787C62A)
    c = md5ff(c, d, a, b, x[k + 6] ?? 0, S13, 0xA8304613)
    b = md5ff(b, c, d, a, x[k + 7] ?? 0, S14, 0xFD469501)
    a = md5ff(a, b, c, d, x[k + 8] ?? 0, S11, 0x698098D8)
    d = md5ff(d, a, b, c, x[k + 9] ?? 0, S12, 0x8B44F7AF)
    c = md5ff(c, d, a, b, x[k + 10] ?? 0, S13, 0xFFFF5BB1)
    b = md5ff(b, c, d, a, x[k + 11] ?? 0, S14, 0x895CD7BE)
    a = md5ff(a, b, c, d, x[k + 12] ?? 0, S11, 0x6B901122)
    d = md5ff(d, a, b, c, x[k + 13] ?? 0, S12, 0xFD987193)
    c = md5ff(c, d, a, b, x[k + 14] ?? 0, S13, 0xA679438E)
    b = md5ff(b, c, d, a, x[k + 15] ?? 0, S14, 0x49B40821)
    a = md5gg(a, b, c, d, x[k + 1] ?? 0, S21, 0xF61E2562)
    d = md5gg(d, a, b, c, x[k + 6] ?? 0, S22, 0xC040B340)
    c = md5gg(c, d, a, b, x[k + 11] ?? 0, S23, 0x265E5A51)
    b = md5gg(b, c, d, a, x[k + 0] ?? 0, S24, 0xE9B6C7AA)
    a = md5gg(a, b, c, d, x[k + 5] ?? 0, S21, 0xD62F105D)
    d = md5gg(d, a, b, c, x[k + 10] ?? 0, S22, 0x2441453)
    c = md5gg(c, d, a, b, x[k + 15] ?? 0, S23, 0xD8A1E681)
    b = md5gg(b, c, d, a, x[k + 4] ?? 0, S24, 0xE7D3FBC8)
    a = md5gg(a, b, c, d, x[k + 9] ?? 0, S21, 0x21E1CDE6)
    d = md5gg(d, a, b, c, x[k + 14] ?? 0, S22, 0xC33707D6)
    c = md5gg(c, d, a, b, x[k + 3] ?? 0, S23, 0xF4D50D87)
    b = md5gg(b, c, d, a, x[k + 8] ?? 0, S24, 0x455A14ED)
    a = md5gg(a, b, c, d, x[k + 13] ?? 0, S21, 0xA9E3E905)
    d = md5gg(d, a, b, c, x[k + 2] ?? 0, S22, 0xFCEFA3F8)
    c = md5gg(c, d, a, b, x[k + 7] ?? 0, S23, 0x676F02D9)
    b = md5gg(b, c, d, a, x[k + 12] ?? 0, S24, 0x8D2A4C8A)
    a = md5hh(a, b, c, d, x[k + 5] ?? 0, S31, 0xFFFA3942)
    d = md5hh(d, a, b, c, x[k + 8] ?? 0, S32, 0x8771F681)
    c = md5hh(c, d, a, b, x[k + 11] ?? 0, S33, 0x6D9D6122)
    b = md5hh(b, c, d, a, x[k + 14] ?? 0, S34, 0xFDE5380C)
    a = md5hh(a, b, c, d, x[k + 1] ?? 0, S31, 0xA4BEEA44)
    d = md5hh(d, a, b, c, x[k + 4] ?? 0, S32, 0x4BDECFA9)
    c = md5hh(c, d, a, b, x[k + 7] ?? 0, S33, 0xF6BB4B60)
    b = md5hh(b, c, d, a, x[k + 10] ?? 0, S34, 0xBEBFBC70)
    a = md5hh(a, b, c, d, x[k + 13] ?? 0, S31, 0x289B7EC6)
    d = md5hh(d, a, b, c, x[k + 0] ?? 0, S32, 0xEAA127FA)
    c = md5hh(c, d, a, b, x[k + 3] ?? 0, S33, 0xD4EF3085)
    b = md5hh(b, c, d, a, x[k + 6] ?? 0, S34, 0x4881D05)
    a = md5hh(a, b, c, d, x[k + 9] ?? 0, S31, 0xD9D4D039)
    d = md5hh(d, a, b, c, x[k + 12] ?? 0, S32, 0xE6DB99E5)
    c = md5hh(c, d, a, b, x[k + 15] ?? 0, S33, 0x1FA27CF8)
    b = md5hh(b, c, d, a, x[k + 2] ?? 0, S34, 0xC4AC5665)
    a = md5ii(a, b, c, d, x[k + 0] ?? 0, S41, 0xF4292244)
    d = md5ii(d, a, b, c, x[k + 7] ?? 0, S42, 0x432AFF97)
    c = md5ii(c, d, a, b, x[k + 14] ?? 0, S43, 0xAB9423A7)
    b = md5ii(b, c, d, a, x[k + 5] ?? 0, S44, 0xFC93A039)
    a = md5ii(a, b, c, d, x[k + 12] ?? 0, S41, 0x655B59C3)
    d = md5ii(d, a, b, c, x[k + 3] ?? 0, S42, 0x8F0CCC92)
    c = md5ii(c, d, a, b, x[k + 10] ?? 0, S43, 0xFFEFF47D)
    b = md5ii(b, c, d, a, x[k + 1] ?? 0, S44, 0x85845DD1)
    a = md5ii(a, b, c, d, x[k + 8] ?? 0, S41, 0x6FA87E4F)
    d = md5ii(d, a, b, c, x[k + 15] ?? 0, S42, 0xFE2CE6E0)
    c = md5ii(c, d, a, b, x[k + 6] ?? 0, S43, 0xA3014314)
    b = md5ii(b, c, d, a, x[k + 13] ?? 0, S44, 0x4E0811A1)
    a = md5ii(a, b, c, d, x[k + 4] ?? 0, S41, 0xF7537E82)
    d = md5ii(d, a, b, c, x[k + 11] ?? 0, S42, 0xBD3AF235)
    c = md5ii(c, d, a, b, x[k + 2] ?? 0, S43, 0x2AD7D2BB)
    b = md5ii(b, c, d, a, x[k + 9] ?? 0, S44, 0xEB86D391)
    a = addUnsigned(a, AA)
    b = addUnsigned(b, BB)
    c = addUnsigned(c, CC)
    d = addUnsigned(d, DD)
  }
  
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase()
}

// Helper function to generate Gravatar URL from email
const getGravatarUrl = (email: string | null | undefined, size: number = 40): string | null => {
  if (!email) return null
  
  // Normalize email (lowercase and trim) - Gravatar requires lowercase
  const normalizedEmail = email.trim().toLowerCase()
  const hash = md5(normalizedEmail)
  
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp&r=pg`
}

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
        // Transform the data to match PostPackage interface and filter out add-on packages
        const transformedPackages = (data.packages || [])
          .filter((pkg: any) => pkg.category !== 'addon') // Exclude add-on packages
          .map((pkg: any) => ({
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
  const router = useRouter()

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
  // Use values directly from Payload CMS as stored (no conversion)
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
  const [packageTotal, setPackageTotal] = useState<number | null>(null)
  const [latestTokenUsage, setLatestTokenUsage] = useState<TokenUsageSummary | null>(null)

  const subscriptionStatus = useSubscription()
  const { isSubscribed, isLoading: isSubscriptionLoading, entitlements } = subscriptionStatus
  const [areDatesAvailable, setAreDatesAvailable] = useState(true)
  const [subscriptionProductId, setSubscriptionProductId] = useState<string | null>(null)
  
  // Fetch subscription transaction to get productId
  useEffect(() => {
    if (!isSubscribed || !user?.id) {
      setSubscriptionProductId(null)
      return
    }
    
    const fetchSubscriptionDetails = async () => {
      try {
        const response = await fetch('/api/check-subscription', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          // Get the active transaction's productId
          const activeTransaction = data.transactions?.find((tx: any) => {
            if (!tx || tx.status !== 'completed' || tx.intent !== 'subscription') return false
            if (!tx.expiresAt) return true
            return new Date(tx.expiresAt) > new Date()
          })
          if (activeTransaction?.productId) {
            setSubscriptionProductId(activeTransaction.productId)
          }
        }
      } catch (error) {
        console.error('Error fetching subscription details:', error)
      }
    }
    
    fetchSubscriptionDetails()
  }, [isSubscribed, user?.id])
  
  // Check if the selected package matches the user's subscription
  const isPackageIncludedInSubscription = useMemo(() => {
    if (!isSubscribed || !selectedPackage || !subscriptionProductId) {
      return false
    }
    
    // Get all possible package identifiers
    const packageIds = [
      selectedPackage.revenueCatId,
      selectedPackage.yocoId,
      selectedPackage.id,
    ].filter(Boolean) as string[]
    
    // Check if any package identifier matches the subscription productId
    return packageIds.some(packageId => {
      // Direct match
      if (packageId === subscriptionProductId) return true
      // Case-insensitive match
      if (packageId.toLowerCase() === subscriptionProductId.toLowerCase()) return true
      // Partial match (for cases where productId might be a prefix/suffix)
      if (packageId.includes(subscriptionProductId) || subscriptionProductId.includes(packageId)) return true
      return false
    })
  }, [isSubscribed, selectedPackage, subscriptionProductId])
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
      setPackageTotal(null)
      return
    }

    const hasFixedPackageRate = Boolean(selectedPackage.baseRate && selectedPackage.baseRate > 0)

    if (hasFixedPackageRate) {
      // Use baseRate directly from Payload CMS (stored as-is, no conversion)
      const packageBaseRate = selectedPackage.baseRate ?? 0
      
      const effectiveDuration =
        _bookingDuration > 0
          ? _bookingDuration
          : Math.max(selectedPackage.minNights ?? selectedPackage.maxNights ?? 1, 1)

      // Check if this is a 1-night package (should not be divided)
      const isOneNightPackage = selectedPackage.minNights === 1 && selectedPackage.maxNights === 1
      
      // For 1-night packages, use baseRate directly; otherwise divide by duration
      const perNightRate = isOneNightPackage 
        ? packageBaseRate 
        : (effectiveDuration > 0 ? packageBaseRate / effectiveDuration : packageBaseRate)

      setPackagePrice(perNightRate)
      setPackageTotal(packageBaseRate)
      return
    }

    const perNightRate = _postBaseRate * (selectedPackage.multiplier || 1)
    setPackagePrice(perNightRate)
    setPackageTotal(perNightRate * _bookingDuration)
  }, [selectedPackage, _postBaseRate, _bookingDuration])

  // Format price for display: use value directly from Payload CMS (stored in rands)
  const formatPrice = (price: number | null) => {
    if (price === null) return 'N/A'
    return `R${price.toFixed(2)}`
  }

  // Use values directly from Payload CMS (stored in rands)
  const bookingTotal = useMemo(() => {
    if (packageTotal !== null) {
      return packageTotal
    }
    if (packagePrice !== null) {
      return packagePrice * _bookingDuration
    }
    return _bookingTotal
  }, [packageTotal, packagePrice, _bookingDuration, _bookingTotal])

  const isFixedPricePackage = Boolean(selectedPackage?.baseRate && selectedPackage.baseRate > 0)
  const effectiveNightsForDisplay = isFixedPricePackage
    ? Math.max(
        _bookingDuration > 0
          ? _bookingDuration
          : selectedPackage?.minNights ?? selectedPackage?.maxNights ?? 1,
        1,
      )
    : _bookingDuration

  // Handle estimate completion
  const handleEstimate = async () => {
    if (!areDatesAvailable || !selectedPackage) return

    setPaymentLoading(true)
    setPaymentError(null)

    try {
      if (selectedPackage.revenueCatId === 'gathering_monthly' && customerEntitlement !== 'pro') {
        throw new Error('This package requires a pro subscription. Please upgrade your account.')
      }

      // If user has active subscription AND the selected package matches their subscription, create booking directly without payment
      if (isSubscribed && isPackageIncludedInSubscription) {
        const postId = typeof data?.post === 'string' ? data.post : data?.post?.id
        if (!postId || !user?.id) {
          throw new Error('Missing required information to create booking.')
        }

        const bookingData: any = {
          title: typeof data?.post === 'object' ? data.post.title : 'Booking',
          post: postId,
          fromDate: data.fromDate ? new Date(data.fromDate).toISOString() : undefined,
          toDate: data.toDate ? new Date(data.toDate).toISOString() : undefined,
          total: bookingTotal,
          paymentStatus: 'paid', // Mark as paid for subscribers
          customer: user.id,
        }

        // Include package information
        if (selectedPackage) {
          bookingData.packageType = selectedPackage.yocoId || selectedPackage.id
          bookingData.selectedPackage = {
            package: selectedPackage.id,
            customName: selectedPackage.name,
            enabled: true,
          }
        }

        const bookingResponse = await fetch('/api/bookings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bookingData),
        })

        if (!bookingResponse.ok) {
          const errorData = await bookingResponse.json()
          throw new Error(errorData.error || 'Failed to create booking')
        }

        const booking = await bookingResponse.json()
        setPaymentSuccess(true)
        
        // Redirect to booking confirmation page
        router.push(`/booking-confirmation?total=${bookingTotal}&duration=${_bookingDuration}&transactionId=subscription-${Date.now()}&success=true&estimateId=${data.id}&bookingId=${booking.id}`)
        return
      }

      // For non-subscribers, proceed with normal payment flow
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
                  <div className="flex flex-col">
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
                        
                        // Calculate per-night rate for this package
                        const hasFixedPackageRate = Boolean(pkg.baseRate && pkg.baseRate > 0)
                        const effectiveDuration = _bookingDuration > 0 
                          ? _bookingDuration 
                          : Math.max(pkg.minNights ?? pkg.maxNights ?? 1, 1)
                        
                        // Check if this is a 1-night package (should not be divided)
                        const isOneNightPackage = pkg.minNights === 1 && pkg.maxNights === 1
                        
                        // Use baseRate directly from Payload CMS (no conversion)
                        const packageBaseRate = hasFixedPackageRate 
                          ? (pkg.baseRate ?? 0)
                          : null
                        
                        // For 1-night packages, use baseRate directly; otherwise divide by duration for fixed packages
                        const perNightRate = isOneNightPackage && hasFixedPackageRate && packageBaseRate !== null
                          ? packageBaseRate
                          : hasFixedPackageRate && packageBaseRate !== null
                          ? (effectiveDuration > 0 ? packageBaseRate / effectiveDuration : packageBaseRate)
                          : _postBaseRate * (pkg.multiplier || 1)
                        
                        // Calculate total for this package
                        const packageTotal = hasFixedPackageRate && packageBaseRate !== null
                          ? packageBaseRate
                          : perNightRate * effectiveDuration
                        
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
                                    {isOneNightPackage && hasFixedPackageRate
                                      ? formatPrice(perNightRate)
                                      : `${formatPrice(perNightRate)}/night`}
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
                                  Total: {formatPrice(packageTotal)}
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
                  {isFixedPricePackage ? (
                    <>
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-muted-foreground">Package total:</span>
                        <span className="font-medium">{formatPrice(bookingTotal)}</span>
                      </div>
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-muted-foreground">
                          Approx. per night
                          {effectiveNightsForDisplay ? ` (${effectiveNightsForDisplay} nights)` : ''}:
                        </span>
                        <span className="font-medium">{formatPrice(packagePrice)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-muted-foreground">Rate per night:</span>
                      <span className="font-medium">{formatPrice(packagePrice)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground">Property base rate:</span>
                    <span className="font-medium">{formatPrice(_postBaseRate)}/night</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">{_bookingDuration} nights</span>
                  </div>
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-muted-foreground">Total:</span>
                    {isSubscribed && isPackageIncludedInSubscription ? (
                      <div className="flex flex-col items-end">
                        <span className="text-2xl font-bold text-green-600">Paid</span>
                        <span className="text-xs text-muted-foreground line-through">{formatPrice(bookingTotal)}</span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold">{formatPrice(bookingTotal)}</span>
                    )}
                  </div>
                </>
              )}
              
              {/* Complete Estimate Button */}
              <Button
                onClick={handleEstimate}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={
                  paymentLoading || paymentSuccess || !_postId || !selectedPackage || !areDatesAvailable || isSubscriptionLoading
                }
              >
                {paymentLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isSubscribed ? 'Creating Booking...' : 'Processing...'}
                  </>
                ) : paymentSuccess ? (
                  'Estimate Confirmed!'
                ) : !_postId ? (
                  'Missing Property Information'
                ) : !selectedPackage ? (
                  'Please Select a Package'
                ) : !areDatesAvailable ? (
                  'Dates Not Available'
                ) : isSubscriptionLoading ? (
                  'Checking Subscription...'
                ) : isSubscribed && isPackageIncludedInSubscription ? (
                  'Confirm Booking (Included)'
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
          
          {/* Set estimate context for AI Assistant */}
          {data && (
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.addEventListener('load', function() {
                    const context = ${JSON.stringify({
                      context: 'estimate-details',
                      estimate: {
                        id: data.id,
                        fromDate: data.fromDate,
                        toDate: data.toDate,
                        total: data.total,
                      },
                      post: typeof data.post === 'object' ? {
                        id: data.post.id,
                        title: data.post.title,
                        slug: data.post.slug,
                      } : null,
                    })};
                    window.estimateContext = context;
                  });
                `
              }}
            />
          )}

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
                  {(() => {
                    const customerEmail = typeof data.customer === 'object' ? data.customer?.email : null
                    const gravatarUrl = getGravatarUrl(customerEmail, 40)
                    
                    return gravatarUrl ? (
                      <img 
                        src={gravatarUrl} 
                        alt={typeof data.customer === 'string' ? 'Customer' : data.customer?.name || 'Customer'}
                        className="h-10 w-10 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="p-2 border border-border rounded-full">
                        <UserIcon className="size-6" />
                      </div>
                    )
                  })()}
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
                          {(() => {
                            const guestEmail = guest.email
                            const gravatarUrl = getGravatarUrl(guestEmail, 40)
                            
                            return gravatarUrl ? (
                              <img 
                                src={gravatarUrl} 
                                alt={guest.name || 'Guest'}
                                className="h-10 w-10 rounded-full object-cover border border-border"
                              />
                            ) : (
                              <div className="p-2 border border-border rounded-full">
                                <UserIcon className="size-6" />
                              </div>
                            )
                          })()}
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
