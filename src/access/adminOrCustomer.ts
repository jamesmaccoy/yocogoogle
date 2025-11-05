import { User } from '@/payload-types'
import { Access } from 'payload'

export const adminOrCustomer: Access<User> = ({ req: { user } }) => {
  if (!user) return false

  if ((user as any)?.role?.includes('admin') || (user as any)?.role?.includes('customer')) {
    return true
  }

  return false
} 