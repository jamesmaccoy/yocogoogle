import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { transactionId, status = 'completed', force } = body

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
    }

    const transaction = await payload.findByID({
      collection: 'yoco-transactions',
      id: transactionId,
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const isOwner = typeof transaction.user === 'string' ? transaction.user === user.id : transaction.user?.id === user.id
    const isAdmin = Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin'

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to update this transaction' }, { status: 403 })
    }

    const now = new Date()
    let expiresAt: Date | undefined

    if (transaction.periodDays) {
      expiresAt = new Date(now.getTime() + Number(transaction.periodDays) * DAY_IN_MS)
    } else if (transaction.expiresAt) {
      expiresAt = new Date(transaction.expiresAt)
    }

    const updatedTransaction = await payload.update({
      collection: 'yoco-transactions',
      id: transactionId,
      data: {
        status,
        completedAt: now.toISOString(),
        expiresAt: expiresAt?.toISOString(),
      },
    })

    if (transaction.intent === 'subscription' && status === 'completed') {
      const plan = transaction.plan || (transaction.entitlement === 'pro' ? 'pro' : 'standard')

      await payload.update({
        collection: 'users',
        id: typeof transaction.user === 'string' ? transaction.user : transaction.user?.id,
        data: {
          subscriptionStatus: {
            status: 'active',
            plan,
            expiresAt: expiresAt?.toISOString(),
          },
          paymentValidation: {
            lastPaymentDate: now.toISOString(),
            paymentMethod: 'credit_card',
            paymentStatus: status,
          },
        },
      })
    } else if (status !== 'completed' && !force) {
      // Optionally handle downgrades or failed payments here
    }

    return NextResponse.json({ transaction: updatedTransaction })
  } catch (error) {
    console.error('Error updating Yoco transaction:', error)
    return NextResponse.json(
      { error: 'Failed to update transaction', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

