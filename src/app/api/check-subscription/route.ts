import { NextRequest, NextResponse } from 'next/server'
import { yocoService } from '@/lib/yocoService'

export async function GET(request: NextRequest) {
  try {
    const authCookie = request.cookies.get('payload-token')
    if (!authCookie?.value) {
      return NextResponse.json({ hasActiveSubscription: false }, { status: 200 })
      // display pricing regardless of authentication
    }

    // Get the user ID from the auth token
    const token = authCookie.value
    const [header, payload, signature] = token.split('.')
    if (!payload) throw new Error('Invalid token: missing payload')
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString())
    const userId = decodedPayload.id

    // Initialize Yoco service
    await yocoService.initialize()

    // Get customer info from Yoco
    const customerInfo = await yocoService.getCustomerInfo(userId)
    
    // Extract active entitlement IDs
    const activeEntitlements = Object.keys(customerInfo?.entitlements?.active || {});
    const hasActiveSubscription = activeEntitlements.length > 0;
    
    // Set the Yoco customer ID in a cookie for cross-device sync
    const response = NextResponse.json({ 
      hasActiveSubscription,
      customerId: customerInfo?.id || userId,
      activeEntitlements: activeEntitlements,
    })

    // Set the Yoco customer ID cookie
    response.cookies.set('yoco-customer-id', customerInfo?.id || userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Error checking subscription:', error)
    return NextResponse.json({ 
      hasActiveSubscription: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 