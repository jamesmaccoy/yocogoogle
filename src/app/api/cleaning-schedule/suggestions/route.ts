import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

type CleaningBookingInfo = {
  id: string
  propertyTitle: string
  propertySlug: string
  propertyId: string
  fromDate: string
  toDate: string
  checkoutDate: string
  checkinDate: string
  checkoutDateISO: string
  checkinDateISO: string
  status: string
  proximityCategories: string[]
  sleepCapacity: string
  isGuestBooking: boolean
  currentPackageName?: string
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const roles = Array.isArray(user.role) ? user.role : user.role ? [user.role] : []
    const isHostOrAdmin = roles?.some((role) => role === 'host' || role === 'admin')

    if (!isHostOrAdmin) {
      return NextResponse.json({ scheduleSuggestions: [], dateSuggestions: [] })
    }

    const allBookings = await payload.find({
      collection: 'bookings',
      where: {
        paymentStatus: { equals: 'paid' },
      },
      depth: 2,
      sort: 'toDate',
      limit: 200,
    })

    const customerIds = allBookings.docs
      .map((booking: any) => (typeof booking.customer === 'object' ? booking.customer?.id : booking.customer))
      .filter(Boolean) as string[]

    const guestTransactions =
      customerIds.length > 0
        ? await payload.find({
            collection: 'yoco-transactions',
            where: {
              user: { in: customerIds },
              intent: { equals: 'booking' },
              status: { equals: 'completed' },
            },
            limit: 1000,
          })
        : { docs: [] }

    const guestTransactionUserIds = new Set(
      (guestTransactions.docs || [])
        .map((transaction: any) => (typeof transaction.user === 'object' ? transaction.user?.id : transaction.user))
        .filter(Boolean) as string[],
    )

    const cleaningBookingsInfo: CleaningBookingInfo[] = allBookings.docs.map((booking: any) => {
      const post = typeof booking.post === 'object' && booking.post ? booking.post : null
      const categories = Array.isArray(post?.categories)
        ? post.categories
            .map((category: any) => (typeof category === 'object' ? category.title || category.slug || category.id : category))
            .filter(Boolean)
        : []

      let sleepCapacity = 'Unknown'
      const descriptionSource = post?.meta?.description || ''
      const contentSource = typeof post?.content === 'string' ? post.content : ''
      const capacityFromDescription =
        descriptionSource.match(/(?:sleeps?|accommodates?|fits?)\s+(\d+)/i)?.[0] ||
        descriptionSource.match(/(\d+)\s+(?:person|people|guest|bedroom)/i)?.[0]
      const capacityFromContent =
        contentSource.match(/(?:sleeps?|accommodates?|fits?)\s+(\d+)/i)?.[0] ||
        contentSource.match(/(\d+)\s+(?:person|people|guest|bedroom)/i)?.[0]
      if (capacityFromDescription) {
        sleepCapacity = capacityFromDescription.match(/\d+/)?.[0] || 'Unknown'
      } else if (capacityFromContent) {
        sleepCapacity = capacityFromContent.match(/\d+/)?.[0] || 'Unknown'
      } else if (/couple|double|twin|queen|king/i.test(descriptionSource) || /couple|double|twin|queen|king/i.test(contentSource)) {
        sleepCapacity = '2'
      }

      const checkoutDateISO = booking.toDate.split('T')[0]
      const checkinDateISO = booking.fromDate.split('T')[0]
      const customerId = typeof booking.customer === 'object' ? booking.customer?.id : booking.customer
      const isGuestBooking = customerId ? guestTransactionUserIds.has(customerId) : false

      const currentPackage = booking.selected ~~~

