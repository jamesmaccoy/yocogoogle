import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { getMeUser } from '@/utilities/getMeUser'
import { Where } from 'payload'

export async function GET(request: NextRequest) {
  try {
    const { user } = await getMeUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') as 'upcoming' | 'past' | null

    const payload = await getPayload({ config: configPromise })

    let whereQuery: Where

    if (type === 'upcoming') {
      whereQuery = {
        and: [
          {
            fromDate: {
              greater_than_equal: new Date(),
            },
          },
          {
            or: [
              {
                customer: {
                  equals: user.id,
                },
              },
              {
                guests: {
                  contains: user.id,
                },
              },
            ],
          },
        ],
      }
    } else if (type === 'past') {
      whereQuery = {
        and: [
          {
            fromDate: {
              less_than: new Date(),
            },
          },
          {
            or: [
              {
                customer: {
                  equals: user.id,
                },
              },
              {
                guests: {
                  contains: user.id,
                },
              },
            ],
          },
        ],
      }
    } else {
      // Get all bookings
      whereQuery = {
        or: [
          {
            customer: {
              equals: user.id,
            },
          },
          {
            guests: {
              contains: user.id,
            },
          },
        ],
      }
    }

    const bookings = await payload.find({
      collection: 'bookings',
      limit: 100,
      where: whereQuery,
      depth: 2, // Include addonTransactions and their details
      sort: '-fromDate',
    })

    return NextResponse.json({ bookings: bookings.docs })
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

