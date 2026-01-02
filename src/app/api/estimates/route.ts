import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { yocoService } from '@/lib/yocoService'
import type { Estimate } from '@/payload-types'
import { verifyJwtToken } from '@/utilities/token'
import { getServerSideURL } from '@/utilities/getURL'

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const searchParams = request.nextUrl.searchParams
    
    // Support both header-based auth and token-based auth (for Google Sheets)
    let isAuthorized = false
    let isAdmin = false
    let customerId: string | null = null
    let user = null
    
    // Try header-based authentication first
    try {
      const authResult = await payload.auth({ headers: request.headers })
      user = authResult.user
      if (user && (user as any).role?.includes('admin')) {
        isAuthorized = true
        isAdmin = true
      } else if (user) {
        isAuthorized = true
        customerId = user.id
      }
    } catch (error) {
      // Header auth failed, try token-based auth
    }
    
    // If not authorized via headers, try token query parameter (for Google Sheets)
    if (!isAuthorized) {
      const token = searchParams.get('token')
      if (token) {
        const decoded = verifyJwtToken<{ estimateId?: string; customerId?: string; admin?: boolean }>(token)
        if (decoded && decoded.admin) {
          isAuthorized = true
          isAdmin = true
        } else if (decoded && decoded.customerId) {
          // Allow customers to see their own estimates
          isAuthorized = true
          customerId = decoded.customerId
        }
      }
    }
    
    // Check for API key in environment (for Google Sheets access - admin only)
    if (!isAuthorized) {
      const apiKey = searchParams.get('apiKey')
      const expectedApiKey = process.env.ESTIMATES_EXPORT_API_KEY
      if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
        isAuthorized = true
        isAdmin = true
      }
    }
    
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const format = searchParams.get('format') || 'csv' // Default to CSV for Google Sheets
    const limit = parseInt(searchParams.get('limit') || '1000', 10)
    const depth = parseInt(searchParams.get('depth') || '2', 10)

    // Build where clause - filter by customer if not admin
    const where: any = {}
    if (!isAdmin && customerId) {
      where.customer = { equals: customerId }
    }

    // Fetch estimates with full depth to get customer and post details
    const estimates = await payload.find({
      collection: 'estimates',
      where: Object.keys(where).length > 0 ? where : undefined,
      limit,
      depth,
      sort: '-createdAt',
    })

    // Get base URL for constructing click-through URLs
    const baseUrl = getServerSideURL()

    // Helper function to truncate text for Google Ads (headlines max 30 chars, descriptions max 90 chars)
    const truncateText = (text: string, maxLength: number): string => {
      if (!text) return ''
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text
    }

    // Helper function to generate Google Ads headlines (max 30 characters each)
    const generateHeadlines = (postTitle: string, packageName: string, postMetaDesc?: string): string[] => {
      const headlines: string[] = []
      
      // Headline 1: Post title (truncated)
      if (postTitle) {
        headlines.push(truncateText(postTitle, 30))
      }
      
      // Headline 2: Package name if available
      if (packageName && packageName !== postTitle) {
        headlines.push(truncateText(packageName, 30))
      }
      
      // Headline 3: "Complete Your Booking"
      headlines.push('Complete Your Booking')
      
      // Headline 4: "Reserve Your Stay"
      headlines.push('Reserve Your Stay')
      
      // Headline 5: "Book Now - Special Rate"
      headlines.push('Book Now - Special Rate')
      
      // Headline 6: Post title + "Available"
      if (postTitle) {
        const available = truncateText(`${postTitle} Available`, 30)
        if (available !== headlines[0]) {
          headlines.push(available)
        }
      }
      
      return headlines.slice(0, 15) // Google Ads allows up to 15 headlines
    }

    // Helper function to generate Google Ads descriptions (max 90 characters each)
    const generateDescriptions = (
      postMetaDesc: string | null | undefined,
      packageDesc: string | null | undefined,
      postTitle: string,
      packageName: string,
      total: number
    ): string[] => {
      const descriptions: string[] = []
      
      // Description 1: Meta description if available
      if (postMetaDesc) {
        descriptions.push(truncateText(postMetaDesc, 90))
      }
      
      // Description 2: Package description if available
      if (packageDesc && packageDesc !== postMetaDesc) {
        descriptions.push(truncateText(packageDesc, 90))
      }
      
      // Description 3: Generic booking message
      descriptions.push('Continue your booking and secure your stay. Complete your reservation today.')
      
      // Description 4: Price-focused message
      if (total > 0) {
        const formattedTotal = new Intl.NumberFormat('en-ZA', { 
          style: 'currency', 
          currency: 'ZAR' 
        }).format(total)
        descriptions.push(`Secure your booking for ${formattedTotal}. Don't miss out on this opportunity.`)
      }
      
      // Description 5: Urgency message
      descriptions.push('Your estimate is ready. Complete your booking now before availability changes.')
      
      // Description 6: Value proposition
      descriptions.push(`Experience ${postTitle}${packageName ? ` with ${packageName}` : ''}. Book now to confirm.`)
      
      return descriptions.slice(0, 4) // Google Ads allows up to 4 descriptions
    }

    // Transform estimates to include flattened customer and post data
    const transformedEstimates = estimates.docs.map((estimate: any) => {
      const customer = typeof estimate.customer === 'object' ? estimate.customer : null
      const post = typeof estimate.post === 'object' ? estimate.post : null
      const selectedPackage = estimate.selectedPackage
      const packageData = selectedPackage?.package && typeof selectedPackage.package === 'object' 
        ? selectedPackage.package 
        : null

      // Construct click-through URL for Google Ads retargeting
      const postSlug = post?.slug || ''
      const estimateId = estimate.id || ''
      const clickThroughUrl = postSlug && estimateId 
        ? `${baseUrl}/posts/${postSlug}?restoreEstimate=${estimateId}`
        : ''

      // Get post and package data for ad copy
      const postTitle = post?.title || ''
      const postMetaDesc = post?.meta?.description || null
      const packageName = packageData?.name || selectedPackage?.customName || ''
      const packageDesc = packageData?.description || null
      const total = estimate.total || 0

      // Generate Google Ads assets
      const headlines = generateHeadlines(postTitle, packageName, postMetaDesc || undefined)
      const descriptions = generateDescriptions(postMetaDesc, packageDesc, postTitle, packageName, total)

      return {
        id: estimate.id,
        title: estimate.title || '',
        customerId: typeof estimate.customer === 'string' ? estimate.customer : estimate.customer?.id || '',
        customerName: customer?.name || estimate.customerName || '',
        customerEmail: customer?.email || estimate.customerEmail || '',
        postId: typeof estimate.post === 'string' ? estimate.post : estimate.post?.id || '',
        postTitle: postTitle,
        postSlug: postSlug,
        postMetaDescription: postMetaDesc || '',
        clickThroughUrl: clickThroughUrl,
        // Google Ads Assets
        finalUrl: clickThroughUrl, // Google Ads uses "Final URL" field
        headline1: headlines[0] || '',
        headline2: headlines[1] || '',
        headline3: headlines[2] || '',
        headline4: headlines[3] || '',
        headline5: headlines[4] || '',
        headline6: headlines[5] || '',
        headline7: headlines[6] || '',
        headline8: headlines[7] || '',
        headline9: headlines[8] || '',
        headline10: headlines[9] || '',
        headline11: headlines[10] || '',
        headline12: headlines[11] || '',
        headline13: headlines[12] || '',
        headline14: headlines[13] || '',
        headline15: headlines[14] || '',
        description1: descriptions[0] || '',
        description2: descriptions[1] || '',
        description3: descriptions[2] || '',
        description4: descriptions[3] || '',
        fromDate: estimate.fromDate || '',
        toDate: estimate.toDate || '',
        guests: Array.isArray(estimate.guests) 
          ? estimate.guests.map((g: any) => typeof g === 'object' ? g.email || g.name || g.id : g).join('; ')
          : '',
        total: total,
        packageType: estimate.packageType || '',
        packageName: packageName,
        packageId: packageData?.id || '',
        packageDescription: packageDesc || '',
        paymentStatus: estimate.paymentStatus || 'unpaid',
        status: estimate.status || 'pending',
        requestType: estimate.requestType || 'initial',
        createdAt: estimate.createdAt || '',
        updatedAt: estimate.updatedAt || '',
        notes: estimate.notes || '',
      }
    })

    // Return CSV format for Google Sheets
    if (format === 'csv') {
      if (transformedEstimates.length === 0) {
        return new NextResponse('No estimates found', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="estimates.csv"',
          },
        })
      }

      // Get headers from first estimate (guaranteed to exist due to check above)
      const firstEstimate = transformedEstimates[0]
      if (!firstEstimate) {
        return new NextResponse('No estimates found', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="estimates.csv"',
          },
        })
      }
      const headers = Object.keys(firstEstimate)
      
      // Create CSV rows
      const csvRows = [
        headers.join(','), // Header row
        ...transformedEstimates.map(estimate => 
          headers.map(header => {
            const value = estimate[header as keyof typeof estimate] || ''
            // Escape commas and quotes in CSV values
            const stringValue = String(value)
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`
            }
            return stringValue
          }).join(',')
        )
      ]

      return new NextResponse(csvRows.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Return JSON format (default)
    return NextResponse.json({
      totalDocs: estimates.totalDocs,
      limit: estimates.limit,
      totalPages: estimates.totalPages,
      page: estimates.page,
      hasNextPage: estimates.hasNextPage,
      hasPrevPage: estimates.hasPrevPage,
      nextPage: estimates.nextPage,
      prevPage: estimates.prevPage,
      docs: transformedEstimates,
    })
  } catch (err) {
    console.error('Estimate export error:', err)
    return NextResponse.json(
      { error: (err instanceof Error ? err.message : 'Unknown error') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { postId, fromDate, toDate, guests, title, packageType, total, estimateId } = body

    const rawPackageType =
      typeof packageType === 'string' && packageType.trim().length > 0 ? packageType.trim() : null

    // If estimateId is provided, fetch the existing estimate to preserve package information
    let existingEstimate: any = null
    if (estimateId) {
      try {
        existingEstimate = await payload.findByID({
          collection: 'estimates',
          id: estimateId,
          depth: 1,
        })
        // Verify it belongs to the current user
        const estimateCustomerId = typeof existingEstimate.customer === 'string' ? existingEstimate.customer : existingEstimate.customer?.id
        if (estimateCustomerId !== user.id) {
          existingEstimate = null // Don't use if it doesn't belong to user
        }
      } catch (error) {
        console.warn('Could not fetch existing estimate:', error)
        existingEstimate = null
      }
    }

    // Use existing package info if available and no new packageType provided
    const effectivePackageType = rawPackageType || existingEstimate?.packageType || null

    if (!effectivePackageType) {
      return NextResponse.json({ error: 'packageType is required' }, { status: 400 })
    }

    console.log('Looking for package:', { postId, packageType: effectivePackageType, estimateId, hasExistingEstimate: !!existingEstimate })
    console.log('Package type (original):', effectivePackageType)
    console.log('Package type (lowercase):', effectivePackageType.toLowerCase())
    let pkg: any = null
    let multiplier = 1
    let customName: string | null = null // Store custom name from package settings

    // Get the post data to access packageSettings for custom names
    let postData: any = null
    try {
      postData = await payload.findByID({
        collection: 'posts',
        id: postId,
        depth: 1,
      })
    } catch (error) {
      console.log('Failed to fetch post data:', error)
    }

    // Initialize baseRate with post's baseRate or default
    let baseRate = postData?.baseRate || 150

    // Helper function to check if package is enabled for this post
    const isPackageEnabledForPost = (packageId: string) => {
      if (!postData?.packageSettings || !Array.isArray(postData.packageSettings)) {
        return true // Default to enabled if no settings exist
      }
      const packageSetting = postData.packageSettings.find((setting: any) => {
        const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package
        return pkgId === packageId
      })
      return packageSetting?.enabled !== false // Default to true if not explicitly set to false
    }

    // First, get all available packages for this post (including Yoco products)
    try {
      // Get database packages
      const dbPackages = await payload.find({
        collection: 'packages',
        where: {
          post: { equals: postId },
          isEnabled: { equals: true }
        },
        depth: 1,
      })

      // Get Yoco products
      const yocoProducts = await yocoService.getProducts()
      
      // Combine database packages with Yoco products
      const allPackages = [
        ...dbPackages.docs.map(pkg => {
          // Map revenueCatId to yocoId for backward compatibility
          const yocoId = (pkg as any).yocoId || pkg.revenueCatId
          return {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            multiplier: pkg.multiplier,
            category: pkg.category,
            minNights: pkg.minNights,
            maxNights: pkg.maxNights,
            revenueCatId: pkg.revenueCatId, // Keep for backward compatibility
            yocoId: yocoId, // Primary identifier for Yoco integration
            baseRate: pkg.baseRate,
            isEnabled: pkg.isEnabled && isPackageEnabledForPost(pkg.id),
            features: pkg.features?.map((f: any) => f.feature) || [],
            source: 'database'
          }
        }),
        ...yocoProducts.map(product => ({
          id: product.id,
          name: product.title,
          description: product.description,
          multiplier: 1, // Default multiplier for Yoco products
          category: product.category,
          minNights: product.period === 'hour' ? 1 : product.periodCount,
          maxNights: product.period === 'hour' ? 1 : product.periodCount,
          revenueCatId: product.id, // Keep for backward compatibility
          yocoId: product.id, // Yoco products use their own ID as yocoId
          baseRate: product.price,
          isEnabled: product.isEnabled && isPackageEnabledForPost(product.id),
          features: product.features,
          source: 'yoco'
        }))
      ].filter(pkg => pkg.isEnabled) // Only include enabled packages

      console.log('Available packages:', allPackages.map(p => ({ id: p.id, name: p.name, source: p.source, yocoId: (p as any).yocoId, revenueCatId: p.revenueCatId })))
      console.log('Looking for packageType:', effectivePackageType)

      // Find the package by ID, yocoId, or revenueCatId (works for both database and Yoco packages)
      // Use case-insensitive comparison for package lookup
      // Priority: id > yocoId > revenueCatId
      pkg = allPackages.find((p: any) => {
        const code = effectivePackageType.toLowerCase()
        return (
          p.id?.toString().toLowerCase() === code ||
          p.id === effectivePackageType ||
          (p.yocoId && p.yocoId.toString().toLowerCase() === code) ||
          (p.yocoId && p.yocoId === effectivePackageType) ||
          (p.revenueCatId && p.revenueCatId.toString().toLowerCase() === code) ||
          (p.revenueCatId && p.revenueCatId === effectivePackageType)
        )
      })
      
      if (pkg) {
        const matchedBy = 
          pkg.id === rawPackageType ? 'id' :
          (pkg as any).yocoId === rawPackageType ? 'yocoId' :
          pkg.revenueCatId === rawPackageType ? 'revenueCatId' :
          'case-insensitive'
        
        console.log('Found package:', {
          id: pkg.id,
          name: pkg.name,
          source: pkg.source,
          yocoId: (pkg as any).yocoId,
          revenueCatId: pkg.revenueCatId,
          packageType: effectivePackageType,
          matchedBy
        })
        multiplier = pkg.multiplier || 1
        baseRate = pkg.baseRate || 150
        
        // Check if there's a custom name in package settings
        if (postData?.packageSettings) {
          const packageSetting = postData.packageSettings.find((setting: any) => {
            const settingPackageId = typeof setting.package === 'object' ? setting.package.id : setting.package
            return settingPackageId === pkg.id
          })
          if (packageSetting?.customName) {
            customName = packageSetting.customName
          }
        }
      }
    } catch (error) {
      console.error('Error fetching packages:', error)
      // Continue with default values
    }

    // If not found, try database lookup by ID
    if (!pkg) {
      try {
        const packageResult = await payload.findByID({
          collection: 'packages',
          id: effectivePackageType,
        })
        
        if (packageResult && packageResult.post === postId) {
          pkg = {
            ...packageResult,
            source: 'database'
          }
          if (pkg) {
            multiplier = typeof pkg.multiplier === 'number' ? pkg.multiplier : 1
            baseRate = typeof pkg.baseRate === 'number' ? pkg.baseRate : (postData?.baseRate || 150)
            
            // Check for custom name in packageSettings
            if (postData?.packageSettings && Array.isArray(postData.packageSettings)) {
              const packageSetting = postData.packageSettings.find((setting: any) => {
                const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package
                return pkgId === pkg.id
              })
              if (packageSetting?.customName) {
                customName = packageSetting.customName
                console.log('Found custom name for package:', customName)
              }
            }
            
            console.log('Found package by ID in database:', customName || pkg.name)
          }
        }
      } catch (error) {
        console.log('Package not found by ID in database')
      }
    }

    // If not found by ID, try to find by name in database
    if (!pkg) {
      const packageResult = await payload.find({
        collection: 'packages',
        where: {
          post: { equals: postId },
          name: { equals: effectivePackageType },
          isEnabled: { equals: true }
        },
        limit: 1,
      })
      
      if (packageResult.docs.length > 0) {
        pkg = {
          ...packageResult.docs[0],
          source: 'database'
        }
        if (pkg) {
          multiplier = typeof pkg.multiplier === 'number' ? pkg.multiplier : 1
          baseRate = typeof pkg.baseRate === 'number' ? pkg.baseRate : (postData?.baseRate || 150)
          
          // Check for custom name in packageSettings
          if (postData?.packageSettings && Array.isArray(postData.packageSettings)) {
            const packageSetting = postData.packageSettings.find((setting: any) => {
              const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package
              return pkgId === pkg.id
            })
            if (packageSetting?.customName) {
              customName = packageSetting.customName
              console.log('Found custom name for package:', customName)
            }
          }
          
          console.log('Found package by name in database:', customName || pkg.name)
        }
      }
    }

    // If still not found, check Yoco products directly
    if (!pkg) {
      try {
        const yocoProducts = await yocoService.getProducts()
        const yocoProduct = yocoProducts.find(product => 
          product.id.toLowerCase() === effectivePackageType.toLowerCase() || 
          product.id === effectivePackageType
        )
        
        if (yocoProduct) {
          pkg = {
            id: yocoProduct.id,
            name: yocoProduct.title,
            description: yocoProduct.description,
            multiplier: 1, // Default multiplier for Yoco products
            baseRate: yocoProduct.price,
            category: yocoProduct.category,
            minNights: yocoProduct.period === 'hour' ? 1 : yocoProduct.periodCount,
            maxNights: yocoProduct.period === 'hour' ? 1 : yocoProduct.periodCount,
            revenueCatId: yocoProduct.id, // Keep for backward compatibility
            yocoId: yocoProduct.id, // Primary identifier
            isEnabled: yocoProduct.isEnabled && isPackageEnabledForPost(yocoProduct.id),
            features: yocoProduct.features,
            source: 'yoco'
          }
          multiplier = pkg.multiplier
          baseRate = pkg.baseRate
          
          // Check for custom name in packageSettings for Yoco products too
          if (postData?.packageSettings && Array.isArray(postData.packageSettings)) {
            const packageSetting = postData.packageSettings.find((setting: any) => {
              const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package
              return pkgId === pkg.id
            })
            if (packageSetting?.customName) {
              customName = packageSetting.customName
              console.log('Found custom name for Yoco package:', customName)
            }
          }
          
          console.log('Found Yoco product:', customName || pkg.name)
        }
      } catch (error) {
        console.error('Error fetching Yoco products:', error)
      }
    }

    // If package not found but we have existing estimate with package info, preserve it
    if (!pkg && existingEstimate) {
      console.log('Package not found, but preserving existing package info from estimate')
      // Use existing package information
      if (existingEstimate.selectedPackage && typeof existingEstimate.selectedPackage.package === 'object') {
        pkg = {
          id: existingEstimate.selectedPackage.package.id,
          name: existingEstimate.selectedPackage.customName || existingEstimate.selectedPackage.package.name,
          description: existingEstimate.selectedPackage.package.description,
          multiplier: existingEstimate.selectedPackage.package.multiplier || 1,
          baseRate: existingEstimate.selectedPackage.package.baseRate,
          source: 'database'
        }
        customName = existingEstimate.selectedPackage.customName || null
      } else if (existingEstimate.packageType) {
        // Fallback: use packageType as identifier
        pkg = {
          id: existingEstimate.packageType,
          name: existingEstimate.packageType,
          multiplier: 1,
          baseRate: postData?.baseRate || 150,
          source: 'unknown'
        }
      }
    }

    if (!pkg) {
      console.error('Package not found:', { packageType: effectivePackageType, postId, estimateId })
      return NextResponse.json({ 
        error: 'Package not found', 
        details: `Package ${effectivePackageType} not found in database or Yoco products for post ${postId}` 
      }, { status: 400 })
    }

    const duration = fromDate && toDate
      ? Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24)))
      : 1
    const calculatedTotal = total !== undefined ? Number(total) : baseRate * duration * multiplier

    // Use custom name if available, otherwise fall back to package name
    // For packageType, use yocoId if available, otherwise fall back to revenueCatId or id
    const packageTypeId = (pkg as any).yocoId || pkg.revenueCatId || pkg.id
    const displayName = customName || pkg.name || pkg.id
    // Use yocoId as canonical identifier, fallback to revenueCatId for backward compatibility, then id
    const canonicalPackageType = (pkg as any).yocoId || pkg.revenueCatId || pkg.id

    // Check for existing estimate - prioritize estimateId if provided, otherwise match by customer/post
    let estimateToUpdate: any = null
    
    if (estimateId && existingEstimate) {
      // Use the existing estimate found by ID
      estimateToUpdate = existingEstimate
    } else {
      // First try to find by dates (for exact matches)
      const existingByDates = await payload.find({
        collection: 'estimates',
        where: {
          post: { equals: postId },
          customer: { equals: user.id },
          fromDate: { equals: fromDate },
          toDate: { equals: toDate },
        },
        limit: 1,
      })
      if (existingByDates.docs.length && existingByDates.docs[0]) {
        estimateToUpdate = existingByDates.docs[0]
      } else {
        // If not found by dates, try to find by customer/post (for date updates)
        // Get the most recent estimate for this customer/post
        const existingByPost = await payload.find({
          collection: 'estimates',
          where: {
            post: { equals: postId },
            customer: { equals: user.id },
            paymentStatus: { not_equals: 'paid' }, // Only update unpaid estimates
          },
          sort: '-createdAt',
          limit: 1,
        })
        if (existingByPost.docs.length && existingByPost.docs[0]) {
          estimateToUpdate = existingByPost.docs[0]
          console.log('Found existing estimate by customer/post for date update:', estimateToUpdate.id)
        }
      }
    }

    let estimate: any
    if (estimateToUpdate) {
      // Update existing estimate
      const updateData: any = {
        total: calculatedTotal,
        guests: guests !== undefined ? guests : estimateToUpdate.guests,
        fromDate,
        toDate,
        customer: user.id,
        packageType: canonicalPackageType,
      }

      // Preserve or update selectedPackage
      if (pkg.source === 'database') {
        console.log('Adding/updating selectedPackage relationship for database package:', pkg.id)
        updateData.selectedPackage = {
          package: pkg.id,
          customName: displayName,
          enabled: true
        }
      } else if (pkg.source === 'yoco') {
        // For Yoco packages, preserve existing selectedPackage if it exists, or create minimal one
        if (estimateToUpdate.selectedPackage) {
          // Keep existing selectedPackage but update customName if we have one
          updateData.selectedPackage = {
            ...estimateToUpdate.selectedPackage,
            customName: displayName || estimateToUpdate.selectedPackage.customName,
          }
        } else {
          // Create minimal selectedPackage for Yoco product
          updateData.selectedPackage = {
            enabled: true,
            customName: displayName,
          }
        }
        console.log('Preserving/updating selectedPackage for Yoco package:', pkg.id)
      } else {
        // Unknown source - preserve existing if available
        if (estimateToUpdate.selectedPackage) {
          updateData.selectedPackage = estimateToUpdate.selectedPackage
        }
        console.log('Preserving existing selectedPackage for unknown source package')
      }

      estimate = await payload.update({
        collection: 'estimates',
        id: estimateToUpdate.id,
        data: updateData,
        user: user
      })
    } else {
      // Create
      const createData: any = {
        title: title || `Estimate for ${postId}`,
        post: postId,
        fromDate,
        toDate,
        guests,
        total: calculatedTotal,
        customer: user.id,
        packageType: canonicalPackageType,
      }

      // Only add selectedPackage if it's a database package (has valid ObjectId)
      if (pkg.source === 'database') {
        console.log('Adding selectedPackage relationship for database package:', pkg.id)
        createData.selectedPackage = {
          package: pkg.id,
          customName: displayName,
          enabled: true
        }
      } else {
        console.log('Skipping selectedPackage relationship for Yoco package:', pkg.id, 'source:', pkg.source)
      }

      estimate = await payload.create({
        collection: 'estimates',
        data: createData,
        user: user
      })
    }

    const responseEstimate = {
      ...estimate,
      packageLabel: displayName, // Include display name (custom name or package name) for frontend
    }

    return NextResponse.json(responseEstimate, { status: estimateToUpdate ? 200 : 201 })
  } catch (err) {
    console.error('Estimate creation error:', err)
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Unknown error') }, { status: 500 })
  }
}