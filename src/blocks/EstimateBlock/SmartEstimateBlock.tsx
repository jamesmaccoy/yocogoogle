'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/utilities/cn'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Bot, Send, Calendar, CalendarIcon, Package, Sparkles, Loader2 } from 'lucide-react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import { Loader } from '@/components/ai-elements/loader'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSpeechButton,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from '@/components/ai-elements/checkpoint'
import { format } from 'date-fns'
import { hasUnavailableDateBetween } from '@/utilities/hasUnavailableDateBetween'
import { useUserContext } from '@/context/UserContext'
import { useSubscription } from '@/hooks/useSubscription'
import { getCustomerEntitlement, type CustomerEntitlement } from '@/utils/packageSuggestions'
import { calculateTotal } from '@/lib/calculateTotal'
import { useYoco } from '@/providers/Yoco'
import { yocoService, YocoProduct, YocoPaymentLink } from '@/lib/yocoService'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mic, MicOff } from 'lucide-react'
import { PackageDisplay } from '@/components/PackageDisplay'

interface Package {
  id: string
  name: string
  description: string
  multiplier: number
  category: string
  entitlement?: 'standard' | 'pro'
  minNights: number
  maxNights: number
  yocoId?: string
  baseRate?: number
  isEnabled: boolean
  features: string[]
  source: 'database' | 'yoco'
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  type?: 'text' | 'package_suggestion' | 'booking_summary' | 'quick_action' | 'date_selection' | 'date_suggestion'
  data?: any
}

interface SmartEstimateBlockProps {
  className?: string
  postId: string
  baseRate: number
  postTitle?: string
  postDescription?: string
}

const QuickActions = ({ 
  onAction, 
  hasDates, 
  suggestedDates 
}: { 
  onAction: (action: string, data?: any) => void
  hasDates: boolean
  suggestedDates?: Array<{ startDate: string; endDate: string; duration: number }>
}) => (
  <div className="flex flex-wrap gap-2 mb-4">
    <Button 
      variant="outline" 
      size="sm" 
      onClick={() => onAction('select_dates')}
      className="text-xs"
    >
      <Calendar className="h-3 w-3 mr-1" />
      Select Dates
    </Button>
    <Button 
      variant="outline" 
      size="sm" 
      onClick={() => onAction('smart_action')}
      className="text-xs"
    >
      <Sparkles className="h-3 w-3 mr-1" />
      {hasDates ? 'Get Recommendations' : 'Help Me Choose'}
    </Button>
  </div>
)

const PackageCard = ({ 
  package: pkg, 
  duration, 
  baseRate, 
  isSelected, 
  onSelect 
}: { 
  package: Package
  duration: number
  baseRate: number
  isSelected: boolean
  onSelect: () => void 
}) => {
  const total = pkg.baseRate || calculateTotal(baseRate, duration, pkg.multiplier)
  const effectiveDuration = Math.max(duration, pkg.minNights || pkg.maxNights || 1, 1)
  const pricePerNight = pkg.baseRate ? total / effectiveDuration : total / Math.max(duration, 1)
  const multiplierText = pkg.baseRate 
    ? 'Fixed package price' 
    : pkg.multiplier === 1 
    ? 'Base rate' 
    : pkg.multiplier > 1 
      ? `+${((pkg.multiplier - 1) * 100).toFixed(0)}%` 
      : `-${((1 - pkg.multiplier) * 100).toFixed(0)}%`
  
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected ? "border-primary bg-primary/5" : "border-border"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">{pkg.name}</CardTitle>
            <CardDescription className="mt-1">{pkg.description}</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">R{total.toFixed(0)}</div>
            <div className="text-sm text-muted-foreground">
              {pkg.baseRate
                ? `~R${pricePerNight.toFixed(0)}/night · ${effectiveDuration} nights`
                : `R${pricePerNight.toFixed(0)}/night`}
            </div>
            <div className="text-xs text-muted-foreground">
              {multiplierText}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Duration: {pkg.minNights === pkg.maxNights 
              ? `${pkg.minNights} ${pkg.minNights === 1 ? 'night' : 'nights'}`
              : `${pkg.minNights}-${pkg.maxNights} nights`
            }
          </div>
          <div className="space-y-1">
            {pkg.features.slice(0, 3).map((feature, idx) => (
              <div key={idx} className="flex items-center text-sm">
                <span className="w-1.5 h-1.5 bg-primary rounded-full mr-2" />
                {typeof feature === 'string' ? feature : (feature as any).feature}
              </div>
            ))}
            {pkg.features.length > 3 && (
              <div className="text-xs text-muted-foreground">
                +{pkg.features.length - 3} more features
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const SmartEstimateBlock: React.FC<SmartEstimateBlockProps> = ({
  className,
  postId,
  baseRate,
  postTitle = "this property",
  postDescription = ""
}) => {
  const { currentUser } = useUserContext()
  const isLoggedIn = !!currentUser
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isInitialized, createPaymentLink, createPaymentLinkFromDatabase } = useYoco()
  
  // Session storage key for this specific post
  const sessionKey = `booking_journey_${postId}_${currentUser?.id || 'guest'}`
  
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [packages, setPackages] = useState<Package[]>([])
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [duration, setDuration] = useState(1)
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  
  // Booking states
  const [isBooking, setIsBooking] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [offerings, setOfferings] = useState<YocoProduct[]>([])
  const [isCreatingEstimate, setIsCreatingEstimate] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectedPackageTotal =
    selectedPackage && selectedPackage.baseRate && selectedPackage.baseRate > 0
      ? selectedPackage.baseRate
      : selectedPackage
        ? calculateTotal(baseRate, duration, selectedPackage.multiplier)
        : null
  
  // Availability checking states
  const [unavailableDates, setUnavailableDates] = useState<string[]>([])
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
  const [areDatesAvailable, setAreDatesAvailable] = useState(true)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  
  // Latest estimate state
  const [latestEstimate, setLatestEstimate] = useState<any>(null)
  const [loadingEstimate, setLoadingEstimate] = useState(false)
  
  // Checkpoint state for estimate restoration
  interface EstimateCheckpoint {
    id: string
    messageIndex: number
    estimateId: string
    estimate: any
    timestamp: Date
  }
  const [checkpoints, setCheckpoints] = useState<EstimateCheckpoint[]>([])
  
  // Suggested dates state (for showing near input)
  const [suggestedDates, setSuggestedDates] = useState<Array<{ startDate: string; endDate: string; duration: number }>>([])
  
  // Package loading state to prevent multiple API calls
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [packagesLoaded, setPackagesLoaded] = useState(false)
  
  // Ref to track loading state to prevent infinite loops
  const loadingRef = useRef(false)
  const loadedRef = useRef(false)
  
  // Ref to prevent infinite loops in booking journey
  const journeyLoadedRef = useRef(false)
  
  // Debounce ref for saving booking journey
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Ref to prevent loadLatestEstimate from being called repeatedly
  const estimateLoadedRef = useRef(false)
  
  // Ref to prevent package suggestions from being triggered repeatedly
  const packagesSuggestedRef = useRef(false)
  
  // Ref to store original packages for re-filtering
  const originalPackagesRef = useRef<Package[]>([])
  
  // Ref to track last checked dates to prevent duplicate availability checks
  const lastCheckedDatesRef = useRef<{ start: string; end: string } | null>(null)
  
  // Ref to track if availability check is in progress
  const availabilityCheckInProgressRef = useRef(false)
  
  // Ref to track previous availability state to detect changes
  const previousAvailabilityRef = useRef<boolean | null>(null)
  
  // Ref to preserve startDate during iOS Safari date picker interactions
  const preservedStartDateRef = useRef<Date | null>(null)
  
  const subscriptionStatus = useSubscription()
  const [customerEntitlement, setCustomerEntitlement] = useState<CustomerEntitlement>('none')
  
  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const isProcessingRef = useRef(false)
  const finalTranscriptRef = useRef('')
  const activeThreadRef = useRef(0)
  const historyKeyRef = useRef<string | null>(null)

  const persistHistoryEntries = useCallback((threadId: number, entries: Message[]) => {
    if (typeof window === 'undefined' || !historyKeyRef.current || entries.length === 0) return

    try {
      const existing: any[] = JSON.parse(window.localStorage.getItem(historyKeyRef.current) ?? '[]')
      const additions = entries.map((entry) => ({
        role: entry.role,
        content: entry.content,
        timestamp: Date.now(),
        threadId,
      }))
      const updated = [...existing, ...additions].slice(-50)
      window.localStorage.setItem(historyKeyRef.current, JSON.stringify(updated))
      window.dispatchEvent(
        new CustomEvent('aiHistoryUpdate', {
          detail: { key: historyKeyRef.current, history: updated },
        }),
      )
    } catch (error) {
      console.warn('Failed to persist smart estimate history', error)
    }
  }, [])

  const beginNewThread = useCallback(
    (initialMessages: Message[] = []) => {
      const nextThreadId = activeThreadRef.current + 1
      activeThreadRef.current = nextThreadId
      packagesSuggestedRef.current = false
      setMessages(initialMessages)
      persistHistoryEntries(nextThreadId, initialMessages)
      return nextThreadId
    },
    [persistHistoryEntries],
  )

  const appendMessageToThread = useCallback(
    (threadId: number, message: Message) => {
      if (activeThreadRef.current !== threadId) return
      setMessages((prev) => [...prev, message])
      persistHistoryEntries(threadId, [message])
    },
    [persistHistoryEntries],
  )

  // Helper function to filter packages based on customer entitlement
  // This ensures that pro-only packages are only shown to pro users
  // Also filters out addon packages which should only appear on the booking page
  const filterPackagesByEntitlement = useCallback((packages: Package[]): Package[] => {
    
    const filtered = packages.filter((pkg: Package) => {
      if (!pkg.isEnabled) {
        return false
      }
      
      // Filter out addon packages - these should only appear on the booking page
      if (pkg.category === 'addon') {
        return false
      }
      
      // 3-Tier System Implementation:
      
      // Tier 1: Non-subscribers (none) - Only see hosted/special packages (premium experience)
      if (customerEntitlement === 'none') {
        return ['hosted', 'special'].includes(pkg.category)
      }
      
      // Tier 2: Standard subscribers - See standard + hosted + special (better than non-subscribers)
      if (customerEntitlement === 'standard') {
        // Standard subscribers get more than non-subscribers
        const shouldShow = ['standard', 'hosted', 'special'].includes(pkg.category)
        
        
        return shouldShow
      }
      
      // Tier 3: Pro subscribers - See everything (all packages)
      if (customerEntitlement === 'pro') {
        return true
      }
      
      // Legacy: Filter out pro-only packages by yocoId for non-pro users
        // Only keep this for packages that don't have entitlement field in database
        if (pkg.yocoId === 'gathering_monthly' && customerEntitlement !== 'pro') {
        return false
      }
      
      return true
    })
    
    
    return filtered
  }, [customerEntitlement])

  // Helper function to normalize date to YYYY-MM-DD format for comparison
  const normalizeDateToString = (date: Date | string): string => {
    if (typeof date === 'string') {
      const datePart = date.split('T')[0]
      return datePart || ''
    }
    const isoString = date.toISOString()
    return isoString.split('T')[0] || ''
  }

  // Format date using natural language style (like NaturalLanguageDatePicker)
  const formatDateNatural = (date: Date | null | undefined): string => {
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  // Load unavailable dates for the post
  const loadUnavailableDates = async () => {
    // Only load if user is logged in (endpoint requires authentication)
    if (!isLoggedIn) {
      return
    }
    
    try {
      const response = await fetch(`/api/bookings/unavailable-dates?postId=${postId}`)
      if (response.ok) {
        const data = await response.json()
        const dates = data.unavailableDates || []
        setUnavailableDates(dates)
        // Debug logging
        if (dates.length > 0) {
          console.log('📅 Loaded unavailable dates:', {
            postId,
            count: dates.length,
            sampleDates: dates.slice(0, 5).map((d: string) => normalizeDateToString(d)),
          })
        }
      } else if (response.status === 401) {
        // User not authenticated - this is expected for logged-out users
        console.log('📅 Unavailable dates require authentication')
      } else {
        console.error('Failed to load unavailable dates:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error loading unavailable dates:', error)
    }
  }

  // Check if selected dates are available
  const checkDateAvailability = async (
    fromDate: Date,
    toDate: Date,
    threadId: number = activeThreadRef.current,
    addMessage: boolean = false, // Only add message when explicitly requested
  ) => {
    if (!fromDate || !toDate) return true
    
    // Prevent duplicate checks for the same date combination
    if (lastCheckedDatesRef.current?.start === fromDate.toISOString() && 
        lastCheckedDatesRef.current?.end === toDate.toISOString() &&
        !addMessage) {
      return areDatesAvailable
    }
    
    // Prevent concurrent checks
    if (availabilityCheckInProgressRef.current) {
      return areDatesAvailable
    }
    
    availabilityCheckInProgressRef.current = true
    setIsCheckingAvailability(true)
    setAvailabilityError(null)
    
    try {
      const params = new URLSearchParams({
        postId,
        startDate: fromDate.toISOString(),
        endDate: toDate.toISOString(),
      })

      const activePackageId = selectedPackage?.id || packages[0]?.id
      if (activePackageId) {
        params.set('packageId', activePackageId)
      }

      const response = await fetch(`/api/bookings/check-availability?${params.toString()}`)
      
      if (response.ok) {
        const data = await response.json()
        const isAvailable = data.isAvailable
        const suggestedDates = data.suggestedDates || []
        
        console.log('📅 Availability check result:', {
          isAvailable,
          suggestedDatesCount: suggestedDates.length,
          suggestedDates,
          addMessage,
          threadId,
          activeThread: activeThreadRef.current,
        })
        
        // Track previous availability to detect changes
        const previousAvailable = previousAvailabilityRef.current
        
        // Update state
        setAreDatesAvailable(isAvailable)
        previousAvailabilityRef.current = isAvailable
        
        // Store the checked dates
        lastCheckedDatesRef.current = {
          start: fromDate.toISOString(),
          end: toDate.toISOString(),
        }
        
        // Add a message to inform the user about availability:
        // 1. If explicitly requested (addMessage = true) AND dates are unavailable - always show
        // 2. If availability changed from available to unavailable - show to notify user
        // 3. Store suggested dates in state for display near input field
        if (!isAvailable && suggestedDates.length > 0) {
          setSuggestedDates(suggestedDates)
        } else if (isAvailable) {
          // Clear suggested dates if dates are available
          setSuggestedDates([])
        }
        
        // 4. Show message if explicitly requested or if availability changed
        const shouldShowMessage = 
          (addMessage && !isAvailable) || // Explicitly requested and unavailable
          (previousAvailable === true && !isAvailable) // Changed from available to unavailable
        
        if (shouldShowMessage && activeThreadRef.current === threadId) {
          const availabilityMessage: Message = {
            role: 'assistant',
            content: `I'm sorry, but the dates you selected (${format(fromDate, 'MMM dd')} to ${format(
              toDate,
              'MMM dd, yyyy',
            )}) are not available.${suggestedDates.length > 0 ? ' Please see suggested dates below.' : ' Please select different dates for your stay.'}`,
            type: 'text',
          }
          console.log('💬 Adding availability message:', {
            addMessage,
            isAvailable,
            previousAvailable,
            suggestedDatesCount: suggestedDates.length,
            message: availabilityMessage,
          })
          appendMessageToThread(threadId, availabilityMessage)
        }
        
        return isAvailable
      } else {
        console.error('Availability check failed:', response.status, response.statusText)
        setAvailabilityError('Failed to check availability')
        return false
      }
    } catch (error) {
      console.error('Error checking availability:', error)
      setAvailabilityError('Failed to check availability')
      return false
    } finally {
      setIsCheckingAvailability(false)
      availabilityCheckInProgressRef.current = false
    }
  }

  // Create checkpoint for an estimate
  const createEstimateCheckpoint = useCallback((estimate: any, messageIndex: number) => {
    const checkpoint: EstimateCheckpoint = {
      id: `checkpoint-${estimate.id}-${Date.now()}`,
      messageIndex,
      estimateId: estimate.id,
      estimate,
      timestamp: new Date(),
    }
    setCheckpoints((prev) => [...prev, checkpoint])
  }, [])

  // Restore to checkpoint
  const restoreToCheckpoint = useCallback((checkpoint: EstimateCheckpoint) => {
    // Restore messages up to checkpoint
    setMessages((prev) => prev.slice(0, checkpoint.messageIndex + 1))
    
    // Restore estimate state
    const estimate = checkpoint.estimate
    setLatestEstimate(estimate)
    
    // Restore dates
    if (estimate.fromDate && estimate.toDate) {
      const from = new Date(estimate.fromDate)
      const to = new Date(estimate.toDate)
      const calcDuration = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
      
      setStartDate(from)
      setEndDate(to)
      setDuration(calcDuration)
    }
    
    // Restore package if available
    if (estimate.packageType) {
      // Try to find and set the package
      const packageId = estimate.packageType
      const foundPackage = packages.find(pkg => 
        pkg.id === packageId || 
        pkg.yocoId === packageId || 
        (pkg as any).revenueCatId === packageId
      )
      if (foundPackage) {
        setSelectedPackage(foundPackage)
      }
    }
    
    // Remove checkpoints after this one
    setCheckpoints((prev) => prev.filter(cp => cp.messageIndex <= checkpoint.messageIndex))
    
    // Add restoration message
    const restoreMessage: Message = {
      role: 'assistant',
      content: `Restored to estimate checkpoint. Your dates and package selection have been restored.`,
      type: 'text'
    }
    appendMessageToThread(activeThreadRef.current, restoreMessage)
  }, [packages, appendMessageToThread])

  // Load latest estimate for the user
  const loadLatestEstimate = async (force: boolean = false) => {
    if (!isLoggedIn || (estimateLoadedRef.current && !force)) return
    
    try {
      estimateLoadedRef.current = true
      const response = await fetch(`/api/estimates/latest?userId=${currentUser?.id}&postId=${postId}`)
      if (response.ok) {
        const estimate = await response.json()
        if (estimate) {
          setLatestEstimate(estimate)
          
          // Pre-populate dates if available
          if (estimate.fromDate && estimate.toDate) {
            const from = new Date(estimate.fromDate)
            const to = new Date(estimate.toDate)
            const calcDuration = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
            
            setStartDate(from)
            setEndDate(to)
            setDuration(calcDuration)
          }
          
          // Create checkpoint for this estimate after initial message is set
          // We'll create it after the welcome message, so wait a bit
          setTimeout(() => {
            // Create checkpoint at the end of current messages
            const currentMessageCount = messages.length
            createEstimateCheckpoint(estimate, currentMessageCount > 0 ? currentMessageCount - 1 : 0)
          }, 500)
        }
      }
    } catch (error) {
      console.error('Error loading latest estimate:', error)
    }
  }
  
  // Initialize booking journey on component mount
  useEffect(() => {
    const restored = loadBookingJourney()
    
    // Load unavailable dates for the post
    loadUnavailableDates()
    
    // Check for restoreEstimate URL parameter
    const restoreEstimateId = searchParams?.get('restoreEstimate')
    if (restoreEstimateId && isLoggedIn && !restored) {
      // Load and restore to this estimate
      fetch(`/api/estimates/latest?userId=${currentUser?.id}&postId=${postId}`)
        .then(res => res.json())
        .then(estimate => {
          if (estimate && estimate.id === restoreEstimateId) {
            // Restore dates
            if (estimate.fromDate && estimate.toDate) {
              const from = new Date(estimate.fromDate)
              const to = new Date(estimate.toDate)
              const calcDuration = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
              
              setStartDate(from)
              setEndDate(to)
              setDuration(calcDuration)
            }
            
            // Set initial message
            const initialMessage: Message = {
              role: 'assistant',
              content: `Restored to your estimate checkpoint for ${postTitle}. Your dates and package selection have been restored.`,
              type: 'text'
            }
            setMessages([initialMessage])
            
            // Create checkpoint
            setTimeout(() => {
              createEstimateCheckpoint(estimate, 0)
            }, 100)
            
            // Clear URL parameter
            if (typeof window !== 'undefined') {
              router.replace(window.location.pathname, { scroll: false })
            }
          }
        })
        .catch(console.error)
      return
    }
    
    if (!restored) {
      // Load latest estimate first, then set initial message
      if (isLoggedIn) {
        loadLatestEstimate().then(() => {
          // Check if we need to set an initial message after loading estimate
          if (messages.length === 0) {
            const initialMessage: Message = {
              role: 'assistant',
              content: latestEstimate ? 
                `Welcome back! I see you have an existing estimate for ${postTitle}. I've pre-loaded your previous dates. Feel free to modify them or ask me anything about your booking.` :
                `Hi! I'm here to help you book ${postTitle}. I can help you find the perfect dates, recommend packages based on your needs, and handle your booking. What would you like to know?`,
              type: 'text'
            }
            setMessages([initialMessage])
          }
        })
      } else {
        const initialMessage: Message = {
          role: 'assistant',
          content: `Welcome to ${postTitle}! I can show you available packages and help you get started. Please log in to access the full AI booking experience and complete your reservation.`,
          type: 'text'
        }
        setMessages([initialMessage])
      }
    } else if (isLoggedIn) {
      // Even if journey was restored, still load latest estimate to sync data
      loadLatestEstimate()
    }
  }, [isLoggedIn, searchParams, currentUser?.id, postId, router, createEstimateCheckpoint]) // Added dependencies for checkpoint restoration

  // Refetch latest estimate and unavailable dates when post changes
  useEffect(() => {
    estimateLoadedRef.current = false
    if (isLoggedIn && postId) {
      loadLatestEstimate(true)
    }
    // Reload unavailable dates when postId changes or when user logs in
    if (postId) {
      loadUnavailableDates()
    }
  }, [postId, isLoggedIn])

  // Separate effect to handle initial message after estimate loads
  useEffect(() => {
    if (latestEstimate && messages.length === 0 && isLoggedIn && !estimateLoadedRef.current) {
      const initialMessage: Message = {
        role: 'assistant',
        content: `Welcome back! I see you have an existing estimate for ${postTitle}. I've pre-loaded your previous dates (${format(new Date(latestEstimate.fromDate), 'MMM dd')} to ${format(new Date(latestEstimate.toDate), 'MMM dd, yyyy')}). Feel free to modify them or ask me anything about your booking.`,
        type: 'text'
      }
      setMessages([initialMessage])
    }
  }, [latestEstimate, isLoggedIn]) // Removed messages.length and postTitle from dependencies

  // Save booking journey when state changes
  useEffect(() => {
    if (messages.length > 0 && !journeyLoadedRef.current) {
      saveBookingJourney()
    }
  }, [messages, selectedPackage, duration, startDate, endDate])

  // Update customer entitlement when subscription status changes
  useEffect(() => {
    const entitlement = getCustomerEntitlement(subscriptionStatus)
    setCustomerEntitlement(entitlement)
    
    // Re-filter packages when entitlement changes
    if (originalPackagesRef.current.length > 0) {
      const filtered = filterPackagesByEntitlement(originalPackagesRef.current)
      setPackages(filtered)
    }
  }, [subscriptionStatus, filterPackagesByEntitlement])

  // Load Yoco products when initialized
  useEffect(() => {
    if (isInitialized) {
      loadYocoProducts()
    }
  }, [isInitialized])

  // Initialize speech recognition and synthesis
  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        try {
          recognitionRef.current = new SpeechRecognition()
          recognitionRef.current.continuous = true
          recognitionRef.current.interimResults = true
          recognitionRef.current.lang = 'en-US'

          recognitionRef.current.onresult = async (event: any) => {
            let interimTranscript = ''
            let finalTranscript = ''
            let allTranscript = ''

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i]
              if (result && result[0]) {
                const transcript = result[0].transcript
                if (result.isFinal) {
                  finalTranscript += transcript + ' '
                  allTranscript += transcript + ' '
                } else {
                  interimTranscript += transcript
                  allTranscript += transcript
                }
              }
            }

            // Always update input with the combined transcript (final + interim)
            // This ensures the user sees their full speech as they speak
            const combinedTranscript = (finalTranscriptRef.current + allTranscript).trim()
            setInput(combinedTranscript)

            // Only process final transcripts when recognition stops (not immediately)
            // This prevents interrupting continuous recognition
            if (finalTranscript) {
              finalTranscriptRef.current = combinedTranscript
            }
          }

          recognitionRef.current.onend = () => {
            // Only restart if we're still supposed to be listening
            // and we haven't manually stopped
            if (isListening && !isProcessingRef.current) {
              // If we have a final transcript, process it before restarting
              if (finalTranscriptRef.current && finalTranscriptRef.current.trim()) {
                const transcriptToProcess = finalTranscriptRef.current.trim()
                finalTranscriptRef.current = ''
                
                // Process the transcript asynchronously without blocking restart
                handleAIRequest(transcriptToProcess).catch((error) => {
                  console.error('Error processing voice input:', error)
                })
              }
              
              // Restart recognition for continuous listening
              try {
                // Small delay to prevent rapid restart loops
                setTimeout(() => {
                  if (isListening && recognitionRef.current) {
                    recognitionRef.current.start()
                  }
                }, 100)
              } catch (error) {
                console.error('Error restarting speech recognition:', error)
                setIsListening(false)
                setMicError('Error with speech recognition. Please try again.')
              }
            } else if (!isListening) {
              // If we manually stopped, process any final transcript
              if (finalTranscriptRef.current && finalTranscriptRef.current.trim()) {
                const transcriptToProcess = finalTranscriptRef.current.trim()
                finalTranscriptRef.current = ''
                handleAIRequest(transcriptToProcess).catch((error) => {
                  console.error('Error processing voice input:', error)
                })
              }
            }
          }

          recognitionRef.current.onerror = (event: any) => {
            console.error('Speech recognition error:', event)
            setMicError('Error with speech recognition. Please try again.')
            setIsListening(false)
          }
        } catch (error) {
          console.error('Error initializing speech recognition:', error)
          setMicError('Speech recognition is not supported in your browser.')
        }
      } else {
        setMicError('Speech recognition is not supported in your browser.')
      }
    }

    // Initialize speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (synthRef.current) {
        synthRef.current.cancel()
      }
    }
  }, [isListening])

  const startListening = () => {
    if (!recognitionRef.current) {
      setMicError('Speech recognition is not available.')
      return
    }

    try {
      setMicError(null)
      finalTranscriptRef.current = ''
      recognitionRef.current.start()
      setIsListening(true)
    } catch (error) {
      console.error('Error starting speech recognition:', error)
      setMicError('Failed to start speech recognition. Please try again.')
      setIsListening(false)
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        // Set flag to prevent auto-restart
        isProcessingRef.current = false
        recognitionRef.current.stop()
        setIsListening(false)
        
        // Process any remaining transcript
        if (finalTranscriptRef.current && finalTranscriptRef.current.trim()) {
          const transcriptToProcess = finalTranscriptRef.current.trim()
          finalTranscriptRef.current = ''
          handleAIRequest(transcriptToProcess).catch((error) => {
            console.error('Error processing voice input:', error)
          })
        }
      } catch (error) {
        console.error('Error stopping speech recognition:', error)
        setMicError('Error stopping speech recognition.')
        setIsListening(false)
      }
    }
  }

  const speak = (text: string) => {
    if (synthRef.current) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => {
        setIsSpeaking(false)
        // If we're still listening, restart recognition after speaking
        if (isListening && recognitionRef.current) {
          try {
            recognitionRef.current.start()
          } catch (error) {
            console.error('Error restarting speech recognition after speaking:', error)
          }
        }
      }
      synthRef.current.speak(utterance)
    }
  }

  const loadYocoProducts = async () => {
    try {
      const response = await fetch('/api/yoco/products')
      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.status}`)
      }
      const data = await response.json()
      setOfferings(data.products || [])
    } catch (err) {
      console.error('Error loading Yoco products:', err)
    }
  }

  const handleBooking = async () => {
    if (!selectedPackage || !isLoggedIn) return
    
    // Prevent booking if dates are not available or if we're still checking
    if (!areDatesAvailable || isCheckingAvailability) {
      setBookingError('Please wait for availability check to complete or select different dates.')
      return
    }
    
    // Double-check availability before proceeding with booking (with addMessage = false to avoid duplicate messages)
    if (startDate && endDate) {
      const isAvailable = await checkDateAvailability(startDate, endDate, activeThreadRef.current, false)
      if (!isAvailable) {
        setBookingError('The selected dates are no longer available. Please choose different dates.')
        return
      }
    }
    
    setIsBooking(true)
    setBookingError(null)
    
    try {
      const total = selectedPackage.baseRate || calculateTotal(baseRate, duration, selectedPackage.multiplier)
      
      // Create estimate first
      console.log('Creating estimate with package:', {
        selectedPackage,
        packageType: selectedPackage.yocoId || selectedPackage.id,
        postId,
        total
      })
      
      const estimateData = {
        postId,
        fromDate: startDate?.toISOString() || new Date().toISOString(),
        toDate: endDate?.toISOString() || new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString(),
        guests: [],
        baseRate: total,
        duration,
        customer: currentUser?.id,
        packageType: selectedPackage.yocoId || selectedPackage.id,
        selectedPackage: {
          package: selectedPackage.id,
          customName: selectedPackage.name,
          enabled: true,
        },
        // Include estimateId if we have a latest estimate for this post to preserve package info
        estimateId: latestEstimate && (typeof latestEstimate.post === 'string' ? latestEstimate.post === postId : latestEstimate.post?.id === postId) 
          ? latestEstimate.id 
          : undefined,
      }
      
      const estimateResponse = await fetch('/api/estimates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(estimateData),
      })
      
      if (!estimateResponse.ok) {
        const errorData = await estimateResponse.json()
        throw new Error(errorData.error || 'Failed to create estimate')
      }
      
      const estimate = await estimateResponse.json()
      
      // Update latest estimate
      setLatestEstimate(estimate)
      
      // Create checkpoint after estimate is created
      // Wait for any confirmation messages to be added first
      setTimeout(() => {
        createEstimateCheckpoint(estimate, messages.length)
      }, 500)
      
      console.log('Available Yoco products:', offerings.map(pkg => ({
        id: pkg.id,
        title: pkg.title
      })))
      console.log('Looking for package with yocoId:', selectedPackage.yocoId)
      console.log('Selected package details:', {
        id: selectedPackage.id,
        name: selectedPackage.name,
        yocoId: selectedPackage.yocoId,
        source: selectedPackage.source
      })
      
      // Handle known package ID mismatches between database and Yoco
      const getYocoPackageId = (yocoId: string) => {
        const mappings: Record<string, string> = {
          'per_night': 'per_night_customer', // Database has per_night, Yoco has per_night_customer
          'Weekly': 'weekly_customer', // Database has Weekly, Yoco has weekly_customer (Standard Weekly)
          'week_x2_customer': 'week_x2_customer', // Database has week_x2_customer, Yoco has week_x2_customer
        }
        return mappings[yocoId] || yocoId
      }
      
      // Find the package in Yoco products (case-insensitive + mapping)
      const yocoProduct = offerings.find((pkg) => {
        const identifier = pkg.id
        const yocoId = selectedPackage.yocoId
        const mappedYocoId = yocoId ? getYocoPackageId(yocoId) : undefined
        
        console.log('Checking Yoco product:', {
          identifier,
          yocoId,
          mappedYocoId,
          matches: identifier === yocoId || 
                   identifier === mappedYocoId ||
                   (identifier && yocoId && identifier.toLowerCase() === yocoId.toLowerCase()) ||
                   (identifier && mappedYocoId && identifier.toLowerCase() === mappedYocoId.toLowerCase())
        })
        
        return identifier === yocoId || 
               identifier === mappedYocoId ||
               (identifier && yocoId && identifier.toLowerCase() === yocoId.toLowerCase()) ||
               (identifier && mappedYocoId && identifier.toLowerCase() === mappedYocoId.toLowerCase())
      })
      
      if (yocoProduct) {
        try {
          // Create Yoco payment link via API
          const response = await fetch('/api/yoco/payment-links', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              productId: yocoProduct.id,
              customerId: String(currentUser.id),
              customerName: currentUser.name || currentUser.email || 'Customer',
              estimateId: estimate.id, // Pass estimate ID so we can create booking after payment
              postId: postId,
              total: total,
              duration: duration,
              startDate: startDate?.toISOString(),
              endDate: endDate?.toISOString(),
              version: 'V2' // Use V2 API keys
            })
          })
          
          if (!response.ok) {
            throw new Error(`Failed to create payment link: ${response.status}`)
          }
          
          const data = await response.json()
          const paymentLink = data.paymentLink
          
          if (!paymentLink) {
            throw new Error('Failed to create payment link')
          }
          
          // Redirect to Yoco payment page
          window.location.href = paymentLink.url
          
        } catch (paymentError: any) {
          console.error('Yoco Payment Link Error:', paymentError)
          throw new Error('Payment link creation failed. Please try again.')
        }
      } else if (selectedPackage.source === 'database') {
        // Handle database packages directly
        try {
          console.log('Creating payment link for database package:', selectedPackage)
          
          const response = await fetch('/api/yoco/payment-links', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              packageData: {
                id: selectedPackage.id,
                name: selectedPackage.name,
                description: selectedPackage.description,
                baseRate: selectedPackage.baseRate,
                yocoId: selectedPackage.yocoId
              },
              customerId: String(currentUser.id),
              customerName: currentUser.name || currentUser.email || 'Customer',
              estimateId: estimate.id, // Pass estimate ID so we can create booking after payment
              postId: postId,
              total: total,
              duration: duration,
              startDate: startDate?.toISOString(),
              endDate: endDate?.toISOString(),
              version: 'V2' // Use V2 API keys
            })
          })
          
          if (!response.ok) {
            throw new Error(`Failed to create payment link: ${response.status}`)
          }
          
          const data = await response.json()
          const paymentLink = data.paymentLink
          
          if (!paymentLink) {
            throw new Error('Failed to create payment link')
          }
          
          // Redirect to Yoco payment page
          window.location.href = paymentLink.url
          
        } catch (paymentError: any) {
          console.error('Yoco Payment Link Error for database package:', paymentError)
          throw new Error('Payment link creation failed. Please try again.')
        }
      } else {
        // Fallback: Package not found in Yoco products
        console.error('❌ Package not found in Yoco products!')
        console.error('❌ Available products:', offerings.map(pkg => pkg.id))
        console.error('❌ Looking for:', selectedPackage.yocoId)
        console.error('❌ Mapped to:', selectedPackage.yocoId ? getYocoPackageId(selectedPackage.yocoId) : 'undefined')
        
        // In production, reject bookings without valid Yoco products
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Package "${selectedPackage.name}" (${selectedPackage.yocoId}) not found in Yoco. Please contact support.`)
        }
        
        // Development fallback: simulate payment success (DISABLED IN PRODUCTION)
        console.warn('⚠️ DEVELOPMENT MODE: Using fallback payment flow (payment bypassed)')
        console.warn('⚠️ This should NOT happen in production!')
        
        // Confirm the estimate with payment validation (for fallback case - DEV ONLY)
        const confirmResponse = await fetch(`/api/estimates/${estimate.id}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packageType: selectedPackage.yocoId || selectedPackage.id,
            baseRate: total,
            paymentValidated: true, // Mark that payment was successfully processed (fallback case)
            yocoPaymentId: `mock-${Date.now()}`, // Use mock ID for development
            selectedPackage: {
              package: selectedPackage.id,
              customName: selectedPackage.name,
              enabled: true,
            },
          }),
        })
        
        if (!confirmResponse.ok) {
          const errorData = await confirmResponse.json()
          throw new Error(errorData.error || 'Failed to confirm estimate')
        }
        
        const confirmedEstimate = await confirmResponse.json()
        
        // Create booking record AFTER successful estimate confirmation
        await createBookingRecord()
        
        // Clear booking journey after successful booking
        clearBookingJourney()
        
        // Redirect to booking confirmation with mock transaction ID
        router.push(`/booking-confirmation?total=${total}&duration=${duration}&transactionId=mock-${Date.now()}&success=true&estimateId=${estimate.id}`)
      }
      
    } catch (error) {
      console.error('Booking Error:', error)
      setBookingError(error instanceof Error ? error.message : 'An unknown error occurred')
    } finally {
      setIsBooking(false)
    }
  }

  // Create booking record in the database
  const createBookingRecord = async () => {
    if (!startDate || !endDate || !selectedPackage) {
      throw new Error('Start and end dates and a selected package are required')
    }

    const fallbackTotal = selectedPackage.baseRate || calculateTotal(baseRate, duration, selectedPackage.multiplier)
    const bookingData = {
      postId,
      fromDate: startDate.toISOString(),
      toDate: endDate.toISOString(),
      paymentStatus: 'paid',
      customer: currentUser?.id,
      title: postTitle,
      total: selectedPackageTotal ?? fallbackTotal,
      packageType: selectedPackage?.yocoId || selectedPackage?.id,
      selectedPackage: selectedPackage
        ? {
            package: selectedPackage.id,
            customName: selectedPackage.name,
            enabled: true,
          }
        : undefined,
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
    return booking
  }

  // Navigate to estimate details (latest or create then navigate)
  const handleGoToEstimate = async () => {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    try {
      setIsCreatingEstimate(true)
      // If we already loaded a latest estimate for this post, use it
      if (latestEstimate && (typeof latestEstimate.post === 'string' ? latestEstimate.post === postId : latestEstimate.post?.id === postId)) {
        router.push(`/estimate/${latestEstimate.id}`)
        return
      }

      // Otherwise, create a minimal estimate and navigate to it
      const from = startDate ? startDate.toISOString() : new Date().toISOString()
      const to = endDate
        ? endDate.toISOString()
        : new Date(Date.now() + (duration || 1) * 24 * 60 * 60 * 1000).toISOString()
      const multiplier = selectedPackage?.multiplier ?? 1
              const total = selectedPackage?.baseRate || calculateTotal(baseRate, duration || 1, multiplier)

      const resp = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          fromDate: from,
          toDate: to,
          guests: [],
          title: `Estimate for ${postId}`,
          packageType: selectedPackage?.yocoId || selectedPackage?.id || 'standard',
          total,
          selectedPackage: selectedPackage
            ? {
                package: selectedPackage.id,
                customName: selectedPackage.name,
                enabled: true,
              }
            : undefined,
          // Include estimateId if we have a latest estimate for this post to preserve package info
          estimateId: latestEstimate && (typeof latestEstimate.post === 'string' ? latestEstimate.post === postId : latestEstimate.post?.id === postId) 
            ? latestEstimate.id 
            : undefined,
        })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err?.error || 'Failed to create estimate')
      }
      const created = await resp.json()
      // Refresh latest estimate state for future actions
      await loadLatestEstimate(true)
      router.push(`/estimate/${created.id}`)
    } catch (e) {
      console.error('Failed navigating to estimate:', e)
    } finally {
      setIsCreatingEstimate(false)
    }
  }
  
  // Load packages - simplified to prevent infinite loops
  useEffect(() => {
    if (!loadedRef.current && !loadingRef.current) {
      loadingRef.current = true
      fetch(`/api/packages/post/${postId}`)
        .then(res => res.json())
        .then(data => {
          
          // Filter packages inline to avoid dependency issues
          const filtered = (data.packages || []).filter((pkg: Package) => {
            if (!pkg.isEnabled) return false
            
            // Filter out addon packages - these should only appear on the booking page
            if (pkg.category === 'addon') return false
            
            // 3-Tier System Implementation:
            
            // Tier 1: Non-subscribers (none) - Only see hosted/special packages (premium experience)
            if (customerEntitlement === 'none') {
              return ['hosted', 'special'].includes(pkg.category)
            }
            
            // Tier 2: Standard subscribers - See standard + hosted + special (better than non-subscribers)
            if (customerEntitlement === 'standard') {
              // Standard subscribers get more than non-subscribers
              const shouldShow = ['standard', 'hosted', 'special'].includes(pkg.category)
              
              console.log('🔍 Inline Standard subscriber package check:', {
                packageName: pkg.name,
                packageCategory: pkg.category,
                packageEntitlement: pkg.entitlement,
                shouldShow,
                reason: shouldShow ? `Package category '${pkg.category}' is available to Standard subscribers` : `Package category '${pkg.category}' is not available to Standard subscribers`
              })
              
              return shouldShow
            }
            
            // Tier 3: Pro subscribers - See everything (all packages)
            if (customerEntitlement === 'pro') {
              return true
            }
            
            // Legacy: Filter out pro-only packages for non-pro users
            // Only keep this for packages that don't have entitlement field in database
            if (pkg.yocoId === 'gathering_monthly' && customerEntitlement !== 'pro') return false
            
            return true
          })
          
          
          
          // Store original packages for re-filtering
          originalPackagesRef.current = data.packages || []
          setPackages(filtered)
          loadedRef.current = true
        })
        .catch(console.error)
        .finally(() => {
          loadingRef.current = false
        })
    }
  }, [postId, customerEntitlement])
  
  // Auto-scroll is now handled by Conversation component

  useEffect(() => {
    if (packages.length === 0) {
      return
    }

    if (selectedPackage && packages.some((pkg) => pkg.id === selectedPackage.id)) {
      return
    }

    const nextPackage = packages[0]
    if (nextPackage) {
      setSelectedPackage(nextPackage)
    }
  }, [packages, selectedPackage?.id])
  
  const handleQuickAction = (action: string, data?: any) => {
    const threadId = beginNewThread()
    let message = ''
    
    switch (action) {
      case 'select_dates':
        // If dates are already populated, acknowledge them
        if (startDate && endDate) {
          const acknowledgmentMessage: Message = {
            role: 'assistant',
            content: `I see you already have dates selected: ${format(startDate, 'MMM dd')} to ${format(endDate, 'MMM dd, yyyy')} (${duration} ${duration === 1 ? 'night' : 'nights'}). You can modify them below or ask me to suggest packages for these dates.`,
            type: 'text'
          }
          appendMessageToThread(threadId, acknowledgmentMessage)
        }
        
        const dateMessage: Message = {
          role: 'assistant',
          content: startDate && endDate ? 
            'You can modify your dates below if needed:' : 
            'Please select your check-in and check-out dates:',
          type: 'date_selection'
        }
        appendMessageToThread(threadId, dateMessage)
        return
      case 'suggest_duration':
        message = `For ${postTitle}, I'd recommend considering these durations:\n\n` +
          `• 1-2 nights: Perfect for a quick getaway\n` +
          `• 3-5 nights: Ideal for a relaxing break\n` +
          `• 7+ nights: Great for a longer vacation\n\n` +
          `What duration are you thinking of? I can help you find the perfect package.`
        break
      case 'show_packages':
        if (startDate && endDate) {
          showAvailablePackages(threadId)
          return
        } else {
          message = `I'd love to show you the best packages! To give you personalized recommendations, please select your dates first using the "Select Dates" button above.`
        }
        break
      case 'get_recommendation':
        if (startDate && endDate) {
          message = `Based on your ${duration} ${duration === 1 ? 'night' : 'nights'} stay at ${postTitle}, here are my top recommendations:\n\n` +
            `• For couples: Romantic packages with premium amenities\n` +
            `• For families: Spacious options with kid-friendly features\n` +
            `• For business: Professional packages with work amenities\n\n` +
            `Let me show you the specific packages available for your dates!`
          
          const assistantMessage: Message = { role: 'assistant', content: message, type: 'text' }
          appendMessageToThread(threadId, assistantMessage)
          
          // Show packages after the recommendation message
          setTimeout(() => showAvailablePackages(threadId), 1000)
          return
        } else {
          message = `I'd love to give you personalized recommendations! To suggest the best packages for your needs, please select your travel dates first using the "Select Dates" button above.`
        }
        break
      case 'smart_action':
        // Intelligent action that combines multiple actions based on current state
        if (startDate && endDate) {
          // If dates are selected, check availability first, then show recommendations
          checkDateAvailability(startDate, endDate, threadId, true).then((isAvailable) => {
            if (activeThreadRef.current !== threadId) return
            
            if (isAvailable) {
              // Dates are available - show recommendations and packages
              message = `Great! Your dates (${format(startDate, 'MMM dd')} to ${format(endDate, 'MMM dd, yyyy')}) are available. Here are my recommendations for your ${duration} ${duration === 1 ? 'night' : 'nights'} stay:`
              const assistantMessage: Message = { role: 'assistant', content: message, type: 'text' }
              appendMessageToThread(threadId, assistantMessage)
              setTimeout(() => showAvailablePackages(threadId), 1000)
            } else {
              // Dates not available - availability check will show suggestions
              return
            }
          })
          return
        } else {
          // No dates selected - suggest when to visit and help choose dates
          message = `I'd love to help you plan your visit! For ${postTitle}, I'd recommend:\n\n` +
            `• 1-2 nights: Perfect for a quick getaway\n` +
            `• 3-5 nights: Ideal for a relaxing break\n` +
            `• 7+ nights: Great for a longer vacation\n\n` +
            `Please select your dates above, and I'll show you the best packages and check availability.`
        }
        break
      case 'check_availability':
        if (startDate && endDate) {
          // Check availability and provide feedback (with addMessage = true to show result)
          checkDateAvailability(startDate, endDate, threadId, true).then((isAvailable) => {
            if (activeThreadRef.current !== threadId) return
            const availabilityMessage: Message = {
              role: 'assistant',
              content: isAvailable ? 
                `✅ Great news! Your selected dates (${format(startDate, 'MMM dd')} to ${format(endDate, 'MMM dd, yyyy')}) are available for booking.` :
                `❌ Unfortunately, your selected dates (${format(startDate, 'MMM dd')} to ${format(endDate, 'MMM dd, yyyy')}) are not available. Please select different dates.`,
              type: 'text'
            }
            appendMessageToThread(threadId, availabilityMessage)
          })
          return
        } else {
          message = `To check availability, please select your dates first using the "Select Dates" button above.`
        }
        break
      default:
        message = 'I can help you with that! What would you like to know?'
    }
    
    if (message) {
      const assistantMessage: Message = { role: 'assistant', content: message, type: 'text' }
      appendMessageToThread(threadId, assistantMessage)
    }
  }

  const showAvailablePackages = (threadId: number = activeThreadRef.current) => {
    
    if (threadId !== activeThreadRef.current) {
      return
    }
    
    // Use existing packages instead of making new API calls
    if (packages.length > 0) {
      // Apply entitlement filtering first
      const filteredPackages = filterPackagesByEntitlement(packages)
      
      // Filter packages by duration if dates are selected
      let suitablePackages = filteredPackages
      if (startDate && endDate) {
        const selectedDuration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        setDuration(selectedDuration)
        
        // Filter packages that match the duration
        suitablePackages = filteredPackages.filter((pkg: any) => {
          return selectedDuration >= pkg.minNights && selectedDuration <= pkg.maxNights
        })
        
        // If no exact matches, include packages that can accommodate the duration
        if (suitablePackages.length === 0) {
          suitablePackages = filteredPackages.filter((pkg: any) => {
            return pkg.maxNights >= selectedDuration || pkg.maxNights === 1 // Include per-night packages
          })
        }
      }
      
      // Sort packages by relevance and select top 3
      const sortedPackages = suitablePackages.sort((a: any, b: any) => {
        
        // Prioritize packages that exactly match the duration
        const aExactMatch = startDate && endDate ? 
          (duration >= a.minNights && duration <= a.maxNights) : false
        const bExactMatch = startDate && endDate ? 
          (duration >= b.minNights && duration <= b.maxNights) : false
        
        if (aExactMatch && !bExactMatch) return -1
        if (!aExactMatch && bExactMatch) return 1
        
        // Then sort by category priority (special > hosted > standard)
        // Note: addon packages are filtered out earlier and should not appear here
        // Yoco packages without category field get default priority
        const categoryPriority: Record<string, number> = { special: 3, hosted: 2, standard: 1 }
        const aPriority = a.category ? categoryPriority[a.category as string] || 1 : 1
        const bPriority = b.category ? categoryPriority[b.category as string] || 1 : 1
        
        
        if (aPriority !== bPriority) return bPriority - aPriority
        
        // Finally sort by multiplier (higher first)
        return (b.multiplier || 1) - (a.multiplier || 1)
      })
      
      // Take top 3 packages
      const suggestedPackages = sortedPackages.slice(0, 3)
      
      // Create personalized message based on duration
      let message = ''
      if (startDate && endDate) {
        message = `Based on your ${duration} ${duration === 1 ? 'night' : 'nights'} stay from ${format(startDate, 'MMM dd')} to ${format(endDate, 'MMM dd, yyyy')}, here are my top 3 recommendations:`
      } else {
        message = `Here are my top 3 package recommendations for ${postTitle}:`
      }
      
      const packageMessage: Message = {
        role: 'assistant',
        content: message,
        type: 'package_suggestion',
        data: { packages: suggestedPackages }
      }
      appendMessageToThread(threadId, packageMessage)
    } else {
      // Fallback: load packages if none exist
      fetch(`/api/packages/post/${postId}`)
        .then(res => res.json())
        .then(data => {
          // Apply entitlement filtering first
          const allPackages = filterPackagesByEntitlement((data.packages || []).filter((pkg: Package) => pkg.isEnabled))
          
          // Filter packages by duration if dates are selected
          let suitablePackages = allPackages
          if (startDate && endDate) {
            const selectedDuration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            setDuration(selectedDuration)
            
            // Filter packages that match the duration
            suitablePackages = allPackages.filter((pkg: any) => {
              return selectedDuration >= pkg.minNights && selectedDuration <= pkg.maxNights
            })
            
            // If no exact matches, include packages that can accommodate the duration
            if (suitablePackages.length === 0) {
              suitablePackages = allPackages.filter((pkg: any) => {
                return pkg.maxNights >= selectedDuration || pkg.maxNights === 1 // Include per-night packages
              })
            }
          }
          
          // Sort packages by relevance and select top 3
          const sortedPackages = suitablePackages.sort((a: any, b: any) => {
            // Prioritize packages that exactly match the duration
            const aExactMatch = startDate && endDate ? 
              (duration >= a.minNights && duration <= a.maxNights) : false
            const bExactMatch = startDate && endDate ? 
              (duration >= b.minNights && duration <= b.maxNights) : false
            
            if (aExactMatch && !bExactMatch) return -1
            if (!aExactMatch && bExactMatch) return 1
            
            // Then sort by category priority (special > hosted > standard)
            // Note: addon packages are filtered out earlier and should not appear here
            const categoryPriority: Record<string, number> = { special: 3, hosted: 2, standard: 1 }
            const aPriority = categoryPriority[a.category as string] || 1
            const bPriority = categoryPriority[b.category as string] || 1
            
            if (aPriority !== bPriority) return bPriority - aPriority
            
            // Finally sort by multiplier (higher first)
            return (b.multiplier || 1) - (a.multiplier || 1)
          })
          
          // Take top 3 packages
          const suggestedPackages = sortedPackages.slice(0, 3)
          setPackages(suggestedPackages)
          
          // Create personalized message based on duration
          let message = ''
          if (startDate && endDate) {
            message = `Based on your ${duration} ${duration === 1 ? 'night' : 'nights'} stay from ${format(startDate, 'MMM dd')} to ${format(endDate, 'MMM dd, yyyy')}, here are my top 3 recommendations:`
          } else {
            message = `Here are my top 3 package recommendations for ${postTitle}:`
          }
          
          const packageMessage: Message = {
            role: 'assistant',
            content: message,
            type: 'package_suggestion',
            data: { packages: suggestedPackages }
          }
          if (activeThreadRef.current !== threadId) return
          appendMessageToThread(threadId, packageMessage)
        })
        .catch(err => {
          console.error('Error loading packages:', err)
          if (activeThreadRef.current !== threadId) return
          const errorMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error loading packages. Please try again.',
            type: 'text'
          }
          appendMessageToThread(threadId, errorMessage)
        })
    }
  }
  
  // Parse dates from user message
  const parseDatesFromMessage = (message: string): { startDate: Date | null; endDate: Date | null; duration: number | null } => {
    const lowerMessage = message.toLowerCase()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let parsedStartDate: Date | null = null
    let parsedEndDate: Date | null = null
    let parsedDuration: number | null = null
    
    // Try to parse explicit date formats (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
    const datePatterns = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/g, // MM/DD/YYYY or DD/MM/YYYY
      /(\d{4})-(\d{1,2})-(\d{1,2})/g, // YYYY-MM-DD
      /(\d{1,2})-(\d{1,2})-(\d{4})/g, // MM-DD-YYYY or DD-MM-YYYY
      /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/gi, // "January 15" or "Jan 15 2024"
    ]
    
    const dates: Date[] = []
    
    // Try to find explicit dates
    for (const pattern of datePatterns) {
      const matches = [...message.matchAll(pattern)]
      for (const match of matches) {
        try {
          let date: Date
          if (pattern === datePatterns[0] || pattern === datePatterns[2]) {
            // MM/DD/YYYY or DD/MM/YYYY format
            const month = match[1] ? parseInt(match[1]) : 0
            const day = match[2] ? parseInt(match[2]) : 0
            const year = match[3] ? parseInt(match[3]) : 0
            if (month && day && year) {
              date = new Date(year, month - 1, day)
            } else {
              continue
            }
          } else if (pattern === datePatterns[1]) {
            // YYYY-MM-DD format
            if (match[0]) {
              date = new Date(match[0])
            } else {
              continue
            }
          } else {
            // Month name format
            if (match[0]) {
              date = new Date(match[0])
            } else {
              continue
            }
          }
          if (!isNaN(date.getTime())) {
            dates.push(date)
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    
    // If we found explicit dates, use them
    if (dates.length >= 2) {
      dates.sort((a, b) => a.getTime() - b.getTime())
      parsedStartDate = dates[0] || null
      parsedEndDate = dates[1] || null
      if (parsedStartDate && parsedEndDate) {
        parsedDuration = Math.ceil((parsedEndDate.getTime() - parsedStartDate.getTime()) / (1000 * 60 * 60 * 24))
      }
    } else if (dates.length === 1) {
      parsedStartDate = dates[0] || null
      // Try to infer end date from duration
      if (parsedStartDate && parsedDuration) {
        parsedEndDate = new Date(parsedStartDate.getTime() + parsedDuration * 24 * 60 * 60 * 1000)
      }
    }
    
    // Parse month names with dates (e.g., "December 15", "Dec 15", "December 15-20", "December")
    if (!parsedStartDate || !parsedEndDate) {
      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
      ]
      const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      
      // Pattern: "December 15" or "Dec 15" or "December 15-20" or "December 15 to 20"
      const monthDatePatterns = [
        /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:\s*-\s*|\s+to\s+)(\d{1,2})(?:\s*,?\s*(\d{4}))?/gi,
        /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/gi,
      ]
      
      for (const pattern of monthDatePatterns) {
        const matches = [...message.matchAll(pattern)]
        for (const match of matches) {
          try {
            const monthName = match[1]?.toLowerCase() || ''
            const monthIndex = monthNames.indexOf(monthName) !== -1 
              ? monthNames.indexOf(monthName)
              : monthAbbrevs.indexOf(monthName)
            
            if (monthIndex !== -1) {
              const day1 = parseInt(match[2] || '0')
              const day2 = match[3] ? parseInt(match[3]) : null
              const year = match[4] ? parseInt(match[4]) : today.getFullYear()
              
              if (day1 && day2) {
                // Range: "December 15-20"
                parsedStartDate = new Date(year, monthIndex, day1)
                parsedEndDate = new Date(year, monthIndex, day2)
                parsedDuration = day2 - day1
              } else if (day1 && !parsedStartDate) {
                // Single date: "December 15"
                parsedStartDate = new Date(year, monthIndex, day1)
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      
      // Also check for just month name (e.g., "December" or "in December")
      // This will be combined with duration if available
      if (!parsedStartDate) {
        const monthOnlyPattern = /(?:in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s|$)/gi
        const monthMatch = message.match(monthOnlyPattern)
        if (monthMatch) {
          const monthName = monthMatch[0].replace(/in\s+/gi, '').trim().toLowerCase()
          const monthIndex = monthNames.indexOf(monthName) !== -1 
            ? monthNames.indexOf(monthName)
            : monthAbbrevs.indexOf(monthName)
          
          if (monthIndex !== -1) {
            // Default to first day of the month if no day specified
            const year = today.getFullYear()
            // If the month has passed this year, use next year
            const targetMonth = monthIndex
            const targetYear = (today.getMonth() > monthIndex) ? year + 1 : year
            parsedStartDate = new Date(targetYear, monthIndex, 1)
          }
        }
      }
    }
    
    // Parse relative dates and durations
    if (!parsedStartDate) {
      // "tomorrow", "next week", "next month", etc.
      if (lowerMessage.includes('tomorrow')) {
        parsedStartDate = new Date(today.getTime() + 24 * 60 * 60 * 1000)
      } else if (lowerMessage.includes('next week')) {
        parsedStartDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      } else if (lowerMessage.includes('next month')) {
        parsedStartDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())
      } else if (lowerMessage.includes('in ') && lowerMessage.match(/in\s+(\d+)\s+days?/i)) {
        const daysMatch = lowerMessage.match(/in\s+(\d+)\s+days?/i)
        if (daysMatch && daysMatch[1]) {
          const days = parseInt(daysMatch[1])
          parsedStartDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)
        }
      }
    }
    
    // Parse duration (nights, days)
    const durationPatterns = [
      /(\d+)\s+(?:night|nights)/i,
      /(\d+)\s+(?:day|days)/i,
      /for\s+(\d+)/i,
    ]
    
    for (const pattern of durationPatterns) {
      const match = message.match(pattern)
      if (match && match[1]) {
        parsedDuration = parseInt(match[1])
        break
      }
    }
    
    // If we have start date and duration but no end date, calculate it
    if (parsedStartDate && parsedDuration && !parsedEndDate) {
      parsedEndDate = new Date(parsedStartDate.getTime() + parsedDuration * 24 * 60 * 60 * 1000)
    }
    
    // If we have end date and duration but no start date, calculate it
    if (parsedEndDate && parsedDuration && !parsedStartDate) {
      parsedStartDate = new Date(parsedEndDate.getTime() - parsedDuration * 24 * 60 * 60 * 1000)
    }
    
    return {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      duration: parsedDuration,
    }
  }

  const handleAIRequest = async (message: string) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return

    // Parse dates from user message BEFORE processing
    const parsedDates = parseDatesFromMessage(trimmedMessage)
    
    console.log('📅 Parsed dates from message:', {
      message: trimmedMessage,
      parsedDates: {
        startDate: parsedDates.startDate?.toISOString(),
        endDate: parsedDates.endDate?.toISOString(),
        duration: parsedDates.duration,
      },
      currentState: {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        duration,
      },
    })
    
    // Update dates if parsed successfully and update estimate
    if (parsedDates.startDate && parsedDates.endDate) {
      const newDuration = parsedDates.duration || Math.ceil((parsedDates.endDate.getTime() - parsedDates.startDate.getTime()) / (1000 * 60 * 60 * 24))
      
      // Update state immediately
      setStartDate(parsedDates.startDate)
      setEndDate(parsedDates.endDate)
      setDuration(newDuration)
      
      // Reset package suggestions to allow new suggestions for new dates
      packagesSuggestedRef.current = false
      
      // IMPORTANT: Check availability BEFORE updating estimate to prevent creating estimates with unavailable dates
      console.log('🔍 Checking availability with parsed dates:', {
        startDate: parsedDates.startDate.toISOString(),
        endDate: parsedDates.endDate.toISOString(),
        packageId: selectedPackage?.id,
      })
      
      const isAvailable = await checkDateAvailability(parsedDates.startDate, parsedDates.endDate, activeThreadRef.current, false)
      
      if (!isAvailable) {
        console.warn('⚠️ Dates are not available, skipping estimate update')
        // Don't update estimate if dates are not available
        // The availability check will show suggestions to the user
        // Continue with AI response but don't update estimate
      } else {
        // Only update estimate if dates are available
        if (latestEstimate && isLoggedIn && currentUser) {
          try {
            const total = selectedPackage?.baseRate || calculateTotal(baseRate, newDuration, selectedPackage?.multiplier || 1)
            
            console.log('💾 Updating estimate with new dates:', {
              estimateId: latestEstimate.id,
              fromDate: parsedDates.startDate.toISOString(),
              toDate: parsedDates.endDate.toISOString(),
              duration: newDuration,
            })
            
            const estimateResponse = await fetch('/api/estimates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                postId,
                fromDate: parsedDates.startDate.toISOString(),
                toDate: parsedDates.endDate.toISOString(),
                guests: [],
                baseRate: total,
                duration: newDuration,
                customer: currentUser.id,
                packageType: selectedPackage?.yocoId || selectedPackage?.id || latestEstimate.packageType,
                selectedPackage: selectedPackage ? {
                  package: selectedPackage.id,
                  customName: selectedPackage.name,
                  enabled: true,
                } : latestEstimate.selectedPackage,
                estimateId: latestEstimate.id, // Update existing estimate
              }),
            })
            
            if (estimateResponse.ok) {
              const updatedEstimate = await estimateResponse.json()
              console.log('✅ Estimate updated successfully:', updatedEstimate.id)
              setLatestEstimate(updatedEstimate)
            }
          } catch (error) {
            console.error('❌ Error updating estimate with new dates:', error)
          }
        }
      }
    } else if (parsedDates.duration && startDate) {
      // If we have a duration and existing start date, update end date
      const newEndDate = new Date(startDate.getTime() + parsedDates.duration * 24 * 60 * 60 * 1000)
      
      // Check availability BEFORE updating
      const isAvailable = await checkDateAvailability(startDate, newEndDate, activeThreadRef.current, false)
      
      if (!isAvailable) {
        console.warn('⚠️ Dates are not available, skipping estimate update')
        // Don't update estimate if dates are not available
        // Continue with AI response but don't update estimate
      } else {
        // Only update if available
        setEndDate(newEndDate)
        setDuration(parsedDates.duration)
        packagesSuggestedRef.current = false
        
        // Update estimate if exists
        if (latestEstimate && isLoggedIn && currentUser) {
          try {
            const total = selectedPackage?.baseRate || calculateTotal(baseRate, parsedDates.duration, selectedPackage?.multiplier || 1)
            
            const estimateResponse = await fetch('/api/estimates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                postId,
                fromDate: startDate.toISOString(),
                toDate: newEndDate.toISOString(),
                guests: [],
                baseRate: total,
                duration: parsedDates.duration,
                customer: currentUser.id,
                packageType: selectedPackage?.yocoId || selectedPackage?.id || latestEstimate.packageType,
                selectedPackage: selectedPackage ? {
                  package: selectedPackage.id,
                  customName: selectedPackage.name,
                  enabled: true,
                } : latestEstimate.selectedPackage,
                estimateId: latestEstimate.id,
              }),
            })
            
            if (estimateResponse.ok) {
              const updatedEstimate = await estimateResponse.json()
              setLatestEstimate(updatedEstimate)
            }
          } catch (error) {
            console.error('Error updating estimate with new duration:', error)
          }
        }
      }
    }

    const userMessage: Message = { role: 'user', content: trimmedMessage }
    const threadId = beginNewThread([userMessage])
    setInput('')
    setIsLoading(true)

    const speakSafely = (text: string) => {
      if (activeThreadRef.current === threadId) {
        speak(text)
      }
    }

    try {
      if (trimmedMessage.toLowerCase().includes('debug packages') || 
          trimmedMessage.toLowerCase().includes('debug') ||
          trimmedMessage.toLowerCase().includes('show packages')) {
        try {
          const response = await fetch(`/api/packages/post/${postId}`)
          if (response.ok) {
            const data = await response.json()
            if (activeThreadRef.current !== threadId) return
            const packages = data.packages || []

            const userEntitlement = currentUser?.role === 'admin'
              ? 'pro'
              : currentUser?.subscriptionStatus?.plan || 'none'

            const debugInfo = `
**Debug Package Information:**
- Total packages found: ${packages.length}
- User role: ${currentUser?.role || 'guest'}
- Subscription plan: ${currentUser?.subscriptionStatus?.plan || 'none'}
- Entitlement level: ${userEntitlement}

**Available Packages:**
${packages.map((pkg: any, index: number) => 
  `${index + 1}. **${pkg.name}**
     - Category: ${pkg.category || 'N/A'}
     - Entitlement: ${pkg.entitlement || 'N/A'}
     - Enabled: ${pkg.isEnabled ? 'Yes' : 'No'}
     - Min/Max nights: ${pkg.minNights}-${pkg.maxNights}
     - Multiplier: ${pkg.multiplier}x
     - Yoco ID: ${pkg.yocoId || 'N/A'}
     - Features: ${pkg.features?.length || 0} features`
).join('\n\n')}

**Filtering Logic:**
- Non-subscribers see: hosted, special packages only
- Standard subscribers see: standard, hosted, special packages
- Pro subscribers see: all packages
- Addon packages are filtered out (booking page only)
            `
            
            const assistantMessage: Message = {
              role: 'assistant',
              content: debugInfo,
            }
            appendMessageToThread(threadId, assistantMessage)
            speakSafely("Here's the debug information for packages and entitlements.")
            if (activeThreadRef.current === threadId) {
              setIsLoading(false)
            }
            return
          }
        } catch (error) {
          console.error('Debug packages error:', error)
          if (activeThreadRef.current === threadId) {
            const assistantMessage: Message = {
              role: 'assistant',
              content: 'Sorry, I encountered an error while fetching debug information. Please try again.',
            }
            appendMessageToThread(threadId, assistantMessage)
            setIsLoading(false)
          }
          return
        }
      }
      
      // If user is not logged in, provide basic responses without API call
      if (!isLoggedIn) {
        let response = ''
        const lowerMessage = trimmedMessage.toLowerCase()
        
        if (lowerMessage.includes('package') || lowerMessage.includes('option')) {
          response = `Here are the available packages for ${postTitle}. Please log in for personalized recommendations and to complete your booking.`
          const assistantMessage: Message = {
            role: 'assistant',
            content: response,
            type: 'text',
          }
          appendMessageToThread(threadId, assistantMessage)
          setTimeout(() => showAvailablePackages(threadId), 500)
        } else if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
          response = `Pricing starts at R${baseRate} per night, with different packages offering various multipliers. Log in to see personalized pricing and complete your booking.`
        } else if (lowerMessage.includes('book') || lowerMessage.includes('reserve')) {
          response = `To complete a booking, please log in first. I'll be able to help you through the entire process once you're logged in!`
        } else {
          response = `I'd love to help you with that! For the full AI assistant experience and personalized recommendations, please log in. I can show you available packages without logging in if you'd like.`
        }
        
        const assistantMessage: Message = {
          role: 'assistant',
          content: response,
          type: 'text',
        }
        appendMessageToThread(threadId, assistantMessage)
        if (activeThreadRef.current === threadId) {
          setIsLoading(false)
        }
        return
      }
      
      // For logged-in users, use the full AI API with enhanced context
      // IMPORTANT: Use parsed dates directly (not from state) since state updates are async
      // This ensures the AI sees the dates the user just entered
      const effectiveStartDate = parsedDates.startDate || startDate
      const effectiveEndDate = parsedDates.endDate || endDate
      const effectiveDuration = parsedDates.duration || (effectiveStartDate && effectiveEndDate 
        ? Math.ceil((effectiveEndDate.getTime() - effectiveStartDate.getTime()) / (1000 * 60 * 60 * 24))
        : duration)
      
      const contextString = `
Property Context:
- Title: ${postTitle}
- Description: ${postDescription}
- Base Rate: R${baseRate}
- Post ID: ${postId}

Current Booking State:
- Selected Package: ${selectedPackage?.name || 'None'}
- Duration: ${effectiveDuration} ${effectiveDuration === 1 ? 'night' : 'nights'}
- Start Date: ${effectiveStartDate ? format(effectiveStartDate, 'MMM dd, yyyy') : 'Not selected'}
- End Date: ${effectiveEndDate ? format(effectiveEndDate, 'MMM dd, yyyy') : 'Not selected'}
- Available Packages: ${packages.length}
- User Entitlement: ${customerEntitlement}

Availability Status:
- Are dates available: ${areDatesAvailable ? 'Yes' : 'No'}
- Currently checking availability: ${isCheckingAvailability ? 'Yes' : 'No'}
${parsedDates.startDate && parsedDates.endDate ? `\nIMPORTANT: User just requested dates: ${format(parsedDates.startDate, 'MMM dd, yyyy')} to ${format(parsedDates.endDate, 'MMM dd, yyyy')}. Use these dates in your response, not any previously mentioned dates.` : ''}
      `
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `${contextString}\n\nUser question: ${message}`,
          context: 'smart-estimate'
        })
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to use the AI assistant.')
        }
        throw new Error(`Server error: ${response.status}`)
      }
      
      const data = await response.json()
      if (activeThreadRef.current !== threadId) return
      
      if (!data.message) {
        throw new Error('No response from AI assistant.')
      }
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        type: 'text',
      }
      appendMessageToThread(threadId, assistantMessage)
      speakSafely(data.message)
      
      if (
        typeof data.message === 'string' &&
        (data.message.toLowerCase().includes('package') || data.message.toLowerCase().includes('option'))
      ) {
        setTimeout(() => showAvailablePackages(threadId), 1000)
      }
      
    } catch (error) {
      console.error('Error:', error)
      if (activeThreadRef.current === threadId) {
        const errorMessage: Message = {
          role: 'assistant',
          content:
            error instanceof Error
              ? error.message
              : 'Sorry, I encountered an error. Please try again or use the quick actions above.',
          type: 'text',
        }
        appendMessageToThread(threadId, errorMessage)
        speakSafely(error instanceof Error ? error.message : 'Sorry, I encountered an error.')
      }
    } finally {
      if (activeThreadRef.current === threadId) {
        setIsLoading(false)
      }
    }
  }
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleAIRequest(input)
  }

  const handlePromptSubmit = (message: PromptInputMessage) => {
    if (message.text?.trim()) {
      handleAIRequest(message.text)
      setInput('')
    }
  }
  
  const renderMessage = (message: Message, index: number) => {
    if (message.type === 'package_suggestion') {
      const { packages: suggestedPackages } = message.data || { packages: [] }
      return (
        <Message key={index} from="assistant">
          <MessageContent>
            <MessageResponse>{message.content || 'Here are the available packages:'}</MessageResponse>
            <div className="grid gap-2 mt-4">
              {suggestedPackages.map((pkg: Package, pkgIndex: number) => (
                <PackageCard
                  key={`${pkg.id}-${pkgIndex}`}
                  package={pkg}
                  duration={duration}
                  baseRate={baseRate}
                  isSelected={selectedPackage?.id === pkg.id}
                  onSelect={() => {
                    setSelectedPackage(pkg)
                    const confirmMessage: Message = {
                      role: 'assistant',
                      content: `Great choice! You've selected "${pkg.name}". This package includes: ${pkg.features.join(', ')}. Would you like to proceed with booking or do you have any questions?`,
                      type: 'text'
                    }
                    appendMessageToThread(activeThreadRef.current, confirmMessage)
                  }}
                />
              ))}
            </div>
          </MessageContent>
        </Message>
      )
    }
    
    if (message.type === 'date_suggestion') {
      const { suggestedDates } = message.data || { suggestedDates: [] }
      console.log('🎯 Rendering date_suggestion message:', {
        messageType: message.type,
        suggestedDatesCount: suggestedDates.length,
        suggestedDates,
        messageData: message.data,
      })
      
      if (!suggestedDates || suggestedDates.length === 0) {
        console.warn('⚠️ date_suggestion message has no suggestedDates')
        // Fall back to text message if no suggestions
        return (
          <div key={index} className="bg-muted p-3 rounded-lg">
            <p className="text-sm">{message.content}</p>
          </div>
        )
      }
      
      return (
        <Message key={index} from="assistant">
          <MessageContent>
            <MessageResponse>{message.content}</MessageResponse>
            {suggestedDates.length > 0 && (
              <div className="mt-4">
                <Suggestions>
                  {suggestedDates.map((suggestion: { startDate: string; endDate: string; duration: number }, idx: number) => {
                    const suggestionStart = new Date(suggestion.startDate)
                    const suggestionEnd = new Date(suggestion.endDate)
                    
                    // Validate dates
                    if (isNaN(suggestionStart.getTime()) || isNaN(suggestionEnd.getTime())) {
                      console.error('❌ Invalid date in suggestion:', suggestion)
                      return null
                    }
                    
                    const suggestionText = `${format(suggestionStart, 'MMM dd')} - ${format(suggestionEnd, 'MMM dd')}`
                    
                    return (
                      <Suggestion
                        key={idx}
                        suggestion={suggestionText}
                        onClick={() => {
                          setStartDate(suggestionStart)
                          setEndDate(suggestionEnd)
                          setDuration(suggestion.duration)
                          preservedStartDateRef.current = suggestionStart
                          
                          // Check availability for the new dates
                          checkDateAvailability(suggestionStart, suggestionEnd, activeThreadRef.current, false)
                          
                          const confirmMessage: Message = {
                            role: 'assistant',
                            content: `Great! I've updated your dates to ${format(suggestionStart, 'MMM dd')} - ${format(suggestionEnd, 'MMM dd, yyyy')} (${suggestion.duration} ${suggestion.duration === 1 ? 'night' : 'nights'}).`,
                            type: 'text'
                          }
                          appendMessageToThread(activeThreadRef.current, confirmMessage)
                        }}
                        className="text-xs"
                      />
                    )
                  })}
                </Suggestions>
              </div>
            )}
          </MessageContent>
        </Message>
      )
    }
    
    if (message.type === 'date_selection') {
      return (
        <div key={index} className="space-y-4">
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm">{message.content}</p>
            {startDate && endDate && (
              <p className="text-xs text-muted-foreground mt-2">
                Current selection: {format(startDate, 'MMM dd')} - {format(endDate, 'MMM dd, yyyy')} ({duration} {duration === 1 ? 'night' : 'nights'})
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal text-xs h-9',
                      !startDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {startDate ? formatDateNatural(startDate) : <span>Select start date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate || undefined}
                    onSelect={(date) => {
                      if (date) {
                        // Normalize to start of day
                        const normalizedDate = new Date(date)
                        normalizedDate.setHours(0, 0, 0, 0)
                        
                        // Update preserved date
                        preservedStartDateRef.current = normalizedDate
                        setStartDate(normalizedDate)
                        packagesSuggestedRef.current = false
                        
                        // Only adjust endDate if it's before the new startDate
                        if (endDate && normalizedDate > endDate) {
                          setEndDate(new Date(normalizedDate.getTime() + duration * 24 * 60 * 60 * 1000))
                        }
                      }
                    }}
                    disabled={(date) => {
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const checkDate = new Date(date)
                      checkDate.setHours(0, 0, 0, 0)
                      
                      // Disable past dates
                      if (checkDate < today) return true
                      
                      // Normalize date to YYYY-MM-DD format for comparison
                      const dateStr = normalizeDateToString(checkDate)
                      
                      // Check if this date is unavailable by comparing date parts
                      const isUnavailable = unavailableDates.some((unavailableDateStr) => {
                        const unavailableDatePart = normalizeDateToString(unavailableDateStr)
                        return unavailableDatePart === dateStr
                      })
                      
                      if (isUnavailable) return true
                      
                      return false
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal text-xs h-9',
                      !endDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {endDate ? formatDateNatural(endDate) : <span>Select end date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate || undefined}
                    onSelect={(date) => {
                      if (date) {
                        // Normalize to start of day
                        const normalizedDate = new Date(date)
                        normalizedDate.setHours(0, 0, 0, 0)
                        
                        setEndDate(normalizedDate)
                        packagesSuggestedRef.current = false
                        
                        // CRITICAL FIX: Preserve startDate when selecting endDate
                        // Only adjust startDate if endDate is actually before startDate (user error case)
                        if (startDate && preservedStartDateRef.current) {
                          const startDateOnly = new Date(startDate)
                          startDateOnly.setHours(0, 0, 0, 0)
                          const endDateOnly = new Date(normalizedDate)
                          endDateOnly.setHours(0, 0, 0, 0)
                          
                          // Only adjust if end date is actually before start date (not equal)
                          if (endDateOnly < startDateOnly) {
                            // Calculate new start date based on duration, but don't go before today
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const newStartDate = new Date(endDateOnly.getTime() - duration * 24 * 60 * 60 * 1000)
                            // Only update if the calculated date is valid and not before today
                            if (newStartDate >= today) {
                              setStartDate(newStartDate)
                              preservedStartDateRef.current = newStartDate
                            }
                          } else {
                            // If endDate is valid and >= startDate, ensure startDate is preserved
                            if (preservedStartDateRef.current && startDate.getTime() !== preservedStartDateRef.current.getTime()) {
                              setStartDate(preservedStartDateRef.current)
                            }
                          }
                        }
                      }
                    }}
                    disabled={(date) => {
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const checkDate = new Date(date)
                      checkDate.setHours(0, 0, 0, 0)
                      
                      // Disable if no start date selected
                      if (!startDate) return true
                      
                      // Disable past dates
                      if (checkDate < today) return true
                      
                      // Disable dates before or equal to start date
                      const startDateOnly = new Date(startDate)
                      startDateOnly.setHours(0, 0, 0, 0)
                      if (checkDate <= startDateOnly) return true
                      
                      // Normalize date to YYYY-MM-DD format for comparison
                      const dateStr = normalizeDateToString(checkDate)
                      
                      // Check if this date is unavailable by comparing date parts
                      const isUnavailable = unavailableDates.some((unavailableDateStr) => {
                        const unavailableDatePart = normalizeDateToString(unavailableDateStr)
                        return unavailableDatePart === dateStr
                      })
                      
                      if (isUnavailable) return true
                      
                      // Disable if there are unavailable dates between startDate and this date
                      if (hasUnavailableDateBetween(unavailableDates, startDate, date)) return true
                      
                      return false
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {/* Show suggested dates when unavailable */}
          {suggestedDates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Suggested available dates:</p>
              <Suggestions>
                {suggestedDates.map((suggestion, idx) => {
                  const suggestionStart = new Date(suggestion.startDate)
                  const suggestionEnd = new Date(suggestion.endDate)
                  
                  if (isNaN(suggestionStart.getTime()) || isNaN(suggestionEnd.getTime())) {
                    return null
                  }
                  
                  const suggestionText = `${format(suggestionStart, 'MMM dd')} - ${format(suggestionEnd, 'MMM dd')}`
                  
                  return (
                    <Suggestion
                      key={idx}
                      suggestion={suggestionText}
                      onClick={() => {
                        setStartDate(suggestionStart)
                        setEndDate(suggestionEnd)
                        setDuration(suggestion.duration)
                        preservedStartDateRef.current = suggestionStart
                        setSuggestedDates([]) // Clear suggestions after selection
                        checkDateAvailability(suggestionStart, suggestionEnd, activeThreadRef.current, false)
                      }}
                    />
                  )
                })}
              </Suggestions>
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                const today = new Date()
                const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
                const endDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000) // 3 nights
                setStartDate(tomorrow)
                setEndDate(endDate)
                // Reset to allow new package suggestions
                packagesSuggestedRef.current = false
              }}
            >
              Quick 3 Nights
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                const today = new Date()
                const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
                const endDate = new Date(nextWeek.getTime() + 5 * 24 * 60 * 60 * 1000) // 5 nights
                setStartDate(nextWeek)
                setEndDate(endDate)
                // Reset to allow new package suggestions
                packagesSuggestedRef.current = false
              }}
            >
              Next Week (5 Nights)
            </Button>
            {/* Removed Confirm Dates button - dates update automatically when user requests them */}
          </div>
        </div>
      )
    }
    
    // Default text message rendering with Message component
    return (
      <Message key={index} from={message.role}>
        <MessageContent>
          <MessageResponse>{message.content || 'No content'}</MessageResponse>
        </MessageContent>
      </Message>
    )
  }
  
  // Save booking journey to session storage
  const saveBookingJourney = () => {
    if (typeof window === 'undefined') return
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Debounce the save operation
    saveTimeoutRef.current = setTimeout(() => {
      const journeyData = {
        messages,
        selectedPackage,
        duration,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        timestamp: Date.now()
      }
      
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify(journeyData))
        // Removed excessive logging
      } catch (error) {
        console.error('Error saving booking journey:', error)
      }
    }, 1000) // Save after 1 second of inactivity
  }

  // Load booking journey from session storage
  const loadBookingJourney = () => {
    if (typeof window === 'undefined' || journeyLoadedRef.current) return
    
    try {
      const savedData = sessionStorage.getItem(sessionKey)
      if (savedData) {
        const journeyData = JSON.parse(savedData)
        const now = Date.now()
        const oneHour = 60 * 60 * 1000 // 1 hour in milliseconds
        
        // Only restore if data is less than 1 hour old
        if (now - journeyData.timestamp < oneHour) {
          journeyLoadedRef.current = true
          
          setMessages(journeyData.messages || [])
          setSelectedPackage(journeyData.selectedPackage || null)
          setDuration(journeyData.duration || 1)
          setStartDate(journeyData.startDate ? new Date(journeyData.startDate) : null)
          setEndDate(journeyData.endDate ? new Date(journeyData.endDate) : null)
          
          // Show welcome back message if we have a selected package
          if (journeyData.selectedPackage) {
            const welcomeBackMessage: Message = {
              role: 'assistant',
              content: `Welcome back! I see you were looking at the "${journeyData.selectedPackage.name}" package. Your selected dates are ${journeyData.startDate ? format(new Date(journeyData.startDate), 'MMM dd') : 'not set'} to ${journeyData.endDate ? format(new Date(journeyData.endDate), 'MMM dd, yyyy') : 'not set'}. Would you like to continue with your booking?`,
              type: 'text'
            }
            appendMessageToThread(activeThreadRef.current, welcomeBackMessage)
          }
          
          return true
        } else {
          sessionStorage.removeItem(sessionKey)
        }
      }
    } catch (error) {
      console.error('Error loading booking journey:', error)
      sessionStorage.removeItem(sessionKey)
    }
    
    return false
  }

  // Clear booking journey
  const clearBookingJourney = () => {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(sessionKey)
  }
  
  // Auto-suggest packages after date selection
  const suggestPackagesAfterDateSelection = () => {
    if (startDate && endDate) {
      const threadId = activeThreadRef.current
      const suggestionMessage: Message = {
        role: 'assistant',
        content: `Great! I see you've selected ${duration} ${duration === 1 ? 'night' : 'nights'} from ${format(startDate, 'MMM dd')} to ${format(endDate, 'MMM dd, yyyy')}. Let me find the perfect packages for your stay...`,
        type: 'text'
      }
      appendMessageToThread(threadId, suggestionMessage)
      
      // Show packages after a brief delay
      setTimeout(() => {
        showAvailablePackages(threadId)
      }, 1000)
    }
  }

  // Update duration when dates change, re-check availability, and decide when to show packages
  useEffect(() => {
    if (!startDate || !endDate) return

    const msPerDay = 1000 * 60 * 60 * 24
    const newDuration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay))
    if (newDuration !== duration) {
      setDuration(newDuration)
    }

    // Check availability without adding messages automatically (to prevent infinite loops)
    // Only check if dates have actually changed
    const lastChecked = lastCheckedDatesRef.current
    if (!lastChecked || lastChecked.start !== startDate.toISOString() || lastChecked.end !== endDate.toISOString()) {
      // Check availability when dates change
      // If dates are unavailable, show suggestions (addMessage = true)
      // This ensures users see alternative dates when they select unavailable dates
      checkDateAvailability(startDate, endDate, activeThreadRef.current, true)
    }

    if (packagesSuggestedRef.current) {
      return
    }

    if (latestEstimate && latestEstimate.fromDate && latestEstimate.toDate) {
      const estimateFrom = new Date(latestEstimate.fromDate)
      const estimateTo = new Date(latestEstimate.toDate)
      const isFromEstimate =
        startDate.getTime() === estimateFrom.getTime() && endDate.getTime() === estimateTo.getTime()

      if (isFromEstimate && messages.length > 0) {
        packagesSuggestedRef.current = true
        const threadId = activeThreadRef.current
        setTimeout(() => {
          if (activeThreadRef.current !== threadId) {
            return
          }
          const welcomeBackMessage: Message = {
            role: 'assistant',
            content: `I've loaded your previous booking for ${newDuration} ${
              newDuration === 1 ? 'night' : 'nights'
            } from ${format(startDate, 'MMM dd')} to ${format(
              endDate,
              'MMM dd, yyyy',
            )}. Here are the available packages for your stay:`,
            type: 'text',
          }
          appendMessageToThread(threadId, welcomeBackMessage)

          setTimeout(() => {
            showAvailablePackages(threadId)
          }, 500)
        }, 1000)
        return
      }
    }

    packagesSuggestedRef.current = true
    suggestPackagesAfterDateSelection()
  }, [startDate, endDate, latestEstimate, duration]) // Removed messages.length to prevent infinite loop

  useEffect(() => {
    if (typeof window === 'undefined') return

    const key = `ai:estimateHistory:${postId}_${currentUser?.id || 'guest'}`
    historyKeyRef.current = key

    try {
      const existing: any[] = JSON.parse(window.localStorage.getItem(key) ?? '[]')
      window.dispatchEvent(
        new CustomEvent('aiHistoryUpdate', {
          detail: { key, history: existing },
        }),
      )
    } catch {
      // ignore parse errors
    }

    return () => {
      if (historyKeyRef.current === key) {
        historyKeyRef.current = null
      }
    }
  }, [postId, currentUser?.id])
  
  return (
    <Card className={cn("w-full max-w-2xl mx-auto", className)}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle>AI Booking Assistant</CardTitle>
          </div>
          {messages.length > 1 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                clearBookingJourney()
                setMessages([{
                  role: 'assistant',
                  content: `Hi! I'm here to help you book ${postTitle}. I can help you find the perfect dates, recommend packages based on your needs, and handle your booking. What would you like to know?`,
                  type: 'text'
                }])
                setSelectedPackage(null)
                setStartDate(null)
                setEndDate(null)
                setDuration(1)
                setBookingError(null)
                // Reset refs to allow new package suggestions
                packagesSuggestedRef.current = false
                estimateLoadedRef.current = false
                journeyLoadedRef.current = false
              }}
              className="text-xs"
            >
              Start Over
            </Button>
          )}
        </div>
        <CardDescription>
          Get personalized recommendations and book your perfect stay
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-0">
        <Conversation className="h-[400px]">
          <ConversationContent className="p-4">
            <QuickActions 
              onAction={handleQuickAction} 
              hasDates={!!(startDate && endDate)}
              suggestedDates={suggestedDates}
            />
            
            <div className="space-y-4">
              {messages.map((message, index) => {
                const checkpoint = checkpoints.find(cp => cp.messageIndex === index)
                return (
                  <React.Fragment key={index}>
                    {renderMessage(message, index)}
                    {checkpoint && (
                      <Checkpoint>
                        <CheckpointIcon />
                        <CheckpointTrigger
                          onClick={() => restoreToCheckpoint(checkpoint)}
                        >
                          Restore to estimate checkpoint
                        </CheckpointTrigger>
                      </Checkpoint>
                    )}
                  </React.Fragment>
                )
              })}
              
              {isLoading && (
                <div className="flex w-fit max-w-[85%] rounded-lg bg-muted px-4 py-2 items-center justify-center">
                  <Loader size={16} />
                </div>
              )}
            </div>
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        
        <div className="border-t p-4">
          {!isLoggedIn && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 mb-2">
                To use the AI assistant and complete bookings, please log in.
              </p>
              <Button size="sm" asChild>
                <a href="/login">Log In</a>
              </Button>
            </div>
          )}
          
          {selectedPackage && (
            <PackageDisplay
              packageData={{
                name: selectedPackage.name,
                description: selectedPackage.description,
                features: selectedPackage.features,
                category: selectedPackage.category,
                minNights: selectedPackage.minNights,
                maxNights: selectedPackage.maxNights,
                baseRate: selectedPackage.baseRate,
                multiplier: selectedPackage.multiplier
              }}
              duration={duration}
              baseRate={baseRate}
              startDate={startDate}
              endDate={endDate}
              variant="estimate"
              className="mb-4"
              isCheckingAvailability={isCheckingAvailability}
              areDatesAvailable={areDatesAvailable}
              isBooking={isBooking}
              bookingError={bookingError}
              isLoggedIn={isLoggedIn}
              onBooking={handleBooking}
              onGoToEstimate={handleGoToEstimate}
              isCreatingEstimate={isCreatingEstimate}
              total={selectedPackageTotal ?? undefined}
            />
          )}
          
          <PromptInput 
            onSubmit={handlePromptSubmit} 
            className="mt-4"
          >
            <PromptInputBody>
              <PromptInputTextarea
                ref={textareaRef}
                value={input}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                placeholder={
                  isListening 
                    ? "I'm listening..." 
                    : isLoggedIn 
                      ? "Ask me anything about booking..."
                      : "Ask about packages (log in for full AI assistance)..."
                }
                disabled={isLoading || isListening || !isLoggedIn}
                className="pr-12"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputSpeechButton
                  onTranscriptionChange={(text: string) => {
                    setInput(text)
                    finalTranscriptRef.current = text
                  }}
                  textareaRef={textareaRef}
                />
              </PromptInputTools>
              <PromptInputSubmit 
                status={isLoading ? 'streaming' : 'ready'} 
                disabled={!input.trim() || isListening || !isLoggedIn} 
              />
            </PromptInputFooter>
          </PromptInput>
          {micError && <p className="text-sm text-destructive mt-2">{micError}</p>}
          {suggestedDates.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Suggested dates:</p>
              <Suggestions>
                {suggestedDates.map((suggestion, idx) => {
                  const suggestionStart = new Date(suggestion.startDate)
                  const suggestionEnd = new Date(suggestion.endDate)
                  
                  if (isNaN(suggestionStart.getTime()) || isNaN(suggestionEnd.getTime())) {
                    return null
                  }
                  
                  const suggestionText = `${format(suggestionStart, 'MMM dd')} - ${format(suggestionEnd, 'MMM dd')}`
                  
                  return (
                    <Suggestion
                      key={idx}
                      suggestion={suggestionText}
                      onClick={() => {
                        setStartDate(suggestionStart)
                        setEndDate(suggestionEnd)
                        setDuration(suggestion.duration)
                        preservedStartDateRef.current = suggestionStart
                        setSuggestedDates([]) // Clear suggestions after selection
                        checkDateAvailability(suggestionStart, suggestionEnd, activeThreadRef.current, false)
                      }}
                    />
                  )
                })}
              </Suggestions>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 
