import { CollectionAfterChangeHook } from 'payload'
import jwt from 'jsonwebtoken'
import { Resend } from 'resend'
import MagicAuthEmail from '@/emails/MagicAuth'
import { render } from '@react-email/components'

const resend = new Resend(process.env.RESEND_API_KEY || process.env.SMTP_PASS)

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
  let fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || process.env.EMAIL_FROM?.trim() || 'info@simpleplek.co.za'
  
  // Extract email if formatted as "Name <email@example.com>"
  const emailMatch = fromAddress.match(/<([^>]+)>/)
  if (emailMatch) {
    fromAddress = emailMatch[1]
  }
  
  // Replace noreply with info
  if (fromAddress === 'noreply@simpleplek.co.za') {
    fromAddress = 'info@simpleplek.co.za'
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(fromAddress)) {
    req.payload.logger.error(`Invalid EMAIL_FROM_ADDRESS format: ${fromAddress}`)
    throw new Error(`Invalid sender email address: ${fromAddress}`)
  }

  // Get name, cleaning it if needed
  let fromName = process.env.EMAIL_FROM_NAME?.trim()
  if (fromName) {
    // Remove email formatting if present
    const nameMatch = fromName.match(/^([^<]+)\s*</)
    if (nameMatch) {
      fromName = nameMatch[1].trim()
    }
  }

  const fromField = fromName && fromName.length > 0
    ? `${fromName} <${fromAddress}>`
    : fromAddress

  const { error } = await resend.emails.send({
    from: fromField,
    to: doc.email,
    subject: 'Your Magic Login Link',
    html: magicLinkEmailHtml,
  })

  if (error) {
    req.payload.logger.error(`Failed to send magic link email: ${error.message}`)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  req.payload.logger.info(`Magic link email sent to ${doc.email}`)

  return doc
}
