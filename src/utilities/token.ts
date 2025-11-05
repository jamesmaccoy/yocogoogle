import jwt from 'jsonwebtoken'

const SECRET_KEY = process.env.JWT_SECRET || process.env.PAYLOAD_SECRET || 'your-secret-key' // Use env variable in production

export const generateJwtToken = <T extends object>(payload: T): string => {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: '7d' })
}

export const verifyJwtToken = <T extends object>(token: string): T | null => {
  try {
    const decoded = jwt.verify(token, SECRET_KEY) as T
    return decoded
  } catch (error) {
    console.error('JWT verification error:', error)
    return null
  }
}
