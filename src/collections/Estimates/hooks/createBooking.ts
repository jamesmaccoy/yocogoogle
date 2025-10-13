import { CollectionAfterChangeHook } from 'payload'

export const createBookingHook: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req: { payload },
  req,
}) => {
  if (doc.paymentStatus === 'paid' && previousDoc?.paymentStatus !== 'paid') {
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
        packageType: doc.packageType,
        paymentStatus: 'paid',
        selectedPackage: doc.selectedPackage,
        slug: doc.slug,
      },
      req,
    })
  }

  return doc
}
