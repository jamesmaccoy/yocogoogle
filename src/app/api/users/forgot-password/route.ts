import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { Resend } from 'resend'
import PasswordResetEmail from '@/emails/PasswordReset'
import { render } from '@react-email/components'

const resendApiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS
const resend = new Resend(resendApiKey)

// Simple in-memory rate limiting store
// In production, consider using Redis or a database
const resetAttempts = new Map<string, { count: number; lastAttempt: number }>()

// Rate limiting: max 3 requests per email per hour
const MAX_ATTEMPTS = 3
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour in milliseconds

function checkRateLimit(email: string): { allowed: boolean; remainingTime?: number } {
  const normalizedEmail = email.toLowerCase().trim()
  const now = Date.now()
  const record = resetAttempts.get(normalizedEmail)

  if (!record) {
    resetAttempts.set(normalizedEmail, { count: 1, lastAttempt: now })
    return { allowed: true }
  }

  // Reset if window has passed
  if (now - record.lastAttempt > RATE_LIMIT_WINDOW) {
    resetAttempts.set(normalizedEmail, { count: 1, lastAttempt: now })
    return { allowed: true }
  }

  // Check if limit exceeded
  if (record.count >= MAX_ATTEMPTS) {
    const remainingTime = Math.ceil((RATE_LIMIT_WINDOW - (now - record.lastAttempt)) / 1000 / 60) // minutes
    return { allowed: false, remainingTime }
  }

  // Increment count
  record.count++
  record.lastAttempt = now
  resetAttempts.set(normalizedEmail, record)
  return { allowed: true }
}


export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const body = await request.json()
    
    // Validate required fields
    const { email } = body
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ 
        error: 'Email is required' 
      }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ 
        error: 'Invalid email format' 
      }, { status: 400 })
    }

    // Check rate limit
    const rateLimit = checkRateLimit(normalizedEmail)
    if (!rateLimit.allowed) {
      return NextResponse.json({ 
        error: `Too many password reset requests. Please try again in ${rateLimit.remainingTime} minutes.` 
      }, { status: 429 })
    }

    // Check if user exists
    const users = await payload.find({
      collection: 'users',
      where: {
        email: {
          equals: normalizedEmail,
        },
      },
      limit: 1,
    })

    // Always return success message to prevent email enumeration
    // Even if user doesn't exist, we return the same message
    if (users.docs.length === 0) {
      return NextResponse.json({
        message: 'If an account exists with this email, a password reset link has been sent.'
      })
    }

    const user = users.docs[0]

    // Manually generate reset token to avoid Payload's email sending
    // This gives us full control over the email sending process
    try {
      // Generate a secure random token (similar to what Payload does internally)
      const crypto = await import('crypto')
      const resetToken = crypto.randomBytes(32).toString('hex')
      
      // Set expiration to 1 hour from now
      const resetPasswordExpiration = new Date()
      resetPasswordExpiration.setHours(resetPasswordExpiration.getHours() + 1)

      // Update user with reset token and expiration
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          resetPasswordToken: resetToken,
          resetPasswordExpiration: resetPasswordExpiration.toISOString(),
        },
      })

      // Build reset link using the token we just generated
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const resetLink = `${baseUrl}/reset-password?token=${resetToken}`

      // Render email template
      const emailHtml = await render(
        PasswordResetEmail({
          resetLink,
          userName: user.name || user.email.split('@')[0],
          expiryTime: '1 hour',
        }),
      )

      // Get from address with validation (same logic as magic auth email)
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
        console.error(`Invalid EMAIL_FROM_ADDRESS format: ${fromAddress}`)
        // Still return success to prevent email enumeration
        return NextResponse.json({
          message: 'If an account exists with this email, a password reset link has been sent.'
        })
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

      // Send email using Resend API
      const { error: emailError } = await resend.emails.send({
        from: fromField,
        to: normalizedEmail,
        subject: 'Reset Your Password - Simpleplek',
        html: emailHtml,
      })

      if (emailError) {
        console.error('Failed to send password reset email:', emailError)
        // Still return success to prevent email enumeration
        return NextResponse.json({
          message: 'If an account exists with this email, a password reset link has been sent.'
        })
      }

      console.log(`Password reset email sent to ${normalizedEmail}`)
    } catch (error: any) {
      // Log the error for debugging but return generic success message
      console.error('Password reset request error:', error)
    }

    // Always return success message to prevent email enumeration
    return NextResponse.json({
      message: 'If an account exists with this email, a password reset link has been sent.'
    })
  } catch (error) {
    console.error('Error during forgot password:', error)
    
    return NextResponse.json(
      { error: 'An error occurred. Please try again later.' },
      { status: 500 }
    )
  }
}

