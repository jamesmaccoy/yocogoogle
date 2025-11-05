'use client'

import React, { useEffect, useState } from 'react'
import { useUserContext } from '@/context/UserContext'
import { useYoco } from '@/providers/Yoco'
import { useSubscription } from '@/hooks/useSubscription'
import { yocoService, YocoProduct } from '@/lib/yocoService'
import { useRouter } from 'next/navigation'
import { getZARPriceFromRevenueCatProduct, getDualCurrencyPrice } from '@/lib/currency'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export default function SubscribePage() {
  const router = useRouter()
  const { currentUser } = useUserContext()
  const { customerInfo, isInitialized } = useYoco()
  const { isSubscribed, isLoading } = useSubscription()
  const [offerings, setOfferings] = useState<YocoProduct[]>([])
  const [loadingOfferings, setLoadingOfferings] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showProEntitlements, setShowProEntitlements] = useState(false)

  useEffect(() => {
    if (isInitialized) {
      loadOfferings()
    }
  }, [isInitialized])

  useEffect(() => {
    if (!isLoading && isSubscribed) {
      console.log('User already subscribed, redirecting to /bookings from useEffect.')
      router.push('/bookings')
    }
  }, [isLoading, isSubscribed, router])

  const loadOfferings = async () => {
    setLoadingOfferings(true)
    try {
      const purchases = await Purchases.getSharedInstance()
      const fetchedOfferings = await purchases.getOfferings()
      if (fetchedOfferings.all) {
        setOfferings(Object.values(fetchedOfferings.all))
      } else {
        console.warn("No current offering or packages found.")
        setOfferings([])
      }
    } catch (err) {
      console.error('Error loading offerings:', err)
      setError('Failed to load subscription offerings: ' + (err instanceof Error ? err.message : JSON.stringify(err)))
    } finally {
      setLoadingOfferings(false)
    }
  }

  const handlePurchase = async (pkg: Package) => {
    if (!currentUser) {
      router.push(`/login?redirect=/subscribe&packageId=${pkg.identifier}`)
      return
    }
    try {
      setError(null)
      const purchases = await Purchases.getSharedInstance()
      await purchases.purchase({
        rcPackage: pkg
      })
      
      // Smart redirect based on package type
      if (pkg.identifier === '$rc_weekly') {
        // Virtual wine package grants standard entitlement
        router.push('/bookings')
      } else if (pkg.identifier === '$rc_six_month') {
        // Professional plan grants admin entitlement
        router.push('/admin')
      } else {
        // Default for other packages (monthly/annual subscriptions)
        router.push('/bookings')
      }
    } catch (purchaseError) {
      const rcError = purchaseError as PurchasesError
      console.error('RevenueCat Purchase Error (Full Object):', rcError)
      console.error('RevenueCat Purchase Error Name:', rcError.name)
      console.error('RevenueCat Purchase Error Message:', rcError.message)

      let isCancelled = false
      try {
        if (rcError && typeof rcError === 'object' && 'code' in rcError && (rcError as { code: unknown }).code === ErrorCode.UserCancelledError) {
          isCancelled = true
        }
      } catch (e) { /* Silently ignore if .code access fails */ }

      if (isCancelled) {
        console.log('User cancelled the purchase flow.')
        return
      }
      
      setError('Failed to complete purchase. Please try again or contact support.')
    }
  }

  // Find the correct offerings
  const adminOffering = offerings.find(offering => offering.identifier === "simpleplek_admin");
  const perNightOffering = offerings.find(offering => offering.identifier === "per_night");
  const standardOffering = offerings.find(offering => offering.identifier === "Standard");

  const monthly_subscription_plan = adminOffering?.availablePackages.find(pkg => pkg.identifier === "$rc_monthly");
  const annual_subscription_plan = adminOffering?.availablePackages.find(pkg => pkg.identifier === "$rc_annual");
  const professional_plan = adminOffering?.availablePackages.find(pkg => pkg.identifier === "$rc_six_month");
  const virtual_wine_plan = perNightOffering?.availablePackages.find(pkg => pkg.identifier === "$rc_weekly");
  
  console.log("Monthly Plan Found:", monthly_subscription_plan)
  console.log("Annual Plan Found:", annual_subscription_plan)
  console.log("Professional Plan Found:", professional_plan)
  console.log("Virtual Wine Plan Found:", virtual_wine_plan)
  console.log("Admin Offering:", adminOffering?.identifier)
  console.log("Admin Packages:", adminOffering?.availablePackages?.map(p => p.identifier))
  console.log("Standard Offering:", standardOffering?.identifier)
  console.log("Standard Packages:", standardOffering?.availablePackages?.map(p => p.identifier))
  console.log("Per Night Offering:", perNightOffering?.identifier)
  console.log("Per Night Packages:", perNightOffering?.availablePackages?.map(p => p.identifier))
  console.log("Show Pro Entitlements:", showProEntitlements)
  console.log("Virtual Wine Plan exists:", !!virtual_wine_plan)
  console.log({ monthly_subscription_plan, annual_subscription_plan, professional_plan, virtual_wine_plan });

  if (!isInitialized) {
    return <div>Please log in</div>;
  }

  return (
    <div className="container py-16 sm:py-24">
      {error && offerings.length > 0 && (
        <div className="mb-8 p-4 text-center text-sm text-destructive bg-destructive/10 rounded-md">
          <p>{error}</p>
        </div>
      )}
      <div className="mx-auto max-w-2xl text-center mb-12 sm:mb-16">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Curated Simple pleks, and access to garden community</h1>  
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
        Packages from each plek made by their hosts</p>
      </div>

      {/* Entitlement Toggle */}
      <div className="mx-auto max-w-4xl mb-8 flex justify-center">
        <div className="flex items-center space-x-4 p-4 bg-card rounded-lg border border-border">
          <Label htmlFor="entitlement-toggle" className="text-sm font-medium">
            Standard Access
          </Label>
          <Switch
            id="entitlement-toggle"
            checked={showProEntitlements}
            onCheckedChange={setShowProEntitlements}
          />
          <Label htmlFor="entitlement-toggle" className="text-sm font-medium">
            Unlock Pro Pleks
          </Label>
        </div>
      </div>



      {/* Standard Access Products */}
      {!showProEntitlements && (
        <div className="mx-auto max-w-4xl">
          {virtual_wine_plan ? (() => {
            const product = virtual_wine_plan.webBillingProduct
            const dualPrice = getDualCurrencyPrice(product)
            
            console.log('Virtual Wine Debug:', {
              isSubscribed,
              showProEntitlements,
              virtual_wine_plan: !!virtual_wine_plan,
              product: product?.displayName
            })
            
            return (
              <div className="relative rounded-2xl border border-primary p-8 shadow-lg max-w-2xl mx-auto">
                <div className="absolute top-0 -translate-y-1/2 transform rounded-full bg-primary px-3 py-1 text-xs font-semibold tracking-wide text-primary-foreground">
                  Standard Plan
                </div>
                <h2 className="text-2xl font-semibold leading-8 text-foreground text-center">{product.displayName}</h2>
                <p className="mt-4 text-lg leading-6 text-muted-foreground text-center">{product.description || 'Weekly virtual wine tasting experience.'}</p>
                <div className="mt-8 text-center">
                  <p className="flex items-baseline gap-x-1 justify-center">
                    <span className="text-5xl font-bold tracking-tight text-foreground">{dualPrice.zar}</span>
                    <span className="text-lg font-semibold leading-6 text-muted-foreground">/week</span>
                  </p>
                  <p className="text-lg text-muted-foreground mt-2">
                    {dualPrice.usd} USD
                  </p>
                </div>
                <ul role="list" className="mt-10 space-y-4 text-base leading-6 text-muted-foreground">
                  <li className="flex gap-x-3 items-center">
                    <span className="text-primary text-xl">🧘</span>
                    <span>Masterclass including Booking access for a week</span>
                  </li>
                  <li className="flex gap-x-3 items-center">
                    <span className="text-primary text-xl">🥂</span>
                    <span>Wine tasting experience in spontaneous pop ups in extravogent locations</span>
                  </li>
                  <li className="flex gap-x-3 items-center">
                    <span className="text-primary text-xl">🎯</span>
                    <span>A weekly bottle of Curated selection of the capes finest wines</span>
                  </li>
                  <li className="flex gap-x-3 items-center">
                    <span className="text-primary text-xl">📝</span>
                    <span>Have your order waiting for you at your plek</span>
                  </li>
                  <li className="flex gap-x-3 items-center">
                    <span className="text-primary text-xl">🍷</span>
                    <span>Weekly sessions with wine makers, and servant in their journey</span>
                  </li>
                </ul>
                
                <button
                  onClick={() => handlePurchase(virtual_wine_plan)}
                  className="mt-10 block w-full rounded-md bg-primary px-6 py-4 text-center text-lg font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-all duration-200"
                >
                  Subscribe to Simple Plek
                </button>
              </div>
            )
          })() : (
            <div className="text-center p-8">
              <p className="text-muted-foreground">Virtual wine package not found. Check console for details.</p>
              <p className="text-sm text-muted-foreground mt-2">Debug: virtual_wine_plan = {String(virtual_wine_plan)}</p>
            </div>
          )}
        </div>
      )}

      {/* Pro Entitlement Products */}
      {showProEntitlements && (
        <div className="mx-auto max-w-4xl grid grid-cols-1 gap-8 md:grid-cols-2 items-start">
          {monthly_subscription_plan && (() => {
            const product = monthly_subscription_plan.webBillingProduct
            const dualPrice = getDualCurrencyPrice(product)
            return (
              <div key={monthly_subscription_plan.identifier} className="rounded-2xl border border-border p-8 shadow-sm">
                <h2 className="text-lg font-semibold leading-8 text-foreground">{product.displayName}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description || 'Access all standard features.'}</p>
                <p className="mt-6 flex items-baseline gap-x-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">{dualPrice.zar}</span>
                  <span className="text-sm font-semibold leading-6 text-muted-foreground">/month</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {dualPrice.usd} USD
                </p>
                <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground xl:mt-10">
                  <li className="flex gap-x-3">🧘‍♂️ Monthly Yoga deck</li>
                  <li className="flex gap-x-3">CID greening initiative</li>
                  <li className="flex gap-x-3">Unlock Month to month packages</li>
                </ul>
                <button
                  onClick={() => handlePurchase(monthly_subscription_plan)}
                  className="mt-8 block w-full rounded-md bg-secondary px-3.5 py-2.5 text-center text-sm font-semibold text-secondary-foreground shadow-sm hover:bg-secondary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Subscribe to simple plek
                </button>
              </div>
            )
          })()}

          {annual_subscription_plan && (() => {
            const product = annual_subscription_plan.webBillingProduct
            const dualPrice = getDualCurrencyPrice(product)
            return (
              <div key={annual_subscription_plan.identifier} className="relative rounded-2xl border border-primary p-8 shadow-lg">
                <div className="absolute top-0 -translate-y-1/2 transform rounded-full bg-primary px-3 py-1 text-xs font-semibold tracking-wide text-primary-foreground">
                   Pro - Save 20%
                </div>
                <h2 className="text-lg font-semibold leading-8 text-foreground">{product.displayName}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description || 'Get the best value with annual billing.'}</p>
                <p className="mt-6 flex items-baseline gap-x-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">{dualPrice.zar}</span>
                  <span className="text-sm font-semibold leading-6 text-muted-foreground">/year</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {dualPrice.usd} USD
                </p>
                <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground xl:mt-10">
                  <li className="flex gap-x-3">Hourly Studio - 🍤 Hosted all inclusive packages</li>
                  <li className="flex gap-x-3">CID greening initiative</li>
                  <li className="flex gap-x-3">unlock all packages</li>
                  <li className="flex gap-x-3">1 year access to Simple plek garden community</li>
                </ul>
                <button
                  onClick={() => handlePurchase(annual_subscription_plan)}
                  className="mt-8 block w-full rounded-md bg-primary px-3.5 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Unlock Now - Save
                </button>
              </div>
            )
          })()}
        </div>
      )}

      {/* Professional Plan - Always visible but styled differently for Pro */}
      {showProEntitlements && professional_plan && (() => {
        const product = professional_plan.webBillingProduct;
        const dualPrice = getDualCurrencyPrice(product);
        return (
          <div 
            className="mt-16 pt-16 pb-16 md:border-t border-border bg-cover bg-center relative rounded-lg shadow-md"
            style={{ backgroundImage: `url('https://www.simpleplek.co.za/api/media/file/gardencommunity%20(3).jpg')` }}
          >
            <div className="absolute inset-0 bg-black/30 rounded-lg"></div> 

            <div className="relative max-w-4xl mx-auto px-4 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12"> 
              
              <div className="text-center lg:text-left text-white">
                 <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Host a masterclass at our Plek</h2>
                 <p className="mt-4 text-lg leading-8 text-muted-foreground">Manage packages using our sugegsted packages with capped pricing</p>
              </div>

              <div className="w-full max-w-md">
                <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
                  <h3 className="text-lg font-semibold leading-8 text-foreground">{product.displayName}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description || 'Advanced features for professionals.'}</p>
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl font-bold tracking-tight text-foreground">{dualPrice.zar}</span>
                    <span className="text-sm font-semibold leading-6 text-muted-foreground">/bi-annual</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {dualPrice.usd} USD
                  </p>
                  <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground xl:mt-10">
                    <li className="flex gap-x-3">Share your plek booking with guests</li>
                    <li className="flex gap-x-3">Suggested capped pricing for your packages</li>
                    <li className="flex gap-x-3">Reoccuring payments for your masterclass</li>
                    <li className="flex gap-x-3">Join the network of simple pleks and their masterclass community</li>
                  </ul>
                  <button
                    onClick={() => handlePurchase(professional_plan)}
                    className="mt-8 block w-full rounded-md bg-secondary px-3.5 py-2.5 text-center text-sm font-semibold text-secondary-foreground shadow-sm hover:bg-secondary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Host a plek
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}