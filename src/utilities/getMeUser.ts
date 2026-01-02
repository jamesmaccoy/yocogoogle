import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import type { User } from '../payload-types'
import { getClientSideURL } from './getURL'

export const getMeUser = async (args?: {
  nullUserRedirect?: string
  validUserRedirect?: string
}): Promise<{
  token: string
  user: User
}> => {
  const { nullUserRedirect, validUserRedirect } = args || {}
  const cookieStore = await cookies()
  const token = cookieStore.get('payload-token')?.value

  const meUserReq = await fetch(`${getClientSideURL()}/api/users/me`, {
    headers: {
      Authorization: `JWT ${token}`,
    },
  })

  let user: User | null = null

  try {
    if (meUserReq.ok) {
      const response = await meUserReq.json()
      user = response.user
    }
  } catch (error) {
    console.error('Error parsing user response:', error)
    // If JSON parsing fails, user remains null
  }

  if (validUserRedirect && meUserReq.ok && user) {
    redirect(validUserRedirect)
  }

  if (nullUserRedirect && (!meUserReq.ok || !user)) {
    redirect(nullUserRedirect)
  }

  // Token will exist here because if it doesn't the user will be redirected
  return {
    token: token || '',
    user: user!,
  }
}
