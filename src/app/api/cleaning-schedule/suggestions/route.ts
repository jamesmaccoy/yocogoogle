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

type ScheduleSuggestion = {
  label: string
  fromCheckoutDate: string
  fromCheckoutDateFormatted: string
  fromPropertyCount: number
  toCheckoutDate: string
  toCheckoutDateFormatted: string
  toPropertyCount: number
  properties: CleaningBookingInfo[]
}

type CleaningWindowSuggestion = {
  checkoutDate: string
  checkoutDateFormatted: string
  nextCheckinDate: string
  nextCheckinDateFormatted: string
  propertyTitle: string
  timeWindowHours: number
  timeWindowDays: number
  timeWindowLabel: string
  nextPackageName?: string
  isGuestBooking: boolean
}

function extractSleepCapacity(description?: string, content?: string): string {
  const sources = [description ?? '', content ?? '']
  for (const source of sources) {
    const direct = source.match(/(?:sleeps?|accommodates?|fits?)\s+(\d+)/i)
    if (direct?.[1]) return direct[1]
    const people = source.match(/(\d+)\s+(?:person|people|guest|bedroom)/i)
    if (people?.[1]) return people[1]
    if (/couple|double|twin|queen|king/i.test(source)) return '2'
  }
  return 'Unknown'
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

    const bookingsResult = await payload.find({
      collection: 'bookings',
      where: { paymentStatus: { equals: 'paid' } },
      depth: 2,
      sort: 'toDate',
      limit: 200,
    })

    const bookings = bookingsResult.docs
    const customerIds = bookings
      .map((booking: any) => (typeof booking.customer === 'object' ? booking.customer?.id : booking.customer))
      .filter(Boolean) as string[]

    const guestTransactions =
      customerIds.length > 0
        ? await payload.find({
            collection: 'yoco-transactions',
            where: { user: { in: customerIds }, intent: { equals: 'booking' }, status: { equals: 'completed' } },
            limit: 1000,
          })
        : { docs: [] }

    const guestTransactionUserIds = new Set(
      (guestTransactions.docs || [])
        .map((transaction: any) => (typeof transaction.user === 'object' ? transaction.user?.id : transaction.user))
        .filter(Boolean) as string[],
    )

    const cleaningBookingsInfo: CleaningBookingInfo[] = bookings.map((booking: any) => {
      const post = typeof booking.post === 'object' && booking.post ? booking.post : null
      const categories = Array.isArray(post?.categories)
        ? post.categories
            .map((category: any) => (typeof category === 'object' ? category.title || category.slug || category.id : category))
            .filter(Boolean)
        : []

      const sleepCapacity = extractSleepCapacity(post?.meta?.description, typeof post?.content === 'string' ? post.content : undefined)
      const checkoutDateISO = booking.toDate.split('T')[0]
      const checkinDateISO = booking.fromDate.split('T')[0]
      const customerId = typeof booking.customer === 'object' ? booking.customer?.id : booking.customer
      const isGuestBooking = customerId ? guestTransactionUserIds.has(customerId) : false

      const packageRel = booking.selectedPackage?.package
      const currentPackageName =
        typeof packageRel === 'object' && packageRel
          ? packageRel.name || booking.selectedPackage?.customName || 'Unknown Package'
          : booking.selectedPackage?.customName || 'Unknown Package'

      return {
        id: booking.id,
        propertyTitle: post?.title || booking.title || 'Unknown Property',
        propertySlug: post?.slug || '',
        propertyId: post?.id || '',
        fromDate: booking.fromDate,
        toDate: booking.toDate,
        checkoutDate: new Date(booking.toDate).toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        checkinDate: new Date(booking.fromDate).toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        checkoutDateISO,
        checkinDateISO,
        status: booking.paymentStatus || 'unknown',
        proximityCategories: categories,
        sleepCapacity,
        isGuestBooking,
        currentPackageName,
      }
    })

    const propertyNextBookings: Record<
      string,
      (CleaningBookingInfo & { timeWindowHours: number; timeWindowDays: number; nextPackageName?: string }) | null
    > = {}

    cleaningBookingsInfo.forEach((booking) => {
      const nextBooking = cleaningBookingsInfo
        .filter((candidate) => candidate.propertyId === booking.propertyId && candidate.checkinDateISO > booking.checkoutDateISO)
        .sort((a, b) => a.checkinDateISO.localeCompare(b.checkinDateISO))[0]

      if (nextBooking) {
        const checkoutDate = new Date(booking.toDate)
        const nextCheckinDate = new Date(nextBooking.fromDate)
        const timeWindowMs = nextCheckinDate.getTime() - checkoutDate.getTime()
        const timeWindowHours = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60)))
        const timeWindowDays = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60 * 24)))

        propertyNextBookings[booking.id] = {
          ...nextBooking,
          timeWindowHours,
          timeWindowDays,
          nextPackageName: nextBooking.currentPackageName,
        }
      } else {
        propertyNextBookings[booking.id] = null
      }
    })

    const bookingsByCheckoutDate: Record<string, CleaningBookingInfo[]> = {}
    cleaningBookingsInfo.forEach((booking) => {
      if (!bookingsByCheckoutDate[booking.checkoutDateISO]) {
        bookingsByCheckoutDate[booking.checkoutDateISO] = []
      }
      bookingsByCheckoutDate[booking.checkoutDateISO]!.push(booking)
    })

    const scheduleSuggestions: ScheduleSuggestion[] = Object.entries(bookingsByCheckoutDate)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .flatMap(([dateISO, dateBookings]) => {
        const dateFormatted = new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

        const nextGroups: Record<string, { label: string; count: number }> = {}
        dateBookings.forEach((booking) => {
          const nextBooking = propertyNextBookings[booking.id]
          if (!nextBooking) return
          if (!nextGroups[nextBooking.checkoutDateISO]) {
            nextGroups[nextBooking.checkoutDateISO] = {
              label: new Date(`${nextBooking.checkoutDateISO}T00:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
              count: 0,
            }
          }
          nextGroups[nextBooking.checkoutDateISO]!.count += 1
        })

        return Object.entries(nextGroups).map(([nextISO, entry]) => ({
          label: `${dateFormatted} (${dateBookings.length} ${dateBookings.length === 1 ? 'property' : 'properties'}) - ${entry.label} (${entry.count} ${entry.count === 1 ? 'property' : 'properties'})`,
          fromCheckoutDate: dateISO,
          fromCheckoutDateFormatted: dateFormatted,
          fromPropertyCount: dateBookings.length,
          toCheckoutDate: nextISO,
          toCheckoutDateFormatted: entry.label,
          toPropertyCount: entry.count,
          properties: dateBookings,
        }))
      })

    const dateSuggestions: CleaningWindowSuggestion[] = cleaningBookingsInfo
      .map((booking) => {
        const nextBooking = propertyNextBookings[booking.id]
        if (!nextBooking) return null

        const checkoutDate = new Date(booking.toDate)
        const nextCheckinDate = new Date(nextBooking.fromDate)
        const timeWindowMs = nextCheckinDate.getTime() - checkoutDate.getTime()
        const timeWindowHours = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60)))
        const timeWindowDays = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60 * 24)))

        let timeWindowLabel = ''
        if (timeWindowHours < 24) {
          timeWindowLabel = `${timeWindowHours} hour${timeWindowHours === 1 ? '' : 's'}`
        } else if (timeWindowDays === 1) {
          timeWindowLabel = '1 day'
        } else {
          timeWindowLabel = `${timeWindowDays} days`
        }

        return {
          checkoutDate: booking.checkoutDateISO,
          checkoutDateFormatted: booking.checkoutDate,
          nextCheckinDate: nextBooking.checkinDateISO,
          nextCheckinDateFormatted: nextBooking.checkinDate,
          propertyTitle: booking.propertyTitle,
          timeWindowHours,
          timeWindowDays,
          timeWindowLabel,
          nextPackageName: nextBooking.currentPackageName,
          isGuestBooking: booking.isGuestBooking,
        }
      })
      .filter((item): item is CleaningWindowSuggestion => Boolean(item))
      .sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate))

    return NextResponse.json({ scheduleSuggestions, dateSuggestions })
  } catch (error) {
    console.error('Error fetching cleaning schedule suggestions:', error)
    return NextResponse.json({ error: 'Failed to load cleaning schedule suggestions' }, { status: 500 })
  }
}
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

    const propertyNextBookings: Record<
      string,
      (CleaningBookingInfo & {
        timeWindowHours: number
        timeWindowDays: number
        nextPackageName?: string
      }) | null
    > = {}

    cleaningBookingsInfo.forEach((booking) => {
      const nextBooking = cleaningBookingsInfo
        .filter((candidate) => candidate.propertyId === booking.propertyId && candidate.checkinDateISO > booking.checkoutDateISO)
        .sort((a, b) => a.checkinDateISO.localeCompare(b.checkinDateISO))[0]

      if (nextBooking) {
        const checkoutDate = new Date(booking.toDate)
        const nextCheckinDate = new Date(nextBooking.fromDate)
        const timeWindowMs = nextCheckinDate.getTime() - checkoutDate.getTime()
        const timeWindowHours = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60)))
        const timeWindowDays = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60 * 24)))

        propertyNextBookings[booking.id] = {
          ...nextBooking,
          timeWindowHours,
          timeWindowDays,
          nextPackageName: nextBooking.currentPackageName,
        }
      } else {
        propertyNextBookings[booking.id] = null
      }
    })

    const bookingsByCheckoutDate: Record<string, CleaningBookingInfo[]> = {}
    cleaningBookingsInfo.forEach((booking) => {
      if (!bookingsByCheckoutDate[booking.checkoutDateISO]) {
        bookingsByCheckoutDate[booking.checkoutDateISO] = []
      }
      bookingsByCheckoutDate[booking.checkoutDateISO]!.push(booking)
    })

    const scheduleSuggestions = Object.entries(bookingsByCheckoutDate)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .flatMap(([dateISO, bookings]) => {
        const dateFormatted = new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

        const nextGroups: Record<string, { label: string; count: number }> = {}
        bookings.forEach((booking) => {
          const nextBooking = propertyNextBookings[booking.id]
          if (!nextBooking) return
          if (!nextGroups[nextBooking.checkoutDateISO]) {
            nextGroups[nextBooking.checkoutDateISO] = {
              label: new Date(`${nextBooking.checkoutDateISO}T00:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
              count: 0,
            }
          }
          nextGroups[nextBooking.checkoutDateISO]!.count += 1
        })

        return Object.entries(nextGroups).map(([nextIso, summary]) => ({
          label: `${dateFormatted} (${bookings.length} ${bookings.length === 1 ? 'property' : 'properties'}) - ${summary.label} (${summary.count} ${summary.count === 1 ? 'property' : 'properties'})`,
          fromCheckoutDate: dateISO,
          fromCheckoutDateFormatted: dateFormatted,
          fromPropertyCount: bookings.length,
          toCheckoutDate: nextIso,
          toCheckoutDateFormatted: summary.label,
          toPropertyCount: summary.count,
          properties: bookings,
        }))
      })

    const dateSuggestions = cleaningBookingsInfo
      .map((booking) => {
        const nextBooking = propertyNextBookings[booking.id]
        if (!nextBooking) return null

        const checkoutDate = new Date(booking.toDate)
        const nextCheckinDate = new Date(nextBooking.fromDate)
        const timeWindowMs = nextCheckinDate.getTime() - checkoutDate.getTime()
        const timeWindowHours = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60)))
        const timeWindowDays = Math.max(0, Math.floor(timeWindowMs / (1000 * 60 * 60 * 24)))

        let timeWindowLabel = ''
        if (timeWindowHours < 24) {
          timeWindowLabel = `${timeWindowHours} hour${timeWindowHours === 1 ? '' : 's'}`
        } else if (timeWindowDays === 1) {
          timeWindowLabel = '1 day'
        } else {
          timeWindowLabel = `${timeWindowDays} days`
        }

        return {
          checkoutDate: booking.checkoutDateISO,
          checkoutDateFormatted: booking.checkoutDate,
          nextCheckinDate: nextBooking.checkinDateISO,
          nextCheckinDateFormatted: nextBooking.checkinDate,
          propertyTitle: booking.propertyTitle,
          timeWindowHours,
          timeWindowDays,
          timeWindowLabel,
          nextPackageName: nextBooking.currentPackageName,
          isGuestBooking: booking.isGuestBooking,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a && b ? a.checkoutDate.localeCompare(b.checkoutDate) : 0))

    return NextResponse.json({
      scheduleSuggestions,
      dateSuggestions,
    })
  } catch (error) {
    console.error('Error fetching cleaning schedule suggestions:', error)
    return NextResponse.json({ error: 'Failed to load cleaning schedule suggestions' }, { status: 500 })
  }
}

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
        descriptionSource.match(/(?:sleeps?|accommodates?|fits?)\s+(\d+)/i) ||
        descriptionSource.match(/(\d+)\s+(?:person|people|guest|bedroom)/i)
      const capacityFromContent =
        contentSource.match(/(?:sleeps?|accommodates?|fits?)\s+(\d+)/i) ||
        contentSource.match(/(\d+)\s+(?:person|people|guest|bedroom)/i)
      if (capacityFromDescription?.[1]) {
        sleepCapacity = capacityFromDescription[1]
      } else if (capacityFromContent?.[1]) {
        sleepCapacity = capacityFromContent[1]
      } else if (/couple|double|twin|queen|king/i.test(descriptionSource) || /couple|double|twin|queen|king/i.test(contentSource)) {
        sleepCapacity = '2'
      }

      const checkoutDateISO = booking.toDate.split('T')[0]
      const checkinDateISO = booking.fromDate.split('T')[0]
      const customerId = typeof booking.customer === 'object' ? booking.customer?.id : booking.customer
      const isGuestBooking = customerId ? guestTransactionUserIds.has(customerId) : false

      const currentPackage = booking.selectedPackage?.package
      const currentPackageName =
        typeof currentPackage === 'object' && currentPackage
          ? currentPackage.name || booking.selectedPackage?.customName || 'Unknown Package'
          : booking.selectedPackage?.customName || 'Unknown Package'

