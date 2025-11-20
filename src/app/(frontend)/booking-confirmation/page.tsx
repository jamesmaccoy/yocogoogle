// app/(frontend)/booking-confirmation/page.tsx
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { DivineLightEffect } from '@/components/DivineLightEffect'
import { Package } from 'lucide-react'

export default async function BookingConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  
  // Get the current user
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  
  if (!user) {
    redirect('/login')
  }

  // Handle payment success callback - create booking if estimate ID is provided
  const success = resolvedSearchParams.success === 'true'
  const estimateId = typeof resolvedSearchParams.estimateId === 'string' ? resolvedSearchParams.estimateId : null
  const postId = typeof resolvedSearchParams.postId === 'string' ? resolvedSearchParams.postId : null
  const duration = typeof resolvedSearchParams.duration === 'string' ? Number(resolvedSearchParams.duration) : null
  const startDate = typeof resolvedSearchParams.startDate === 'string' ? resolvedSearchParams.startDate : null
  const endDate = typeof resolvedSearchParams.endDate === 'string' ? resolvedSearchParams.endDate : null
  const transactionId = typeof resolvedSearchParams.transactionId === 'string' ? resolvedSearchParams.transactionId : null
  const intentParam = typeof resolvedSearchParams.intent === 'string' ? resolvedSearchParams.intent : null
  const isSubscriptionIntent = intentParam === 'subscription'

  let activatedSubscription: {
    packageName: string
    amount: number | null
    currency: string
    plan: string
    expiresAt: string | null
  } | null = null

  if (success && transactionId) {
    try {
      const transaction = await payload.findByID({
        collection: 'yoco-transactions',
        id: transactionId,
      })

      if (transaction) {
        const transactionUserId =
          typeof transaction.user === 'string' ? transaction.user : transaction.user?.id

        if (transactionUserId === user.id) {
          const now = new Date()
          const periodDays =
            typeof transaction.periodDays === 'number' && transaction.periodDays > 0
              ? transaction.periodDays
              : typeof resolvedSearchParams.periodDays === 'string'
              ? Number(resolvedSearchParams.periodDays)
              : null
          const expiresAtDate =
            transaction.expiresAt && new Date(transaction.expiresAt) > now
              ? new Date(transaction.expiresAt)
              : periodDays
              ? new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000)
              : null

          const updateData: Record<string, unknown> = {
            status: 'completed',
            completedAt: now.toISOString(),
          }
          if (expiresAtDate) {
            updateData.expiresAt = expiresAtDate.toISOString()
          }

          if (transaction.status !== 'completed') {
            await payload.update({
              collection: 'yoco-transactions',
              id: transactionId,
              data: updateData,
            })
          }

          // Link addon transactions to bookings
          if (transaction.intent === 'product' && transaction.metadata && typeof transaction.metadata === 'object') {
            const metadata = transaction.metadata as Record<string, unknown>
            const bookingId = metadata.bookingId as string | undefined
            
            if (bookingId) {
              try {
                // Find the booking
                const booking = await payload.findByID({
                  collection: 'bookings',
                  id: bookingId,
                })
                
                if (booking) {
                  // Add this transaction to the booking's addonTransactions
                  const existingAddons = Array.isArray(booking.addonTransactions) 
                    ? booking.addonTransactions.map((t: any) => typeof t === 'string' ? t : t.id)
                    : []
                  
                  if (!existingAddons.includes(transactionId)) {
                    await payload.update({
                      collection: 'bookings',
                      id: bookingId,
                      data: {
                        addonTransactions: [...existingAddons, transactionId],
                      },
                    })
                    console.log(`✅ Linked addon transaction ${transactionId} to booking ${bookingId}`)
                  }
                }
              } catch (error) {
                console.error('Error linking addon transaction to booking:', error)
              }
            }
          }

          if (transaction.intent === 'subscription') {
            // Map transaction plan/entitlement to valid user plan types (pro, free, basic, enterprise)
            const transactionPlan = transaction.plan || (transaction.entitlement === 'pro' ? 'pro' : 'free')
            const userPlan = transactionPlan === 'pro' ? 'pro' : 'free' // Map standard/none to free
            
            await payload.update({
              collection: 'users',
              id: transactionUserId,
              data: {
                subscriptionStatus: {
                  status: 'active',
                  plan: userPlan,
                  expiresAt: expiresAtDate ? expiresAtDate.toISOString() : undefined,
                },
              },
            })

            if (payload.jobs && typeof (payload.jobs as any).queue === 'function') {
              await (payload.jobs as any).queue({
                task: 'handleSubscriptionEvent',
                queue: 'subscription-events',
                input: {
                  event: 'RENEWED',
                  userId: transactionUserId,
                  subscriptionId: transactionId,
                  plan: userPlan,
                  entitlement: transaction.entitlement || 'standard',
                  expiresAt: expiresAtDate ? expiresAtDate.toISOString() : undefined,
                },
              })
            }

            activatedSubscription = {
              packageName: transaction.packageName || 'Member Subscription',
              amount: typeof transaction.amount === 'number' ? transaction.amount : null,
              currency: transaction.currency || 'ZAR',
              plan: userPlan,
              expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error finalizing transaction:', error)
    }
  }

  // If payment was successful and we have an estimate ID, confirm estimate and create booking
  if (success && estimateId && !isSubscriptionIntent) {
    try {
      console.log('Processing payment success callback:', { estimateId, postId, startDate, endDate, duration, transactionId })
      
      // Validate that a real transaction occurred (not mock/bypassed)
      let transactionValidated = false
      if (transactionId) {
        try {
          const transaction = await payload.findByID({
            collection: 'yoco-transactions',
            id: transactionId,
          })
          
          if (transaction) {
            // Check if transaction is actually completed and not mock
            const isMock = transaction.id?.toString().startsWith('mock-')
            const isCompleted = transaction.status === 'completed'
            
            if (isMock) {
              console.warn('⚠️ Mock transaction detected - payment not actually processed!')
              // In production, reject mock transactions
              if (process.env.NODE_ENV === 'production') {
                console.error('❌ Production environment detected - rejecting mock transaction')
                return (
                  <div className="container py-10">
                    <div className="max-w-2xl mx-auto text-center">
                      <h1 className="text-4xl font-bold mb-4 text-red-600">Payment Error</h1>
                      <p className="text-muted-foreground mb-8">
                        Payment validation failed. Please contact support if you believe this is an error.
                      </p>
                      <Link href="/bookings" passHref>
                        <Button>View Bookings</Button>
                      </Link>
                    </div>
                  </div>
                )
              }
            }
            
            transactionValidated = isCompleted && !isMock
            console.log('Transaction validation:', { transactionId, isMock, isCompleted, transactionValidated })
          } else {
            console.warn('Transaction not found:', transactionId)
          }
        } catch (error) {
          console.warn('Could not validate transaction:', error)
          // In production, require transaction validation
          if (process.env.NODE_ENV === 'production') {
            console.error('❌ Production environment - transaction validation required')
            return (
              <div className="container py-10">
                <div className="max-w-2xl mx-auto text-center">
                  <h1 className="text-4xl font-bold mb-4 text-red-600">Payment Validation Error</h1>
                  <p className="text-muted-foreground mb-8">
                    Unable to validate payment. Please contact support.
                  </p>
                  <Link href="/bookings" passHref>
                    <Button>View Bookings</Button>
                  </Link>
                </div>
              </div>
            )
          }
        }
      } else {
        // In production, require transactionId
        if (process.env.NODE_ENV === 'production') {
          console.error('❌ Production environment - transactionId required')
          return (
            <div className="container py-10">
              <div className="max-w-2xl mx-auto text-center">
                <h1 className="text-4xl font-bold mb-4 text-red-600">Payment Error</h1>
                <p className="text-muted-foreground mb-8">
                  Payment transaction ID missing. Please contact support.
                </p>
                <Link href="/bookings" passHref>
                  <Button>View Bookings</Button>
                </Link>
              </div>
            </div>
          )
        }
      }
      
      // Get the estimate
      const estimate = await payload.findByID({
        collection: 'estimates',
        id: estimateId,
      })

      if (!estimate) {
        console.error('Estimate not found:', estimateId)
      } else {
        // Check if customer matches (handle both string ID and relationship object)
        const estimateCustomerId = typeof estimate.customer === 'string' ? estimate.customer : estimate.customer?.id
        const isCustomerMatch = estimateCustomerId === user.id

        console.log('Estimate found:', {
          estimateId: estimate.id,
          estimateCustomerId,
          userId: user.id,
          isCustomerMatch,
          transactionValidated,
          postId: estimate.post ? (typeof estimate.post === 'string' ? estimate.post : estimate.post.id) : null,
          fromDate: estimate.fromDate,
          toDate: estimate.toDate
        })

        if (isCustomerMatch) {
          // Only confirm estimate if transaction is validated (or in development with mock)
          if (transactionValidated || (process.env.NODE_ENV !== 'production' && transactionId)) {
            // Confirm the estimate
            await payload.update({
              collection: 'estimates',
              id: estimateId,
              data: {
                paymentStatus: 'paid',
              },
            })
            console.log('✅ Estimate confirmed')
          } else {
            console.warn('⚠️ Estimate not confirmed - transaction not validated')
          }

          // Determine which data to use for booking creation
          const bookingPostId = postId || (estimate.post ? (typeof estimate.post === 'string' ? estimate.post : estimate.post.id) : null)
          let bookingFromDate = startDate || estimate.fromDate
          let bookingToDate = endDate || estimate.toDate
          
          // Ensure dates are in correct order (fromDate must be before toDate)
          const fromDateObj = new Date(bookingFromDate)
          const toDateObj = new Date(bookingToDate)
          
          // Validate dates are valid
          if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
            throw new Error(`Invalid date format: fromDate=${bookingFromDate}, toDate=${bookingToDate}`)
          }
          
          // If dates are swapped, fix them
          if (fromDateObj > toDateObj) {
            console.warn('⚠️ Dates are swapped - fixing order:', {
              originalFromDate: bookingFromDate,
              originalToDate: bookingToDate,
            })
            // Swap the dates
            const temp = bookingFromDate
            bookingFromDate = bookingToDate
            bookingToDate = temp
            console.log('✅ Dates corrected:', {
              correctedFromDate: bookingFromDate,
              correctedToDate: bookingToDate,
            })
          }
          
          // Final validation: ensure fromDate is still before toDate after correction
          const finalFromDate = new Date(bookingFromDate)
          const finalToDate = new Date(bookingToDate)
          if (finalFromDate >= finalToDate) {
            throw new Error(`Invalid date range: fromDate (${bookingFromDate}) must be before toDate (${bookingToDate})`)
          }
          const bookingTotal = estimate.total || 0

          if (bookingPostId && bookingFromDate && bookingToDate) {
            // Format dates to 'yyyy-MM-dd' format for consistent comparison
            // This matches how dates are formatted in checkAvailabilityHook
            const formattedFromDate = format(new Date(bookingFromDate), 'yyyy-MM-dd')
            const formattedToDate = format(new Date(bookingToDate), 'yyyy-MM-dd')
            
            // Check if a booking already exists for this estimate (prevent duplicates)
            // Query for bookings that overlap with the same date range
            // Since dates are stored with time components, we check for overlaps at the day level
            const existingBookings = await payload.find({
              collection: 'bookings',
              where: {
                and: [
                  { customer: { equals: user.id } },
                  { post: { equals: bookingPostId } },
                  // Check if existing booking's fromDate is on or before our toDate
                  // and existing booking's toDate is on or after our fromDate
                  // This finds bookings that overlap with our date range
                  { fromDate: { less_than_equal: formattedToDate } },
                  { toDate: { greater_than_equal: formattedFromDate } },
                ],
              },
              limit: 1,
            })

            if (existingBookings.docs.length > 0 && existingBookings.docs[0]) {
              console.log('✅ Booking already exists for this estimate:', existingBookings.docs[0].id)
            } else {
              // Get the post to get its title for the booking title
              let postTitle = 'Booking'
              let postData: any = null
              try {
                postData = await payload.findByID({
                  collection: 'posts',
                  id: bookingPostId,
                  depth: 1,
                })
                postTitle = postData?.title || 'Booking'
              } catch (error) {
                console.warn('Could not fetch post title, using default:', error)
              }

              // Get package information from estimate
              const estimatePackageType = estimate.packageType || null
              const estimateSelectedPackage = estimate.selectedPackage || null

              // Resolve package information and custom name
              let resolvedSelectedPackage = estimateSelectedPackage
              let resolvedPackageType = estimatePackageType

              if (estimatePackageType && postData) {
                try {
                  // Get database packages for this post
                  const dbPackages = await payload.find({
                    collection: 'packages',
                    where: {
                      post: { equals: bookingPostId },
                      isEnabled: { equals: true }
                    },
                    depth: 1,
                  })

                  // Find the package that matches the packageType (by id, revenueCatId, or yocoId)
                  const code = estimatePackageType.toLowerCase()
                  const matchedDbPackage = dbPackages.docs.find((pkg: any) => {
                    const pkgId = pkg.id?.toString().toLowerCase()
                    const revenueCatId = pkg.revenueCatId?.toString().toLowerCase()
                    const yocoId = (pkg.yocoId || pkg.revenueCatId)?.toString().toLowerCase()
                    return pkgId === code || revenueCatId === code || yocoId === code
                  })

                  if (matchedDbPackage) {
                    // Use the matched database package's ID
                    resolvedPackageType = matchedDbPackage.id
                    
                    // Get custom name from packageSettings
                    let customName: string | null = null
                    if (postData.packageSettings && Array.isArray(postData.packageSettings)) {
                      const packageSetting = postData.packageSettings.find((setting: any) => {
                        const settingPackageId = typeof setting.package === 'object' ? setting.package.id : setting.package
                        return settingPackageId === matchedDbPackage.id
                      })
                      customName = packageSetting?.customName || null
                    }

                    // Build resolved selectedPackage with database package relationship
                    resolvedSelectedPackage = {
                      package: matchedDbPackage.id,
                      customName: customName || null,
                      enabled: true,
                    }
                  } else {
                    // Package not found in database - might be a Yoco product
                    // Check packageSettings for custom name by matching the packageType directly
                    if (postData.packageSettings && Array.isArray(postData.packageSettings)) {
                      const packageSetting = postData.packageSettings.find((setting: any) => {
                        const settingPackageId = typeof setting.package === 'object' ? setting.package.id : setting.package
                        const settingRevenueCatId = typeof setting.package === 'object' ? setting.package.revenueCatId : null
                        const settingYocoId = typeof setting.package === 'object' ? (setting.package.yocoId || setting.package.revenueCatId) : null
                        return (
                          settingPackageId?.toString().toLowerCase() === code ||
                          settingRevenueCatId?.toString().toLowerCase() === code ||
                          settingYocoId?.toString().toLowerCase() === code
                        )
                      })
                      
                      if (packageSetting?.customName) {
                        // We have a custom name but no database package - store minimal selectedPackage
                        resolvedSelectedPackage = {
                          enabled: true,
                          customName: packageSetting.customName,
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn('Could not resolve package information:', error)
                  // Fall back to estimate's selectedPackage if available
                  if (!resolvedSelectedPackage && estimateSelectedPackage) {
                    resolvedSelectedPackage = estimateSelectedPackage
                  }
                }
              }

              // Normalize dates to midnight UTC to ensure consistent date-only storage
              // Extract date part and create new date at midnight UTC
              const fromDateObj = new Date(bookingFromDate)
              const toDateObj = new Date(bookingToDate)
              
              const fromDateStr = fromDateObj.toISOString().split('T')[0]
              const toDateStr = toDateObj.toISOString().split('T')[0]
              
              // Create dates at midnight UTC for consistent storage
              const normalizedFromDate = new Date(fromDateStr + 'T00:00:00.000Z')
              const normalizedToDate = new Date(toDateStr + 'T00:00:00.000Z')

              console.log('Creating booking with data:', {
                title: postTitle,
                post: bookingPostId,
                fromDate: normalizedFromDate.toISOString(),
                toDate: normalizedToDate.toISOString(),
                total: bookingTotal,
                customer: user.id,
                packageType: resolvedPackageType || estimatePackageType,
                selectedPackage: resolvedSelectedPackage,
              })

              try {
                const bookingData: any = {
                  title: postTitle,
                  post: bookingPostId, // Use 'post' not 'postId' for the relationship
                  fromDate: normalizedFromDate.toISOString(),
                  toDate: normalizedToDate.toISOString(),
                  total: bookingTotal, // Required field
                  paymentStatus: 'paid',
                  customer: user.id,
                }

                // Include packageType if available (use resolved packageType which is the canonical ID)
                if (resolvedPackageType) {
                  bookingData.packageType = resolvedPackageType
                } else if (estimatePackageType) {
                  bookingData.packageType = estimatePackageType
                }

                // Include selectedPackage if available
                if (resolvedSelectedPackage) {
                  bookingData.selectedPackage = resolvedSelectedPackage
                }

                const booking = await payload.create({
                  collection: 'bookings',
                  data: bookingData,
                })
                console.log('✅ Booking created successfully:', booking.id)
              } catch (bookingError) {
                console.error('❌ Failed to create booking:', bookingError)
                if (bookingError instanceof Error) {
                  console.error('Error details:', {
                    message: bookingError.message,
                    stack: bookingError.stack
                  })
                }
                throw bookingError // Re-throw to be caught by outer catch
              }
            }
          } else {
            console.error('❌ Missing required booking data:', {
              postId: bookingPostId,
              fromDate: bookingFromDate,
              toDate: bookingToDate
            })
          }
        } else {
          console.error('❌ Customer ID mismatch:', {
            estimateCustomerId,
            userId: user.id
          })
        }
      }
    } catch (error) {
      console.error('❌ Error processing payment success:', error)
      if (error instanceof Error) {
        console.error('Error stack:', error.stack)
      }
      // Continue to show confirmation page even if booking creation fails
    }
  }

  if (activatedSubscription && success && isSubscriptionIntent) {
    const formattedAmount =
      activatedSubscription.amount !== null
        ? `${activatedSubscription.currency} ${activatedSubscription.amount.toFixed(2)}`
        : '—'
    return (
      <div className="container py-16">
        <div className="mx-auto max-w-2xl text-center space-y-8">
          <div className="relative mx-auto max-w-xl">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary via-purple-500 to-primary opacity-75 blur-lg animate-pulse" />
            <div className="relative rounded-3xl border border-primary/40 bg-card p-10 shadow-xl">
              <h1 className="text-4xl font-extrabold tracking-tight mb-2">Membership Activated</h1>
              <p className="text-muted-foreground mb-8">
                Welcome to the Simple Plek community. Your member subscription is now live.
              </p>
              <div className="space-y-4 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Membership</span>
                  <span className="font-semibold">{activatedSubscription.packageName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-semibold capitalize">{activatedSubscription.plan}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Billing</span>
                  <span className="font-semibold">{formattedAmount} / month</span>
                </div>
                {activatedSubscription.expiresAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Renews on</span>
                    <span className="font-semibold">
                      {new Date(activatedSubscription.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/bookings" passHref>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Explore Calendar
              </Button>
            </Link>
            <Link href="/account" passHref>
              <Button variant="outline">Manage Membership</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Get the most recent booking for this user with package information
  const bookings = await payload.find({
    collection: 'bookings',
    where: {
      customer: { equals: user.id }
    },
    sort: '-createdAt',
    limit: 1,
    depth: 2, // Include package relationship
  })

  const booking = bookings.docs[0]

  // Resolve package information
  let packageName: string | null = null
  let packageDescription: string | null = null
  
  if (booking) {
    // Try to get package name from selectedPackage
    if (booking.selectedPackage) {
      if (typeof booking.selectedPackage.package === 'object' && booking.selectedPackage.package) {
        packageName = booking.selectedPackage.customName || booking.selectedPackage.package.name || null
        packageDescription = booking.selectedPackage.package.description || null
      } else if (booking.selectedPackage.customName) {
        packageName = booking.selectedPackage.customName
      }
    }

    // If no package name found, try to resolve from packageType
    if (!packageName && booking.packageType && booking.post) {
      try {
        const postId = typeof booking.post === 'string' ? booking.post : booking.post.id
        const postData = await payload.findByID({
          collection: 'posts',
          id: postId,
          depth: 1,
        })

        // Get database packages
        const dbPackages = await payload.find({
          collection: 'packages',
          where: {
            post: { equals: postId },
            isEnabled: { equals: true }
          },
          depth: 1,
        })

        const code = booking.packageType.toLowerCase()
        const matchedPackage = dbPackages.docs.find((pkg: any) => {
          const pkgId = pkg.id?.toString().toLowerCase()
          const revenueCatId = pkg.revenueCatId?.toString().toLowerCase()
          const yocoId = (pkg.yocoId || pkg.revenueCatId)?.toString().toLowerCase()
          return pkgId === code || revenueCatId === code || yocoId === code
        })

        if (matchedPackage) {
          // Check for custom name in packageSettings
          if (postData?.packageSettings && Array.isArray(postData.packageSettings)) {
            const packageSetting = postData.packageSettings.find((setting: any) => {
              const settingPackageId = typeof setting.package === 'object' ? setting.package.id : setting.package
              return settingPackageId === matchedPackage.id
            })
            packageName = packageSetting?.customName || matchedPackage.name
          } else {
            packageName = matchedPackage.name
          }
          packageDescription = matchedPackage.description || null
        }
      } catch (error) {
        console.warn('Could not resolve package information:', error)
      }
    }
  }
  
  // Calculate dates and duration
  let fromDate = new Date()
  let toDate = new Date()
  let bookingDurationDisplay = "N/A"
  
  if (booking?.fromDate && booking?.toDate) {
    fromDate = new Date(booking.fromDate)
    toDate = new Date(booking.toDate)
    
    // Calculate duration in days
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime())
    bookingDurationDisplay = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString()
  }
  
  // Fallback to search params if booking not found
  const bookingTotal = typeof resolvedSearchParams.total === "string" ? resolvedSearchParams.total : "N/A"
  const bookingDuration = booking ? bookingDurationDisplay : (duration !== null ? String(duration) : "N/A")
  const totalAmount = 
    !isNaN(Number(bookingTotal)) && !isNaN(Number(bookingDuration)) 
      ? Number(bookingTotal) * Number(bookingDuration) 
      : "N/A"
  
  const showSuccess = success && !isSubscriptionIntent

  return (
    <div className="container py-10 relative">
      {showSuccess && <DivineLightEffect />}
      
      <div className="max-w-2xl mx-auto relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tighter mb-4">Booking Confirmed!</h1>
          <p className="text-muted-foreground">Thank you for your booking. We&apos;re excited to host you!</p>
        </div>
        
        <div className="bg-muted p-6 rounded-lg border border-border mb-8">
          <h2 className="text-2xl font-semibold mb-4">Booking Details</h2>
          
          <div className="space-y-4">
            {booking?.id && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Booking ID</span>
                <span className="font-medium">{booking.id}</span>
              </div>
            )}
            
            {booking?.title && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Property</span>
                <span className="font-medium">{booking.title}</span>
              </div>
            )}

            {packageName && (
              <div className="flex justify-between items-start border-t pt-4 mt-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Package</span>
                </div>
                <div className="text-right">
                  <span className="font-medium">{packageName}</span>
                  {packageDescription && (
                    <p className="text-sm text-muted-foreground mt-1">{packageDescription}</p>
                  )}
                </div>
              </div>
            )}
            
            {booking?.fromDate && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Check-in Date:</span>
                <span className="font-medium">{new Date(booking.fromDate).toLocaleDateString()}</span>
              </div>
            )}
            
            {booking?.toDate && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Check-out Date:</span>
                <span className="font-medium">{new Date(booking.toDate).toLocaleDateString()}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Rate per night:</span>
              <span className="font-medium">R{bookingTotal}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-medium">{bookingDuration} nights</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total:</span>
              <span className="text-2xl font-bold">R{totalAmount}</span>
            </div>
            
            {booking?.paymentStatus && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Payment Status:</span>
                <span className="font-medium text-green-600">
                  {booking.paymentStatus === "paid" ? "Paid" : "Pending"}
                </span>
              </div>
            )}
            
            {booking?.token && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Booking Token</span>
                <span className="font-medium text-xs">{booking.token}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/bookings" passHref>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              View All Bookings
            </Button>
          </Link>
          
          <Link href="/" passHref>
            <Button variant="outline">
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}