import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers: request.headers })

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const limit = Number(request.nextUrl.searchParams.get('limit') || 25)

    const transactions = await payload.find({
      collection: 'yoco-transactions',
      where: {
        user: {
          equals: user.id,
        },
      },
      sort: '-createdAt',
      limit,
    })

    return NextResponse.json({ transactions: transactions.docs })
  } catch (error) {
    console.error('Error fetching Yoco transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

