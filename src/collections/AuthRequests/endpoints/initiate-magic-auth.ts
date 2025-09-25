import { Endpoint } from 'payload'
import { z } from 'zod'
import { HMAC } from 'oslo/crypto'
import { generateHOTP } from 'oslo/otp'
import { addMinutes } from 'date-fns'

const bodySchema = z.object({
  email: z.string().email(),
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

    const { email } = body.data

    const secret = await new HMAC('SHA-1').generateKey()

    const code = await generateHOTP(secret, 10, 6)

    const authRequest = await req.payload.create({
      collection: 'authRequests',
      data: {
        email,
        code,
        expiresAt: addMinutes(new Date(), 15).toISOString(), // Code expires in 10 minutes
      },
    })

    return Response.json(
      {
        message: `Magic auth initiated for ${email}`,
        email,
        authRequestId: authRequest.id,
      },
      {
        status: 200,
      },
    )
  },
}
