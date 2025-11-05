import { adminOrSelfField } from '@/access/adminOrSelfField'
import { isAdmin } from '@/access/isAdmin'
import { isAdminField } from '@/access/isAdminField'
import { slugField } from '@/fields/slug'
import type { CollectionConfig } from 'payload'
import { adminOrSelfOrGuests } from '../Bookings/access/adminOrSelfOrGuests'
import { generateJwtToken, verifyJwtToken } from '@/utilities/token'

export const Estimate: CollectionConfig = {
  slug: 'estimates',
  labels: {
    singular: 'Estimate',
    plural: 'Estimates',
  },
  typescript: {
    interface: 'Estimate',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['customer', 'post', 'fromDate', 'toDate', 'guests'],
  },
  endpoints: [
    // This endpoint is used to generate a token for the estimate
    // and return it to the customer
    {
      path: '/:estimateId/token',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json(
            {
              message: 'Unauthorized',
            },
            { status: 401 },
          )
        }

        const _estimateId =
          req.routeParams && 'estimateId' in req.routeParams && req.routeParams.estimateId

        if (!_estimateId || typeof _estimateId !== 'string') {
          return Response.json(
            {
              message: 'Estimate ID not provided',
            },
            { status: 400 },
          )
        }

        try {
          // Use findOneAndUpdate to handle concurrent requests
          const estimate = await req.payload.findByID({
            collection: 'estimates',
            id: _estimateId,
          })

          if (!estimate) {
            return Response.json(
              {
                message: 'Estimate not found',
              },
              { status: 404 },
            )
          }

          // Check if user is authorized
          if (
            typeof estimate.customer === 'string'
              ? estimate.customer !== req.user.id
              : estimate.customer?.id !== req.user.id
          ) {
            return Response.json(
              {
                message: 'Unauthorized',
              },
              { status: 401 },
            )
          }

          // If estimate already has a token, return it
          if (estimate.token) {
            return Response.json({
              token: estimate.token,
            })
          }

          // Generate new token
          const token = generateJwtToken({
            estimateId: estimate.id,
            customerId:
              typeof estimate.customer === 'string' ? estimate.customer : estimate.customer?.id,
          })

          // Update estimate with new token
          await req.payload.update({
            collection: 'estimates',
            id: _estimateId,
            data: {
              token,
            },
          })

          return Response.json({
            token,
          })
        } catch (error) {
          console.error('Error generating token:', error)
          return Response.json(
            {
              message: 'Failed to generate token',
            },
            { status: 500 },
          )
        }
      },
    },
    // This endpoint is used to accept the invite for the estimate
    // and add the user to the guests list
    {
      path: '/:estimateId/accept-invite/:token',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json(
            {
              message: 'Unauthorized',
            },
            { status: 401 },
          )
        }

        const _estimateId =
          req.routeParams && 'estimateId' in req.routeParams && req.routeParams.estimateId

        if (!_estimateId || typeof _estimateId !== 'string') {
          return Response.json(
            {
              message: 'Estimate ID not provided',
            },
            { status: 400 },
          )
        }

        const _token = req.routeParams && 'token' in req.routeParams && req.routeParams.token

        if (!_token || typeof _token !== 'string') {
          return Response.json(
            {
              message: 'Token not provided',
            },
            { status: 400 },
          )
        }

        const estimates = await req.payload.find({
          collection: 'estimates',
          where: {
            and: [
              {
                id: {
                  equals: _estimateId,
                },
              },
              {
                token: {
                  equals: _token,
                },
              },
            ],
          },
          limit: 1,
          pagination: false,
        })

        if (estimates.docs.length === 0) {
          return Response.json(
            {
              message: 'Estimate not found',
            },
            { status: 404 },
          )
        }

        const estimate = estimates.docs[0]

        if (!estimate) {
          return Response.json(
            {
              message: 'Estimate not found',
            },
            { status: 404 },
          )
        }

        if (
          estimate.guests?.some((guest) =>
            typeof guest === 'string' ? guest === req.user?.id : guest.id === req.user?.id,
          ) ||
          (typeof estimate.customer === 'string'
            ? estimate.customer === req.user.id
            : estimate.customer?.id === req.user.id)
        ) {
          return Response.json({
            message: 'User already in estimate',
          })
        }

        await req.payload.update({
          collection: 'estimates',
          id: _estimateId,
          data: {
            guests: [...(estimate.guests || []), req.user.id],
          },
        })

        return Response.json({
          message: 'Estimate updated',
        })
      },
    },
  ],
  access: {
    create: ({ req: { user } }) => {
      if (!user) return false
      const roles = (user as any).role || []
      return roles.includes('admin') || roles.includes('customer')
    },
    read: ({ req: { user } }) => {
      if (!user) return false
      if ((user as any).role?.includes('admin')) return true
      if ((user as any).role?.includes('customer')) {
        return { customer: { equals: user.id } }
      }
      return false
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if ((user as any).role?.includes('admin')) return true
      if ((user as any).role?.includes('customer')) {
        return { customer: { equals: user.id } }
      }
      return false
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if ((user as any).role?.includes('admin')) return true
      if ((user as any).role?.includes('customer')) {
        return { customer: { equals: user.id } }
      }
      return false
    },
  },
  fields: [
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'token',
      label: 'Token',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
        hidden: true,
      },
    },
    {
      name: 'guests',
      type: 'relationship',
      hasMany: true,
      relationTo: 'users',
      access: {
        update: adminOrSelfField('customer'),
      },
      admin: {
        isSortable: true,
      },
    },
    {
      name: 'total',
      type: 'number',
      required: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'selectedPackage',
      type: 'group',
      fields: [
        {
          name: 'package',
          type: 'relationship',
          relationTo: 'packages',
          required: false,
        },
        {
          name: 'customName',
          type: 'text',
          required: false,
        },
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
    ...slugField('title', {
      checkboxOverrides: {
        access: {
          update: isAdminField,
        },
      },
      slugOverrides: {
        access: {
          update: isAdminField,
        },
      },
    }),
    {
      name: 'post',
      relationTo: 'posts',
      type: 'relationship',
      required: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'paymentStatus',
      label: 'Payment Status',
      type: 'select',
      admin: {
        position: 'sidebar',
      },
      options: [
        {
          label: 'Paid',
          value: 'paid',
        },
        {
          label: 'Unpaid',
          value: 'unpaid',
        },
      ],
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'fromDate',
      type: 'date',
      required: true,
      index: true,
      label: 'Check-in Date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'toDate',
      type: 'date',
      required: true,
      label: 'Check-out Date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'packageType',
      type: 'text',
      required: false,
      admin: {
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && !data.token) {
          const token = generateJwtToken({
            estimateId: data.id || '',
            customerId: data.customer || '',
          })
          return { ...data, token }
        }
        return data
      },
    ],
  },
} 