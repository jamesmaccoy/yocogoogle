import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'

/**
 * Meta Commerce Manager Destinations Catalog CSV Feed for Estimates
 * Generates a CSV file compatible with Meta Commerce Manager Destinations catalog format
 * 
 * Usage:
 * - For all estimates: /api/meta-catalog/estimates-csv?format=csv
 * - For specific user: /api/meta-catalog/estimates-csv?userId=[user-id]&format=csv
 * - For Google Sheets: Import this CSV URL directly into Google Sheets
 * - For Meta: Upload CSV file or use scheduled feed URL
 * 
 * Meta Destinations Catalog Required Fields:
 * - destination_id: Unique identifier for the destination
 * - name: Destination name
 * - address: Full address (street, city, state, postal code, country)
 * - url: Website link to the destination
 * - image: Image URL
 * - type: Destination type (e.g., "hotel", "accommodation")
 * - product_tags: Comma-separated tags (format: "tag1,tag2,tag3")
 * 
 * Meta accepts CSV, TSV, XML (RSS/ATOM), or XLSX files up to 4 GB
 * See: https://www.facebook.com/business/help/384041892421495
 */

interface MetaDestination {
  destination_id: string
  name: string
  address: string
  url: string
  image: string
  type: string
  product_tags?: string // Comma-separated tags without spaces or special formatting
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

    // Transform estimates to Meta Destinations catalog format with validation
    const catalogDestinations: MetaDestination[] = estimates.docs
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
      .map((estimate): MetaDestination | null => {
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
        const packageName = (estimate as any).selectedPackage?.package && typeof (estimate as any).selectedPackage.package === 'object'
          ? ((estimate as any).selectedPackage.package as any).name || packageType
          : packageType

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

        // Build post URL - link to post page (not estimate, as destinations are properties)
        const postUrl = postSlug 
          ? `${request.nextUrl.origin}/${postSlug}`
          : `${request.nextUrl.origin}/post/${postId}`

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
        
        // Ensure link URL is absolute HTTPS (Meta requires valid URLs)
        let absoluteUrl = postUrl.startsWith('http')
          ? postUrl.replace(/^http:/, 'https:') // Force HTTPS
          : `https://${request.nextUrl.host}${postUrl.startsWith('/') ? postUrl : `/${postUrl}`}`
        
        // Validate link URL format
        if (!absoluteUrl.match(/^https:\/\/.+\..+/)) {
          console.warn(`Invalid URL for estimate ${estimateId}: ${absoluteUrl}`)
        }
        
        // Build destination name (required field)
        const destinationName = postTitle && postTitle.trim().length > 0
          ? postTitle.trim()
          : `Property ${postId || estimateId}`
        
        // Build address (required field) - using placeholder since address is not stored in Post
        // Format: "Street Address, City, State/Province, Postal Code, Country"
        // Note: If you need specific addresses, add an address field to the Post collection
        // For now, using a generic South African address format
        const address = `${postTitle || 'Property'}, South Africa`
        
        // Build product tags (comma-separated, no spaces, no special characters)
        // Format: "tag1,tag2,tag3" (no emojis or special formatting)
        const tags: string[] = []
        if (packageType) {
          // Clean package name - remove emojis and special characters
          const cleanPackageName = packageName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase()
          tags.push(`package-${cleanPackageName}`)
        }
        tags.push(`duration-${duration}`)
        if (postId) {
          tags.push(`post-${postId}`)
        }
        if (estimate.status) {
          tags.push(`status-${estimate.status}`)
        }
        if (estimate.paymentStatus) {
          tags.push(`payment-${estimate.paymentStatus}`)
        }
        const productTags = tags.join(',')
        
        // Validate all required fields before adding to catalog
        if (!estimateId || !destinationName || !address || !absoluteUrl || !absoluteImageUrl) {
          console.error(`Estimate ${estimateId} missing required fields:`, {
            destination_id: estimateId,
            name: destinationName,
            address,
            url: absoluteUrl,
            image: absoluteImageUrl
          })
          return null // Will be filtered out
        }

        return {
          destination_id: `estimate-${estimateId}`, // Unique identifier
          name: destinationName, // Required: destination name
          address: address, // Required: full address
          url: absoluteUrl, // Required: website link
          image: absoluteImageUrl, // Required: image URL
          type: 'accommodation', // Required: destination type
          product_tags: productTags, // Optional: comma-separated tags
        }
      })
      .filter((destination): destination is MetaDestination => destination !== null) // Remove any null destinations

    console.log(`[Meta CSV Feed] Generated ${catalogDestinations.length} valid destinations from ${estimates.docs.length} estimates`)

    // Return CSV format
    if (format === 'csv' || !format || format === '') {
      if (catalogDestinations.length === 0) {
        // Meta rejects empty CSV files. Return an error response instead.
        console.error('[Meta CSV Feed] No valid destinations generated - Meta requires non-empty CSV files')
        return NextResponse.json(
          {
            error: 'No valid destinations found',
            message: 'Meta Commerce Manager requires non-empty CSV files. Please ensure there are valid estimates with posts and totals.',
            total: 0,
          },
          { status: 404 }
        )
      }
      return generateDestinationsCSVResponse(catalogDestinations)
    }

    // Default: JSON format
    return NextResponse.json({
      destinations: catalogDestinations,
      total: catalogDestinations.length,
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
 * Generate CSV response for Meta Commerce Manager Destinations Catalog
 * Meta requires specific field order and format for Destinations catalog
 */
function generateDestinationsCSVResponse(destinations: MetaDestination[]): NextResponse {
  // Meta Destinations Catalog CSV headers (required fields first)
  // Required fields: destination_id, name, address, url, image, type
  // Optional fields: product_tags
  const headers = [
    'destination_id',
    'name',
    'address',
    'url',
    'image',
    'type',
    'product_tags',
  ]

  // Validate each destination before adding to CSV
  const validDestinations = destinations.filter(destination => {
    // Check all required fields
    const hasDestinationId = !!destination.destination_id && destination.destination_id.trim().length > 0
    const hasName = !!destination.name && destination.name.trim().length > 0
    const hasAddress = !!destination.address && destination.address.trim().length > 0
    const hasUrl = !!destination.url && destination.url.startsWith('https://')
    const hasImage = !!destination.image && destination.image.startsWith('https://')
    const hasType = !!destination.type && destination.type.trim().length > 0
    
    if (!hasDestinationId || !hasName || !hasAddress || !hasUrl || !hasImage || !hasType) {
      console.warn(`[Meta CSV Feed] Invalid destination skipped:`, {
        destination_id: destination.destination_id,
        hasDestinationId,
        hasName,
        hasAddress,
        hasUrl,
        hasImage,
        hasType
      })
      return false
    }
    
    return true
  })

  // Create CSV rows
  const csvRows = [
    headers.join(','), // Header row
    ...validDestinations.map(destination => 
      headers.map(header => {
        const value = destination[header as keyof MetaDestination] || ''
        // Escape commas, quotes, and newlines in CSV values
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      }).join(',')
    )
  ]

  // If no destinations, return header row only (Meta needs valid CSV format)
  const csvContent = csvRows.length > 1 ? csvRows.join('\n') : headers.join(',')
  
  console.log(`[Meta CSV Feed] Generated CSV with ${validDestinations.length} valid destinations (${destinations.length - validDestinations.length} filtered out)`)

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="meta-destinations-catalog.csv"',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*', // Allow Meta's crawler to access
    },
  })
}

