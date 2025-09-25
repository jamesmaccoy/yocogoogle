import { CollectionConfig } from 'payload'
import { InitiateMagicAuth } from './endpoints/initiate-magic-auth'
import { VerifyCode } from './endpoints/verify-code'
import { sendMagicEmail } from './hooks/send-magic-email'
import { VerifyMagicToken } from './endpoints/verify-magic-token'
import { removeAuthRequest } from './hooks/remove-auth-request'

export const AuthRequests: CollectionConfig = {
  slug: 'authRequests', // changed from "auth-requests"
  admin: {
    hidden: true,
  },
  hooks: {
    afterChange: [sendMagicEmail],
    afterRead: [removeAuthRequest],
  },
  endpoints: [InitiateMagicAuth, VerifyCode, VerifyMagicToken],
  fields: [
    {
      name: 'email',
      type: 'email',
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
