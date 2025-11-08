import type { TaskHandler } from 'payload/types'

export const subscriptionDowngradeCheck: TaskHandler = async ({ req }) => {
  const payload = req.payload
  const now = new Date().toISOString()

  req.payload.logger.info('[jobs:subscriptionDowngradeCheck] Starting nightly downgrade audit')

  try {
    const expiredUsers = await payload.find({
      collection: 'users',
      req,
      where: {
        and: [
          {
            'subscriptionStatus.status': {
              equals: 'active',
            },
          },
          {
            'subscriptionStatus.expiresAt': {
              lessThan: now,
            },
          },
        ],
      },
      limit: 500,
    })

    req.payload.logger.info(
      `[jobs:subscriptionDowngradeCheck] Found ${expiredUsers.docs.length} users with expired subscriptions`,
    )

    for (const user of expiredUsers.docs) {
      await payload.update({
        collection: 'users',
        id: user.id,
        req,
        data: {
          subscriptionStatus: {
            status: 'none',
            plan: 'free',
            expiresAt: null,
          },
        },
      })
    }

    return {
      status: 'Success',
      message: `Processed ${expiredUsers.docs.length} expired subscriptions`,
    }
  } catch (error) {
    req.payload.logger.error('[jobs:subscriptionDowngradeCheck] Failed to process expired subscriptions', error)
    throw error
  }
}


