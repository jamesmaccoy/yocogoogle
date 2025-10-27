import React from 'react'
import { Package, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'

interface PackageDisplayProps {
  packageData: {
    name: string
    description?: string | null
    features?: string[] | null
    category?: string | null
    minNights?: number | null
    maxNights?: number | null
    baseRate?: number | null
    multiplier?: number | null
  }
  customName?: string | null
  total?: number
  duration?: number
  baseRate?: number
  startDate?: Date | null
  endDate?: Date | null
  showPricing?: boolean
  showDuration?: boolean
  showCategory?: boolean
  showFeatures?: boolean
  variant?: 'booking' | 'estimate'
  className?: string
  // Estimate-specific props
  isCheckingAvailability?: boolean
  areDatesAvailable?: boolean
  isBooking?: boolean
  bookingError?: string | null
  isLoggedIn?: boolean
  onBooking?: () => void
  onGoToEstimate?: () => void
  isCreatingEstimate?: boolean
}

export const PackageDisplay: React.FC<PackageDisplayProps> = ({
  packageData,
  customName,
  total,
  duration,
  baseRate = 150,
  startDate,
  endDate,
  showPricing = true,
  showDuration = true,
  showCategory = true,
  showFeatures = true,
  variant = 'booking',
  className = '',
  // Estimate-specific props
  isCheckingAvailability = false,
  areDatesAvailable = true,
  isBooking = false,
  bookingError,
  isLoggedIn = false,
  onBooking,
  onGoToEstimate,
  isCreatingEstimate = false
}) => {
  const displayName = customName || packageData.name || 'Package'
  const calculatedTotal = total || (packageData.baseRate || baseRate) * (duration || 1) * (packageData.multiplier || 1)
  const perNightRate = packageData.baseRate || (calculatedTotal / (duration || 1))
  
  // Helper function to safely get features
  const getFeatures = () => {
    if (!packageData.features) return []
    return packageData.features.filter(feature => feature && typeof feature === 'string')
  }

  if (variant === 'estimate') {
    // Compact estimate-style display with booking functionality
    return (
      <div className={`p-3 bg-primary/5 rounded-lg border border-primary/20 ${className}`}>
        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium text-sm">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {duration} {duration === 1 ? 'night' : 'nights'} • {getFeatures().slice(0, 2).join(', ') || 'Standard package'}
            </p>
            {startDate && endDate && (
              <div className="mt-1">
                <p className="text-xs text-muted-foreground">
                  {format(startDate, 'MMM dd')} - {format(endDate, 'MMM dd, yyyy')}
                </p>
                {isCheckingAvailability ? (
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking availability...
                  </p>
                ) : !areDatesAvailable ? (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    ❌ Dates not available
                  </p>
                ) : (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    ✅ Dates available
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-primary">
              R{calculatedTotal.toFixed(0)}
            </div>
            <div className="text-xs text-muted-foreground">
              R{perNightRate.toFixed(0)}/night
            </div>
            {packageData.multiplier && packageData.multiplier !== 1 && (
              <div className="text-xs text-muted-foreground">
                {packageData.multiplier > 1 ? '+' : ''}{((packageData.multiplier - 1) * 100).toFixed(0)}% rate
              </div>
            )}
            {isLoggedIn ? (
              <Button 
                size="sm" 
                className="mt-1" 
                onClick={onBooking}
                disabled={isBooking || !startDate || !endDate || !areDatesAvailable || isCheckingAvailability}
              >
                {isBooking ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Processing...
                  </>
                ) : !startDate || !endDate ? (
                  'Select Dates'
                ) : !areDatesAvailable ? (
                  'Dates Unavailable'
                ) : isCheckingAvailability ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Book Now'
                )}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="mt-1" asChild>
                <a href="/login">Log In to Book</a>
              </Button>
            )}
            {/* Secondary action to create booking via estimate page */}
            {onGoToEstimate && (
              <Button size="sm" variant="ghost" className="mt-1 ml-2" onClick={onGoToEstimate} disabled={isCreatingEstimate}>
                {isCreatingEstimate ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Opening...
                  </>
                ) : (
                  'Share Estimate'
                )}
              </Button>
            )}
          </div>
        </div>
        {bookingError && (
          <div className="mt-2 p-2 text-xs text-destructive bg-destructive/10 rounded">
            {bookingError}
          </div>
        )}
      </div>
    )
  }

  // Detailed booking-style display
  return (
    <div className={`p-4 bg-muted/50 rounded-lg border ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">Purchased Package</h3>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-base">{displayName}</span>
          {showPricing && (
            <span className="text-sm text-muted-foreground">
              {total ? `R${total.toFixed(2)}` : 'Price not available'}
            </span>
          )}
        </div>
        
        {packageData.description && (
          <p className="text-sm text-muted-foreground">
            {packageData.description}
          </p>
        )}
        
        {showFeatures && getFeatures().length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-muted-foreground mb-2">Package Features:</p>
            <ul className="space-y-2">
              {getFeatures().map((feature: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></span>
                  <span className="text-sm text-muted-foreground">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {showCategory && packageData.category && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-medium text-muted-foreground">Category:</span>
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
              {packageData.category}
            </span>
          </div>
        )}
        
        {showDuration && (packageData.minNights || packageData.maxNights) && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs font-medium text-muted-foreground">Duration:</span>
            <span className="text-xs text-muted-foreground">
              {packageData.minNights}-{packageData.maxNights} nights
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default PackageDisplay
