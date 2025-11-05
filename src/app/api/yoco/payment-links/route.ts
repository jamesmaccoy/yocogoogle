import { NextRequest, NextResponse } from 'next/server'
import { yocoService } from '@/lib/yocoService'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { packageData, customerId, customerName, total, productId, estimateId, postId, duration, startDate, endDate, version } = body

    if (!customerId || !customerName) {
      return NextResponse.json({ error: 'Customer ID and name are required' }, { status: 400 })
    }

    console.log(`API Route: Using Yoco API version: ${version || 'default'}`)

    let paymentLink = null

    if (packageData) {
      // Create payment link for database package
      if (!total) {
        return NextResponse.json({ error: 'Total amount is required for database packages' }, { status: 400 })
      }
      paymentLink = await yocoService.createPaymentLinkFromDatabasePackage(
        packageData,
        customerId,
        customerName,
        total,
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
