import { CollectionConfig } from 'payload'
import { InitiateMagicAuth } from './endpoints/initiate-magic-auth'
import { VerifyCode } from './endpoints/verify-code'
import { removeAuthRequest } from './hooks/remove-auth-request'

export const AuthRequests: CollectionConfig = {
  slug: 'authRequests', // changed from "auth-requests"
  admin: {
    hidden: true,
  },
  hooks: {
    afterRead: [removeAuthRequest],
  },
  endpoints: [InitiateMagicAuth, VerifyCode],
  fields: [
    {
      name: 'mobile',
      type: 'text',
      required: true,
    },
    {
      name: 'code',
      type: 'text',
      required: true,
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
    },
  ],
}
