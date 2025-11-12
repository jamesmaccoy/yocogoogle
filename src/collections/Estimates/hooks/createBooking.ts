import { CollectionAfterChangeHook } from 'payload'

export const createBookingHook: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req: { payload },
  req,
}) => {
  if (doc.paymentStatus === 'paid' && previousDoc?.paymentStatus !== 'paid') {
    // Resolve package information and custom name from packageSettings
    let resolvedSelectedPackage = doc.selectedPackage
    let resolvedPackageType = doc.packageType

    if (doc.packageType && doc.post) {
      try {
        const postId = typeof doc.post === 'string' ? doc.post : doc.post.id
        const postData = await payload.findByID({
          collection: 'posts',
          id: postId,
          depth: 1,
        })

        if (postData?.packageSettings && Array.isArray(postData.packageSettings)) {
          // Get database packages for this post
          const dbPackages = await payload.find({
            collection: 'packages',
            where: {
              post: { equals: postId },
              isEnabled: { equals: true }
            },
            depth: 1,
          })

          // Find the package that matches the packageType
          const code = doc.packageType.toLowerCase()
          const matchedDbPackage = dbPackages.docs.find((pkg: any) => {
            const pkgId = pkg.id?.toString().toLowerCase()
            const revenueCatId = pkg.revenueCatId?.toString().toLowerCase()
            const yocoId = (pkg.yocoId || pkg.revenueCatId)?.toString().toLowerCase()
            return pkgId === code || revenueCatId === code || yocoId === code
          })

          if (matchedDbPackage) {
            resolvedPackageType = matchedDbPackage.id

            // Get custom name from packageSettings
            const packageSetting = postData.packageSettings.find((setting: any) => {
              const settingPackageId = typeof setting.package === 'object' ? setting.package.id : setting.package
              return settingPackageId === matchedDbPackage.id
            })

            const customName = packageSetting?.customName || null

            // Build resolved selectedPackage with database package relationship
            resolvedSelectedPackage = {
              package: matchedDbPackage.id,
              customName: customName,
              enabled: true,
            }
          }
        }
      } catch (error) {
        console.warn('Could not resolve package information in createBooking hook:', error)
        // Fall back to doc's selectedPackage if available
        if (!resolvedSelectedPackage && doc.selectedPackage) {
          resolvedSelectedPackage = doc.selectedPackage
        }
      }
    }

    await payload.create({
      collection: 'bookings',
      data: {
        fromDate: doc.fromDate,
        toDate: doc.toDate,
        customer: doc.customer,
        post: doc.post,
        title: doc.title,
        total: doc.total,
        guests: doc.guests,
        packageType: resolvedPackageType || doc.packageType,
        paymentStatus: 'paid',
        selectedPackage: resolvedSelectedPackage || doc.selectedPackage,
        slug: doc.slug,
      },
      req,
    })
  }

  return doc
}
