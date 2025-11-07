import type { CollectionConfig } from 'payload'
import { isAdmin } from '../../access/isAdmin'

export const YocoTransactions: CollectionConfig = {
  slug: 'yoco-transactions',
  admin: {
    useAsTitle: 'packageName',
    defaultColumns: ['user', 'packageName', 'status', 'amount', 'intent', 'entitlement', 'expiresAt'],
  },
  access: {
    create: () => true,
    read: ({ req }) => {
      const role = req.user?.role
      const isAdminRole = Array.isArray(role) ? role.includes('admin') : role === 'admin'
      if (isAdminRole) return true
      if (!req.user) return false
      return {
        user: {
          equals: req.user.id,
        },
      }
    },
    update: ({ req }) => {
      const role = req.user?.role
      const isAdminRole = Array.isArray(role) ? role.includes('admin') : role === 'admin'
      if (isAdminRole) return true
      if (!req.user) return false
      return {
        user: {
          equals: req.user.id,
        },
      }
    },
    delete: isAdmin,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'intent',
      type: 'select',
      options: [
        { label: 'Booking', value: 'booking' },
        { label: 'Subscription', value: 'subscription' },
        { label: 'Product', value: 'product' },
      ],
      defaultValue: 'product',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      defaultValue: 'pending',
      required: true,
    },
    {
      name: 'productId',
      type: 'text',
    },
    {
      name: 'packageName',
      type: 'text',
      required: true,
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      admin: {
        step: 0.01,
      },
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'ZAR',
    },
    {
      name: 'paymentLinkId',
      type: 'text',
    },
    {
      name: 'paymentUrl',
      type: 'text',
    },
    {
      name: 'entitlement',
      type: 'select',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Standard', value: 'standard' },
        { label: 'Pro', value: 'pro' },
      ],
      defaultValue: 'none',
    },
    {
      name: 'plan',
      type: 'select',
      options: [
        { label: 'Free', value: 'free' },
        { label: 'Standard', value: 'standard' },
        { label: 'Pro', value: 'pro' },
      ],
    },
    {
      name: 'periodDays',
      type: 'number',
      admin: {
        step: 1,
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}

export default YocoTransactions

