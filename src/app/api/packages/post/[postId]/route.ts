import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { yocoService } from '@/lib/yocoService'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { postId } = await params
    
    // Get the post data to access packageSettings for custom names
    let postData = null
    try {
      postData = await payload.findByID({
        collection: 'posts',
        id: postId,
        depth: 1,
      })
    } catch (error) {
      // Don't log the full error to reduce noise, just continue without custom names
      console.log('Failed to fetch post data for custom names, continuing without custom names')
    }

    // Get packages from database
    const dbPackages = await payload.find({
      collection: 'packages',
      where: {
        post: { equals: postId },
        isEnabled: { equals: true }
      },
      depth: 2, // Increased depth to include related page data
    })

    // Get Yoco products
    const yocoProducts = await yocoService.getProducts()
    
    // Helper function to get custom name from packageSettings
    const getCustomName = (packageId: string) => {
      if (!postData?.packageSettings || !Array.isArray(postData.packageSettings)) {
        return null
      }
      const packageSetting = postData.packageSettings.find((setting: any) => {
        const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package
        return pkgId === packageId
      })
      return packageSetting?.customName || null
    }
    
    // Helper function to check DB package is enabled for this post
    const isDbPackageEnabledForPost = (packageId: string) => {
      if (!postData?.packageSettings || !Array.isArray(postData.packageSettings)) {
        return true // Default to enabled if no settings exist for DB packages
      }
      const packageSetting = postData.packageSettings.find((setting: any) => {
        const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package
        return pkgId === packageId
      })
      // If not configured, default to true for DB packages
      if (!packageSetting) return true
      return packageSetting?.enabled !== false // Default to true if not explicitly set to false
    }
    
    // Helper to check if a Yoco product is enabled for this post
    const isYocoEnabledForPost = (productId: string) => {
      if (!postData?.packageSettings || !Array.isArray(postData.packageSettings)) {
        return false // Default to disabled unless explicitly configured
      }
      const packageSetting = postData.packageSettings.find((setting: any) => {
        const pkgId = typeof setting.package === 'object' ? setting.package.id : setting.package
        return pkgId === productId
      })
      // Only enabled if explicitly present and not disabled
      if (!packageSetting) return false
      return packageSetting?.enabled !== false
    }

    // Convert Yoco period to nights
    const getNightsForProduct = (product: any) => {
      const count = Number(product.periodCount) || 1
      switch (product.period) {
        case 'hour':
          return 1
        case 'day':
          return count
        case 'week':
          return count * 7
        case 'month':
          return count * 30
        case 'year':
          return count * 365
        default:
          return count
      }
    }
    
    // Combine database packages with Yoco products
    const allPackages = [
      ...dbPackages.docs.map(pkg => {
        const customName = getCustomName(pkg.id)
        // Map revenueCatId to yocoId for backward compatibility
        // If yocoId exists, use it; otherwise fall back to revenueCatId
        const yocoId = (pkg as any).yocoId || pkg.revenueCatId
        return {
          id: pkg.id,
          name: customName || pkg.name, // Use custom name if available
          originalName: pkg.name, // Keep original name for reference
          description: pkg.description,
          multiplier: pkg.multiplier,
          category: pkg.category,
          minNights: pkg.minNights,
          maxNights: pkg.maxNights,
          revenueCatId: pkg.revenueCatId, // Keep for backward compatibility
          yocoId: yocoId, // Add yocoId field (maps from revenueCatId if not set)
          baseRate: pkg.baseRate,
          isEnabled: pkg.isEnabled && isDbPackageEnabledForPost(pkg.id),
          features: pkg.features?.map((f: any) => f.feature) || [],
          relatedPage: (pkg as any).relatedPage, // Include related page data
          source: 'database',
          hasCustomName: !!customName
        }
      }),
      ...yocoProducts.map(product => {
        const customName = getCustomName(product.id)
        const nights = getNightsForProduct(product)
        return {
          id: product.id,
          name: customName || product.title, // Use custom name if available
          originalName: product.title, // Keep original name for reference
          description: product.description,
          multiplier: 1, // Default multiplier for Yoco products
          category: product.category,
          minNights: nights,
          maxNights: nights,
          revenueCatId: product.id, // Keep for backward compatibility
          yocoId: product.id, // Yoco products use their own ID as yocoId
          baseRate: product.price,
          isEnabled: product.isEnabled && isYocoEnabledForPost(product.id),
          features: product.features,
          source: 'yoco',
          hasCustomName: !!customName
        }
      })
    ].filter(pkg => pkg.isEnabled) // Only include enabled packages

    const response = NextResponse.json({
      packages: allPackages,
      total: allPackages.length
    })

    // Add caching headers to prevent excessive API calls
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300') // Cache for 1 minute client-side, 5 minutes CDN
    response.headers.set('ETag', `packages-${postId}-${Date.now()}`)

    return response
  } catch (error) {
    console.error('Error fetching packages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch packages', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 