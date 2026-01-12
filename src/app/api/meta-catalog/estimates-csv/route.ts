import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'

/**
 * Meta Commerce Manager CSV Feed for Estimates
 * Generates a CSV file compatible with Meta Commerce Manager data feed import
 * 
 * Usage:
 * - For all estimates: /api/meta-catalog/estimates-csv?format=csv
 * - For specific user: /api/meta-catalog/estimates-csv?userId=[user-id]&format=csv
 * - For Google Sheets: Import this CSV URL directly into Google Sheets
 * - For Meta: Upload CSV file or use scheduled feed URL
 * 
 * Meta accepts CSV, TSV, XML (RSS/ATOM), or XLSX files up to 4 GB
 * See: https://www.facebook.com/business/help/384041892421495
 */

interface MetaCSVProduct {
  id: string
  title: string
  description: string
  availability: string
  condition: string
  price: string
  currency: string
  link: string
  image_link: string
  brand: string
  product_type: string
  custom_label_0?: string // Package type
  custom_label_1?: string // Duration
  custom_label_2?: string // Post ID
  custom_label_3?: string // Estimate ID
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const format = searchParams.get('format') || 'csv' // Default to CSV for Meta

    // Get authenticated user (optional - for per-user feeds)
    let user
    try {
      const authResult = await getMeUser()
      user = authResult.user
    } catch (error) {
      // If no auth, we'll return empty catalog or use a default approach
      // Meta needs a valid CSV file even if empty
    }

    // Use provided userId or authenticated user's ID
    // If neither, return all estimates (for admin) or empty catalog
    const targetUserId = userId || user?.id

    const payload = await getPayload({ config: configPromise })

    // Build where clause
    const where: any = {}
    if (targetUserId) {
      where.customer = { equals: targetUserId }
    }

    // Fetch user's estimates
    const estimates = await payload.find({
      collection: 'estimates',
      where: Object.keys(where).length > 0 ? where : undefined,
      sort: '-createdAt',
      limit: 1000, // Get more estimates for CSV export
      depth: 2, // Include post and customer data
    })

    // Transform estimates to Meta CSV format
    const catalogProducts: MetaCSVProduct[] = estimates.docs
      .filter((estimate) => {
        // Only include estimates with valid post and total
        return estimate.post && estimate.total && estimate.total > 0
      })
      .map((estimate) => {
        const post = typeof estimate.post === 'object' ? estimate.post : null
        const postId = typeof estimate.post === 'string' ? estimate.post : post?.id
        const postSlug = post?.slug || postId
        const postTitle = post?.title || 'Property'
        const estimateId = estimate.id

        // Calculate duration
        const duration = estimate.fromDate && estimate.toDate
          ? Math.max(1, Math.round(
              (new Date(estimate.toDate).getTime() - new Date(estimate.fromDate).getTime()) /
                (1000 * 60 * 60 * 24)
            ))
          : 1

        // Get package type
        const packageType = (estimate as any).packageType || 'standard'

        // Get image
        const postImage = post?.meta?.image && typeof post.meta.image === 'object'
          ? post.meta.image
          : null

        const imageUrl = postImage?.url
          ? postImage.url.startsWith('http')
            ? postImage.url
            : `${request.nextUrl.origin}${postImage.url}`
          : `${request.nextUrl.origin}/placeholder-image.jpg`

        // Build estimate URL - link to estimate detail page
        const estimateLink = `${request.nextUrl.origin}/estimate/${estimateId}`

        // Build description
        const description = estimate.description || 
          `${postTitle} - ${duration} ${duration === 1 ? 'night' : 'nights'} stay`

        return {
          id: `estimate-${estimateId}`,
          title: `${postTitle} - ${duration} ${duration === 1 ? 'Night' : 'Nights'}`,
          description: description,
          availability: 'in stock',
          condition: 'new',
          price: `${(estimate.total || 0).toFixed(2)}`,
          currency: 'ZAR',
          link: estimateLink,
          image_link: imageUrl,
          brand: 'Simpleplek',
          product_type: packageType,
          custom_label_0: packageType,
          custom_label_1: duration.toString(),
          custom_label_2: postId || '',
          custom_label_3: estimateId,
        }
      })

    // Return CSV format
    if (format === 'csv' || !format || format === '') {
      return generateCSVResponse(catalogProducts)
    }

    // Default: JSON format
    return NextResponse.json({
      products: catalogProducts,
      total: catalogProducts.length,
      userId: targetUserId,
    })
  } catch (error) {
    console.error('Error generating Meta CSV catalog from estimates:', error)
    // Return empty but valid CSV for Meta validation
    return generateCSVResponse([])
  }
}

/**
 * Generate CSV response for Meta Commerce Manager
 * Meta requires specific field order and format
 */
function generateCSVResponse(products: MetaCSVProduct[]): NextResponse {
  // Meta Commerce Manager CSV headers (required fields first)
  const headers = [
    'id',
    'title',
    'description',
    'availability',
    'condition',
    'price',
    'currency',
    'link',
    'image_link',
    'brand',
    'product_type',
    'custom_label_0',
    'custom_label_1',
    'custom_label_2',
    'custom_label_3',
  ]

  // Create CSV rows
  const csvRows = [
    headers.join(','), // Header row
    ...products.map(product => 
      headers.map(header => {
        const value = product[header as keyof MetaCSVProduct] || ''
        // Escape commas, quotes, and newlines in CSV values
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      }).join(',')
    )
  ]

  // If no products, return header row only (Meta needs valid CSV format)
  const csvContent = csvRows.length > 1 ? csvRows.join('\n') : headers.join(',')

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="meta-catalog-estimates.csv"',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  })
}

