import { describe, it, expect, vi, afterEach } from 'vitest'

import { checkAvailability } from '../endpoints/check-availability'
import { checkAvailabilityHook } from '../hooks/checkAvailability'

afterEach(() => {
  vi.restoreAllMocks()
})

const defaultQuery = {
  postId: 'post-123',
  startDate: '2025-09-04T13:34:24.736Z',
  endDate: '2025-09-06T13:34:24.736Z',
}

const buildEndpointReq = (
  overrides: Partial<typeof defaultQuery & { bookingId?: string }> = {},
  docs: unknown[] = [],
) =>
  ({
    query: { ...defaultQuery, ...overrides },
    payload: {
      find: vi.fn().mockResolvedValue({ docs }),
    },
  }) as unknown as Parameters<typeof checkAvailability.handler>[0]

describe('checkAvailability endpoint', () => {
  it('queries bookings using strict date overlap guards so back-to-back stays remain available', async () => {
    const req = buildEndpointReq()
    const response = await checkAvailability.handler(req)

    expect(req.payload.find).toHaveBeenCalledWith({
      collection: 'bookings',
      where: {
        and: [
          { post: { equals: defaultQuery.postId } },
          { fromDate: { less_than: '2025-09-06' } },
          { toDate: { greater_than: '2025-09-04' } },
        ],
      },
      limit: 1,
      select: {
        slug: true,
      },
      depth: 0,
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.isAvailable).toBe(true)
  })

  it('excludes the current booking when bookingId is provided', async () => {
    const bookingId = 'booking-1'
    const req = buildEndpointReq({ bookingId }, [])
    const response = await checkAvailability.handler(req)

    expect(req.payload.find).toHaveBeenCalledWith({
      collection: 'bookings',
      where: {
        and: [
          { post: { equals: defaultQuery.postId } },
          { fromDate: { less_than: '2025-09-06' } },
          { toDate: { greater_than: '2025-09-04' } },
          { id: { not_equals: bookingId } },
        ],
      },
      limit: 1,
      select: {
        slug: true,
      },
      depth: 0,
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.isAvailable).toBe(true)
  })
})

describe('checkAvailabilityHook', () => {
  const baseData = {
    fromDate: '2025-09-04',
    toDate: '2025-09-06',
    post: 'post-123',
  }

  const buildHookArgs = (docs: unknown[] = []) =>
    ({
      data: baseData,
      req: {
        payload: {
          find: vi.fn().mockResolvedValue({ docs }),
        },
      },
      operation: 'create',
    }) as Parameters<typeof checkAvailabilityHook>[0]

  it('queries using strict inequality guards to allow adjacent bookings', async () => {
    const args = buildHookArgs()
    await expect(checkAvailabilityHook(args)).resolves.toEqual(baseData)

    expect(args.req.payload.find).toHaveBeenCalledWith({
      collection: 'bookings',
      where: {
        and: [
          { post: { equals: baseData.post } },
          { fromDate: { less_than: baseData.toDate } },
          { toDate: { greater_than: baseData.fromDate } },
        ],
      },
      limit: 10,
      select: {
        slug: true,
        fromDate: true,
        toDate: true,
        title: true,
        id: true,
      },
      depth: 0,
      req: args.req,
    })
  })

  it('throws when overlapping bookings are returned', async () => {
    const args = buildHookArgs([{ id: 'booking-1' }])
    await expect(checkAvailabilityHook(args)).rejects.toThrow('Booking dates are not available.')
  })
})


