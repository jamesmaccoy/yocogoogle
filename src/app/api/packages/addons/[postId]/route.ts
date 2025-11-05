import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

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
      console.log('Failed to fetch post data for custom names, continuing without custom names')
    }

    // Get addon packages from database (filter by category 'addon')
    const dbPackages = await payload.find({
      collection: 'packages',
      where: {
        post: { equals: postId },
        isEnabled: { equals: true },
        category: { equals: 'addon' }
      },
      depth: 2, // Increased depth to include related page data
    })
    
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
    
    // Process addon packages
    const addonPackages = dbPackages.docs.map(pkg => {
      const customName = getCustomName(pkg.id)
      return {
        id: pkg.id,
        name: customName || pkg.name, // Use custom name if available
        originalName: pkg.name, // Keep original name for reference
        description: pkg.description,
        multiplier: pkg.multiplier,
        category: pkg.category,
        minNights: pkg.minNights,
        maxNights: pkg.maxNights,
        revenueCatId: pkg.revenueCatId,
        baseRate: pkg.baseRate,
        isEnabled: pkg.isEnabled && isDbPackageEnabledForPost(pkg.id),
        features: pkg.features?.map((f: any) => f.feature) || [],
        relatedPage: (pkg as any).relatedPage, // Include related page data
        source: 'database',
        hasCustomName: !!customName
      }
    }).filter(pkg => pkg.isEnabled) // Only include enabled packages

    const response = NextResponse.json({
      addons: addonPackages,
      total: addonPackages.length
    })

    // Add caching headers to prevent excessive API calls
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300') // Cache for 1 minute client-side, 5 minutes CDN
    response.headers.set('ETag', `addons-${postId}-${Date.now()}`)

    return response
  } catch (error) {
    console.error('Error fetching addon packages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch addon packages', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 