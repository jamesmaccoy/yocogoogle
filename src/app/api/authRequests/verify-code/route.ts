import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

const SECRET_KEY = process.env.PAYLOAD_SECRET || process.env.JWT_SECRET || 'your-secret-key'

export async function POST(request: NextRequest) {
	try {
		const { email, otp, requestId } = await request.json()

		if (!email || !otp || !requestId) {
			return NextResponse.json({ error: 'Missing email, otp, or requestId' }, { status: 400 })
		}

		// Verify the request token and OTP
		let decoded: any
		try {
			decoded = jwt.verify(requestId, SECRET_KEY)
		} catch (e) {
			return NextResponse.json({ error: 'Invalid or expired request' }, { status: 400 })
		}

		if (!decoded || decoded.email !== email || decoded.code !== otp) {
			return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
		}

		// Log the user in via Payload to get an auth token cookie
		const payload = await getPayload({ config: configPromise })

		// Ensure user exists
		const users = await payload.find({
			collection: 'users',
			where: { email: { equals: email } },
			limit: 1,
		})
		if (!users?.docs?.length) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 })
		}

		const userDoc = users.docs?.[0]
		if (!userDoc) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 })
		}

		// Set a temporary password and perform a standard login to obtain a session token
		const tempPassword = randomUUID()
		await payload.update({
			collection: 'users',
			id: userDoc.id,
			data: { password: tempPassword },
			overrideAccess: true,
		})

		const { token } = await payload.login({
			collection: 'users',
			data: { email, password: tempPassword },
		})

		if (!token) {
			return NextResponse.json({ error: 'Failed to generate session' }, { status: 500 })
		}

		const response = NextResponse.json({ message: 'Login successful' })
		response.cookies.set('payload-token', token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 7,
		})

		return response
	} catch (error) {
		console.error('Error verifying magic code:', error)
		return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
	}
} 