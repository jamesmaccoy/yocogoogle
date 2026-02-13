import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

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

    // Use Payload's built-in forgotPassword operation
    // This will generate a reset token and send an email using the configured email adapter
    // Rate limiting above prevents abuse/loops
    try {
      await payload.forgotPassword({
        collection: 'users',
        data: {
          email: normalizedEmail,
        },
        // Email will be sent automatically using Payload's email adapter configuration
        // The email template can be customized in payload.config.ts email settings
      })
    } catch (error: any) {
      // Payload may throw if user doesn't exist, but we don't want to reveal that
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

