import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

const SECRET_KEY = process.env.PAYLOAD_SECRET || process.env.JWT_SECRET || 'your-secret-key'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const tokenParam = searchParams.get('token')
		if (!tokenParam) {
			return NextResponse.json({ error: 'Missing token' }, { status: 400 })
		}

		let decoded: any
		try {
			decoded = jwt.verify(tokenParam, SECRET_KEY)
		} catch (e) {
			return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
		}

		if (!decoded || !decoded.email || decoded.type !== 'magic') {
			return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
		}

		const email: string = decoded.email
		const payload = await getPayload({ config: configPromise })
		const users = await payload.find({
			collection: 'users',
			where: { email: { equals: email } },
			limit: 1,
		})
		if (!users?.docs?.length) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 })
		}

		// Set a temporary password and perform a standard login to obtain a session token
		const tempPassword = randomUUID()
		await payload.update({
			collection: 'users',
			id: users.docs[0].id,
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

		const response = NextResponse.redirect(new URL('/bookings', request.url))
		response.cookies.set('payload-token', token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 7,
		})
		return response
	} catch (error) {
		console.error('Error verifying magic link:', error)
		return NextResponse.json({ error: 'Magic link verification failed' }, { status: 500 })
	}
} 