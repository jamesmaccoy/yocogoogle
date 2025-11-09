import type { CollectionAfterChangeHook } from 'payload'

import { sendBookingConfirmationEmail } from '@/lib/emailNotifications'

type UserLite = {
  id: string
  name?: string | null
  email?: string | null
}

export const sendBookingConfirmationHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') {
    return doc
  }

  try {
    const payload = req.payload

    const recipientIds = new Set<string>()

    const normalizeId = (value: unknown): string | undefined => {
      if (!value) return undefined
      if (typeof value === 'string') return value
      if (typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
        return value.id
      }
      return undefined
    }

    const customerId = normalizeId(doc.customer)
    if (customerId) {
      recipientIds.add(customerId)
    }

    if (Array.isArray(doc.guests)) {
      for (const guest of doc.guests) {
        const guestId = normalizeId(guest)
        if (guestId) {
          recipientIds.add(guestId)
        }
      }
    }

    if (recipientIds.size === 0) {
      return doc
    }

    const usersResult = await payload.find({
      collection: 'users',
      where: {
        id: {
          in: Array.from(recipientIds),
        },
      },
      limit: recipientIds.size,
      depth: 0,
    })

    const recipients = usersResult.docs
      .filter((user): user is UserLite => Boolean(user?.id && user?.email))
      .map((user) => ({
        id: user.id,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
      }))

    if (recipients.length === 0) {
      return doc
    }

    const post =
      typeof doc.post === 'string'
        ? await payload.findByID({
            collection: 'posts',
            id: doc.post,
            depth: 0,
          })
        : doc.post

    const propertyTitle =
      (typeof doc.title === 'string' && doc.title.trim().length > 0 ? doc.title : undefined) ??
      (typeof post === 'object' && post !== null && 'title' in post
        ? String(post.title)
        : undefined) ??
      'Booking'

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://www.simpleplek.co.za'
    const bookingUrl = `${baseUrl}/bookings/${doc.id}`

    await Promise.all(
      recipients.map((recipient) =>
        sendBookingConfirmationEmail({
          recipientEmail: recipient.email!,
          recipientName: recipient.name,
          propertyTitle,
          fromDate: doc.fromDate,
          toDate: doc.toDate,
          bookingId: doc.id,
          bookingUrl,
        }),
      ),
    )
  } catch (error) {
    console.error('❌ Failed to send booking confirmation email:', error)
  }

  return doc
}


