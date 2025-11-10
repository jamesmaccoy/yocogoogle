import type { CollectionAfterChangeHook } from 'payload'

import { sendBookingConfirmationEmail } from '@/lib/emailNotifications'

type Recipient = {
  id: string
  email: string
  name?: string
}

const normalizeRelationshipId = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const possibleId = (value as { id?: unknown }).id
    if (typeof possibleId === 'string') {
      return possibleId
    }
  }
  return undefined
}

const extractRecipientFromRelation = (value: unknown): Recipient | null => {
  if (!value || typeof value !== 'object') return null

  const id =
    'id' in value && typeof (value as { id?: unknown }).id === 'string'
      ? ((value as { id: string }).id as string)
      : undefined
  const email =
    'email' in value && typeof (value as { email?: unknown }).email === 'string'
      ? ((value as { email: string }).email as string)
      : undefined
  const name =
    'name' in value && typeof (value as { name?: unknown }).name === 'string'
      ? ((value as { name: string }).name as string)
      : undefined

  if (id && email) {
    return { id, email, name }
  }

  return null
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
    const resolvedRecipients: Recipient[] = []
    const pendingIds = new Set<string>()

    const includeRelation = (value: unknown) => {
      const directRecipient = extractRecipientFromRelation(value)
      if (directRecipient) {
        resolvedRecipients.push(directRecipient)
        return
      }

      const id = normalizeRelationshipId(value)
      if (id) {
        pendingIds.add(id)
      }
    }

    includeRelation(doc.customer)

    if (Array.isArray(doc.guests)) {
      for (const guest of doc.guests) {
        includeRelation(guest)
      }
    }

    const payload = req.payload

    if (pendingIds.size > 0) {
      const usersResult = await payload.find({
        collection: 'users',
        where: {
          id: {
            in: Array.from(pendingIds),
          },
        },
        limit: pendingIds.size,
        depth: 0,
        overrideAccess: true,
      })

      usersResult.docs.forEach((user) => {
        if (!user || typeof user !== 'object') return

        const id = normalizeRelationshipId(user)
        const email =
          'email' in user && typeof user.email === 'string' ? (user.email as string) : undefined
        const name =
          'name' in user && typeof user.name === 'string' ? (user.name as string) : undefined

        if (id && email) {
          resolvedRecipients.push({ id, email, name })
        }
      })
    }

    const uniqueRecipients = Array.from(
      new Map(resolvedRecipients.map((recipient) => [recipient.email, recipient] as const)).values(),
    )

    if (uniqueRecipients.length === 0) {
      console.warn(
        `⚠️ Booking ${doc.id} confirmation skipped — no recipients with email after resolving relations.`,
      )
      return doc
    }

    const post =
      typeof doc.post === 'string'
        ? await payload.findByID({
            collection: 'posts',
            id: doc.post,
            depth: 0,
            overrideAccess: true,
          })
        : doc.post

    const propertyTitle =
      (typeof doc.title === 'string' && doc.title.trim().length > 0 ? doc.title : undefined) ??
      (typeof post === 'object' && post !== null && 'title' in post
        ? String((post as { title?: unknown }).title)
        : undefined) ??
      'Booking'

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://www.simpleplek.co.za'
    const bookingUrl = `${baseUrl}/bookings/${doc.id}`

    console.log('📧 Sending booking confirmation email(s)', {
      bookingId: doc.id,
      recipients: uniqueRecipients.map((recipient) => ({
        id: recipient.id,
        email: recipient.email,
      })),
    })

    await Promise.all(
      uniqueRecipients.map((recipient) =>
        sendBookingConfirmationEmail({
          recipientEmail: recipient.email,
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

