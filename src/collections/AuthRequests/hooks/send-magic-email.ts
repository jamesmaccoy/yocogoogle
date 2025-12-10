import { CollectionAfterChangeHook } from 'payload'
import jwt from 'jsonwebtoken'
import { transporter } from '@/lib/transporter'
import MagicAuthEmail from '@/emails/MagicAuth'
import { render } from '@react-email/components'

export const sendMagicEmail: CollectionAfterChangeHook = async ({ req, doc, operation }) => {
  if (operation !== 'create') {
    return doc
  }

  const magicTokenPayload = {
    email: doc.email,
    authRequestId: doc.id,
  }

  const magicToken = jwt.sign(magicTokenPayload, req.payload.secret, {
    expiresIn: '15m', // Token valid for 15 minutes
  })

  const magicLink = `${process.env.NEXT_PUBLIC_BASE_URL}/api/authRequests/verify-magic-token?token=${magicToken}`

  const magicLinkEmailHtml = await render(
    MagicAuthEmail({
      magicLink,
      userName: 'User',
      code: doc.code,
      expiryTime: '15 minutes',
    }),
  )

  // Get from address with validation
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || process.env.EMAIL_FROM?.trim() || 'info@simpleplek.co.za'
  const fromName = process.env.EMAIL_FROM_NAME?.trim()
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(fromAddress)) {
    req.payload.logger.error(`Invalid EMAIL_FROM_ADDRESS format: ${fromAddress}`)
    throw new Error(`Invalid sender email address: ${fromAddress}`)
  }

  const fromField = fromName && fromName.length > 0
    ? {
        name: fromName,
        address: fromAddress,
      }
    : fromAddress

  await transporter.sendMail({
    from: fromField,
    to: doc.email,
    subject: 'Your Magic Login Link',
    html: magicLinkEmailHtml,
  })

  req.payload.logger.info(`Magic link email sent to ${doc.email}`)

  return doc
}
