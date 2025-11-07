import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { yocoService } from '@/lib/yocoService'

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const {
      packageData,
      customerName: customerNameFromBody,
      total,
      productId,
      estimateId,
      postId,
      duration,
      startDate,
      endDate,
      version,
    } = body

    const customerId = String(user.id)
    const customerName = customerNameFromBody || user.name || user.email || 'Guest'

    if (!customerName) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    console.log(`API Route: Using Yoco API version: ${version || 'default'}`)

    let paymentLink = null

    if (packageData) {
      // Create payment link for database package
      if (!total || Number(total) <= 0) {
        return NextResponse.json({ error: 'Total amount is required for database packages' }, { status: 400 })
      }
      if (!packageData.id || !packageData.name) {
        return NextResponse.json({ error: 'packageData.id and packageData.name are required' }, { status: 400 })
      }
      paymentLink = await yocoService.createPaymentLinkFromDatabasePackage(
        packageData,
        customerId,
        customerName,
        Number(total),
        version,
        { estimateId, postId, duration, startDate, endDate }
      )
    } else if (productId) {
      // Create payment link for Yoco product
      const products = await yocoService.getProducts()
      const product = products.find(p => p.id === productId)
      
      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }
      
      paymentLink = await yocoService.createPaymentLink(product, customerId, customerName, version, { estimateId, postId, duration, startDate, endDate })
    } else {
      return NextResponse.json({ error: 'Either packageData or productId is required' }, { status: 400 })
    }

    if (!paymentLink) {
      return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 })
    }

    return NextResponse.json({ paymentLink })
  } catch (error) {
    console.error('Error creating payment link:', error)
    return NextResponse.json(
      { error: 'Failed to create payment link', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
