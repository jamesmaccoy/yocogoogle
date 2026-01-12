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
  internal_label?: string // Internal label for organizing products (comma-separated, up to 5000 labels)
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
    // NOTE: For Meta Commerce Manager, the feed should be publicly accessible
    // Meta's crawler will access this URL without authentication
    const targetUserId = userId || user?.id

    const payload = await getPayload({ config: configPromise })

    // Build where clause
    const where: any = {}
    if (targetUserId) {
      where.customer = { equals: targetUserId }
    }

    // Fetch user's estimates
    let estimates = await payload.find({
      collection: 'estimates',
      where: Object.keys(where).length > 0 ? where : undefined,
      sort: '-createdAt',
      limit: 1000, // Get more estimates for CSV export
      depth: 2, // Include post and customer data
    })

    console.log(`[Meta CSV Feed] Found ${estimates.docs.length} estimates for userId: ${targetUserId || 'all'}`)

    // Meta requires non-empty CSV files. If a specific userId was provided but has no estimates,
    // fall back to all estimates to ensure Meta always receives a valid feed.
    if (estimates.docs.length === 0 && targetUserId) {
      console.warn(`[Meta CSV Feed] No estimates found for userId ${targetUserId}, falling back to all estimates`)
      estimates = await payload.find({
        collection: 'estimates',
        where: undefined, // Get all estimates
        sort: '-createdAt',
        limit: 1000,
        depth: 2,
      })
      console.log(`[Meta CSV Feed] Fallback: Found ${estimates.docs.length} total estimates`)
    }

    // Transform estimates to Meta CSV format with validation
    const catalogProducts: MetaCSVProduct[] = estimates.docs
      .filter((estimate) => {
        // Only include estimates with valid post and total
        const hasPost = !!estimate.post
        const hasValidTotal = estimate.total && estimate.total > 0
        const hasEstimateId = !!estimate.id
        
        if (!hasPost) {
          console.warn(`Estimate ${estimate.id} skipped: missing post`)
        }
        if (!hasValidTotal) {
          console.warn(`Estimate ${estimate.id} skipped: invalid total (${estimate.total})`)
        }
        if (!hasEstimateId) {
          console.warn(`Estimate skipped: missing ID`)
        }
        
        return hasPost && hasValidTotal && hasEstimateId
      })
      .map((estimate): MetaCSVProduct | null => {
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
        const packageType = estimate.packageType || 'standard'

        // Get post meta image - use OG size (1200x630) if available, perfect for Meta Commerce Manager
        const postImage = post?.meta?.image && typeof post.meta.image === 'object'
          ? post.meta.image
          : null

        // Prefer OG image size for Meta (1200x630 optimized for social media)
        let imageUrl = `${request.nextUrl.origin}/placeholder-image.jpg`
        if (postImage) {
          // Check for OG size first (optimized for Meta/social media)
          const ogImageUrl = (postImage as any)?.sizes?.og?.url
          if (ogImageUrl) {
            imageUrl = ogImageUrl.startsWith('http')
              ? ogImageUrl
              : `${request.nextUrl.origin}${ogImageUrl}`
          } else if (postImage.url) {
            // Fall back to regular image URL
            imageUrl = postImage.url.startsWith('http')
              ? postImage.url
              : `${request.nextUrl.origin}${postImage.url}`
          }
        }

        // Build estimate URL - link to estimate detail page
        const estimateLink = `${request.nextUrl.origin}/estimate/${estimateId}`

        // Build description from estimate notes or generate from post title and duration
        const description = estimate.notes || 
          `${postTitle} - ${duration} ${duration === 1 ? 'night' : 'nights'} stay`

        // Ensure image URL is absolute HTTPS (Meta requires accessible images)
        let absoluteImageUrl = imageUrl.startsWith('http')
          ? imageUrl.replace(/^http:/, 'https:') // Force HTTPS
          : imageUrl.startsWith('//')
          ? `https:${imageUrl}`
          : `https://${request.nextUrl.host}${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}`
        
        // Validate image URL format (Meta requires valid image URLs)
        if (!absoluteImageUrl.match(/^https:\/\/.+\..+/)) {
          console.warn(`Invalid image URL for estimate ${estimateId}: ${absoluteImageUrl}`)
          // Use a default image if invalid
          absoluteImageUrl = `https://${request.nextUrl.host}/placeholder-image.jpg`
        }
        
        // Ensure link URL is absolute HTTPS (Meta requires valid product URLs)
        let absoluteLink = estimateLink.startsWith('http')
          ? estimateLink.replace(/^http:/, 'https:') // Force HTTPS
          : `https://${request.nextUrl.host}${estimateLink.startsWith('/') ? estimateLink : `/${estimateLink}`}`
        
        // Validate link URL format
        if (!absoluteLink.match(/^https:\/\/.+\..+/)) {
          console.warn(`Invalid link URL for estimate ${estimateId}: ${absoluteLink}`)
        }
        
        // Meta requires price format: "NUMBER CURRENCY" (e.g., "5400.00 ZAR")
        const priceValue = (estimate.total || 0).toFixed(2)
        const formattedPrice = `${priceValue} ZAR`
        
        // Ensure description is not empty and has minimum length (Meta requires meaningful descriptions)
        let validDescription = description && description.trim().length > 0
          ? description.trim()
          : `${postTitle} - ${duration} ${duration === 1 ? 'night' : 'nights'} accommodation`
        
        // Ensure description is not too short (Meta prefers descriptions with substance)
        if (validDescription.length < 10) {
          validDescription = `${postTitle} - ${duration} ${duration === 1 ? 'night' : 'nights'} accommodation stay`
        }
        
        // Ensure title is not empty and meaningful (Meta requires non-empty titles)
        let validTitle = postTitle && postTitle.trim().length > 0
          ? `${postTitle} - ${duration} ${duration === 1 ? 'Night' : 'Nights'}`
          : `Property Estimate - ${duration} ${duration === 1 ? 'Night' : 'Nights'}`
        
        // Ensure title is not too short
        if (validTitle.length < 3) {
          validTitle = `Accommodation - ${duration} ${duration === 1 ? 'Night' : 'Nights'}`
        }
        
        // Validate all required fields before adding to catalog
        if (!estimateId || !validTitle || !validDescription || !formattedPrice || !absoluteLink || !absoluteImageUrl) {
          console.error(`Estimate ${estimateId} missing required fields:`, {
            id: estimateId,
            title: validTitle,
            description: validDescription,
            price: formattedPrice,
            link: absoluteLink,
            image: absoluteImageUrl
          })
          return null // Will be filtered out
        }

        return {
          id: `estimate-${estimateId}`,
          title: validTitle,
          description: validDescription,
          availability: 'in stock',
          condition: 'new',
          price: formattedPrice,
          currency: 'ZAR',
          link: absoluteLink,
          image_link: absoluteImageUrl,
          brand: 'Simpleplek',
          product_type: packageType || 'accommodation',
          custom_label_0: packageType || '',
          custom_label_1: duration.toString(),
          custom_label_2: postId || '',
          custom_label_3: estimateId,
        } as MetaCSVProduct
      })
      .filter((product): product is MetaCSVProduct => product !== null) // Remove any null products

    console.log(`[Meta CSV Feed] Generated ${catalogProducts.length} valid products from ${estimates.docs.length} estimates`)

    // Return CSV format
    if (format === 'csv' || !format || format === '') {
      if (catalogProducts.length === 0) {
        // Meta rejects empty CSV files. Return an error response instead.
        console.error('[Meta CSV Feed] No valid products generated - Meta requires non-empty CSV files')
        return NextResponse.json(
          {
            error: 'No valid products found',
            message: 'Meta Commerce Manager requires non-empty CSV files. Please ensure there are valid estimates with posts and totals.',
            total: 0,
          },
          { status: 404 }
        )
      }
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
    // Meta rejects empty CSV files. Return an error response instead.
    return NextResponse.json(
      {
        error: 'Failed to generate catalog',
        message: 'An error occurred while generating the Meta catalog feed. Meta requires non-empty CSV files.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Generate CSV response for Meta Commerce Manager
 * Meta requires specific field order and format
 */
function generateCSVResponse(products: MetaCSVProduct[]): NextResponse {
  // Meta Commerce Manager CSV headers (required fields first)
  // Meta requires these fields in this exact order for best compatibility
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
    'internal_label', // Internal labels for organizing and filtering products
    'custom_label_0',
    'custom_label_1',
    'custom_label_2',
    'custom_label_3',
  ]

  // Validate each product before adding to CSV
  const validProducts = products.filter(product => {
    // Check all required fields
    const hasId = !!product.id && product.id.trim().length > 0
    const hasTitle = !!product.title && product.title.trim().length > 0
    const hasDescription = !!product.description && product.description.trim().length > 0
    const hasPrice = !!product.price && product.price.trim().length > 0
    const hasLink = !!product.link && product.link.startsWith('https://')
    const hasImageLink = !!product.image_link && product.image_link.startsWith('https://')
    
    if (!hasId || !hasTitle || !hasDescription || !hasPrice || !hasLink || !hasImageLink) {
      console.warn(`[Meta CSV Feed] Invalid product skipped:`, {
        id: product.id,
        hasId,
        hasTitle,
        hasDescription,
        hasPrice,
        hasLink,
        hasImageLink
      })
      return false
    }
    
    return true
  })

  // Create CSV rows
  const csvRows = [
    headers.join(','), // Header row
    ...validProducts.map(product => 
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
  
  console.log(`[Meta CSV Feed] Generated CSV with ${validProducts.length} valid products (${products.length - validProducts.length} filtered out)`)

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="meta-catalog-estimates.csv"',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*', // Allow Meta's crawler to access
    },
  })
}

