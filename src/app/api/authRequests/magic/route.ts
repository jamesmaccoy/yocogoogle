import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

const SECRET_KEY = process.env.PAYLOAD_SECRET || process.env.JWT_SECRET || 'your-secret-key'

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function generateSixDigitCode(): string {
	return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
	try {
		const { email } = await request.json()

		if (!email || !isValidEmail(email)) {
			return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
		}

		const payload = await getPayload({ config: configPromise })

		// Ensure a user exists for this email
		const existing = await payload.find({
			collection: 'users',
			where: { email: { equals: email } },
			limit: 1,
		})

		if (!existing?.docs?.length) {
			// Create a minimal user with a random password
			const randomPassword = randomUUID()
			await payload.create({
				collection: 'users',
				data: {
					name: email.split('@')[0],
					email,
					password: randomPassword,
					role: 'guest',
				},
				overrideAccess: true,
			})
		}

		const code = generateSixDigitCode()
		const expiresInMinutes = 10
		const requestToken = jwt.sign(
			{ email, code, type: 'magic', purpose: 'login' },
			SECRET_KEY,
			{ expiresIn: `${expiresInMinutes}m` },
		)

		// Construct a magic link that verifies via GET endpoint
		const url = new URL(request.url)
		const baseUrl = `${url.protocol}//${url.host}`
		const magicLink = `${baseUrl}/api/authRequests/verify-link?token=${encodeURIComponent(
			requestToken,
		)}`

		// Attempt to send email via Payload's email adapter
		try {
			await payload.sendEmail({
				to: email,
				subject: 'Your login link and code',
				html: `
					<h2>Sign in to Simple Plek</h2>
					<p>Click the magic link below to sign in:</p>
					<p><a href="${magicLink}">Sign in</a></p>
					<hr />
					<p>Or enter this 6-digit code: <strong style="font-family:monospace;">${code}</strong></p>
					<p>This link and code expire in ${expiresInMinutes} minutes.</p>
				`,
				text: `Sign in: ${magicLink}\nOr use code: ${code}\nThis link and code expire in ${expiresInMinutes} minutes.`,
			})
		} catch (e) {
			console.warn('Magic email send failed (continuing):', e)
		}

		return NextResponse.json({
			authRequestId: requestToken,
			email,
			expiresInMinutes,
			magicLink,
		})
	} catch (error) {
		console.error('Error creating magic auth request:', error)
		return NextResponse.json({ error: 'Failed to create magic auth request' }, { status: 500 })
	}
} 