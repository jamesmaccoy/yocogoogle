import { Endpoint } from 'payload'
import { z } from 'zod'
import { HMAC } from 'oslo/crypto'
import { generateHOTP } from 'oslo/otp'
import { addMinutes } from 'date-fns'

const bodySchema = z.object({
  mobile: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+[1-9]\d+$/, 'Mobile number must be in E.164 format (e.g. +27821234567)'),
})

export const InitiateMagicAuth: Endpoint = {
  method: 'post',
  path: '/magic',
  handler: async (req) => {
    const body = bodySchema.safeParse(await req.json?.())

    if (!body.success) {
      return Response.json(
        {
          message: 'Bad request',
          errors: body.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const { mobile } = body.data

    const secret = await new HMAC('SHA-1').generateKey()

    const code = await generateHOTP(secret, 10, 6)

    const authRequest = await req.payload.create({
      collection: 'authRequests',
      data: {
        mobile,
        code,
        expiresAt: addMinutes(new Date(), 15).toISOString(), // Code expires in 10 minutes
      },
    })

    return Response.json(
      {
        message: `OTP auth initiated for ${mobile}`,
        mobile,
        authRequestId: authRequest.id,
      },
      {
        status: 200,
      },
    )
  },
}
