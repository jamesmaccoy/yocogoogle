// app/(frontend)/booking-confirmation/page.tsx
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

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

  // If payment was successful and we have an estimate ID, confirm estimate and create booking
  if (success && estimateId) {
    try {
      console.log('Processing payment success callback:', { estimateId, postId, startDate, endDate, duration })
      
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
          postId: estimate.post ? (typeof estimate.post === 'string' ? estimate.post : estimate.post.id) : null,
          fromDate: estimate.fromDate,
          toDate: estimate.toDate
        })

        if (isCustomerMatch) {
          // Confirm the estimate
          await payload.update({
            collection: 'estimates',
            id: estimateId,
            data: {
              paymentStatus: 'paid',
            },
          })
          console.log('✅ Estimate confirmed')

          // Determine which data to use for booking creation
          const bookingPostId = postId || (estimate.post ? (typeof estimate.post === 'string' ? estimate.post : estimate.post.id) : null)
          const bookingFromDate = startDate || estimate.fromDate
          const bookingToDate = endDate || estimate.toDate
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
              try {
                const post = await payload.findByID({
                  collection: 'posts',
                  id: bookingPostId,
                })
                postTitle = post?.title || 'Booking'
              } catch (error) {
                console.warn('Could not fetch post title, using default:', error)
              }

              console.log('Creating booking with data:', {
                title: postTitle,
                post: bookingPostId,
                fromDate: bookingFromDate,
                toDate: bookingToDate,
                total: bookingTotal,
                customer: user.id
              })

              try {
                const booking = await payload.create({
                  collection: 'bookings',
                  data: {
                    title: postTitle,
                    post: bookingPostId, // Use 'post' not 'postId' for the relationship
                    fromDate: bookingFromDate,
                    toDate: bookingToDate,
                    total: bookingTotal, // Required field
                    paymentStatus: 'paid',
                    customer: user.id,
                  },
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

  // Get the most recent booking for this user
  const bookings = await payload.find({
    collection: 'bookings',
    where: {
      customer: { equals: user.id }
    },
    sort: '-createdAt',
    limit: 1,
  })

  const booking = bookings.docs[0]
  
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
  
  return (
    <div className="container py-10">
      <div className="max-w-2xl mx-auto">
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