import { NextRequest, NextResponse } from 'next/server'
import { yocoService } from '@/lib/yocoService'

export async function GET(request: NextRequest) {
  try {
    // Fetch all available products from Yoco
    const products = await yocoService.getProducts()
    
    // Transform to the format expected by the frontend
    const availableProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      currency: product.currency,
      period: product.period,
      periodCount: product.periodCount,
      category: product.category,
      features: product.features,
      entitlement: product.entitlement,
      icon: product.icon,
    }))

    console.log(`Serving ${availableProducts.length} available products`)
    
    return NextResponse.json(availableProducts)
  } catch (error) {
    console.error('Error fetching available products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch available products' },
      { status: 500 }
    )
  }
} 