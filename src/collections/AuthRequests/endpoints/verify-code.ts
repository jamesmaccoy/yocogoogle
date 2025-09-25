import { cookies } from 'next/headers'
import { Endpoint } from 'payload'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

const bodySchema = z.object({
  email: z.string().email(),
  requestId: z.string(),
  otp: z.string().min(6).max(6),
})

export const VerifyCode: Endpoint = {
  method: 'post',
  path: '/verify-code',
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

    const { email, requestId, otp } = body.data

    const authRequest = await req.payload.findByID({
      id: requestId,
      collection: 'authRequests',
    })

    if (!authRequest) {
      return Response.json(
        {
          message: 'Invalid or expired request',
        },
        { status: 400 },
      )
    }

    if (
      authRequest.code !== otp ||
      new Date(authRequest.expiresAt) < new Date() ||
      authRequest.email !== email
    ) {
      return Response.json(
        {
          message: 'Invalid or expired OTP',
        },
        { status: 400 },
      )
    }

    // Otp is valid, proceed with authentication

    const users = await req.payload.find({
      collection: 'users',
      where: {
        email: {
          equals: email,
        },
      },
      pagination: false,
      limit: 1,
    })

    let user = users.docs[0]

    if (!user) {
      user = await req.payload.create({
        collection: 'users',
        data: {
          email,
          password: crypto.randomBytes(16).toString('hex'), // Generate a random password
          name: email.split('@')[0], // Use email prefix as name
        },
      })
    }

    const collectionConfig = req.payload.collections['users']?.config
    if (!collectionConfig) {
      throw new Error('Users collection config not found')
    }

    const tokenPayload = {
      email,
      id: user.id,
      collection: collectionConfig.slug,
    }

    const token = jwt.sign(tokenPayload, req.payload.secret, {
      expiresIn: collectionConfig.auth.tokenExpiration,
    })

    const cookieStore = await cookies()

    cookieStore.set(`${req.payload.config.cookiePrefix}-token`, token, {
      path: '/',
      httpOnly: true,
      maxAge: collectionConfig.auth.tokenExpiration,
      secure: collectionConfig.auth.cookies.secure,
      sameSite:
        typeof collectionConfig.auth.cookies.sameSite === 'string'
          ? (collectionConfig.auth.cookies.sameSite.toLowerCase() as 'lax' | 'strict' | 'none')
          : collectionConfig.auth.cookies.sameSite,
      domain: collectionConfig.auth.cookies.domain,
    })

    return Response.json(
      {
        message: 'OTP verified successfully',
      },
      { status: 200 },
    )
  },
}
