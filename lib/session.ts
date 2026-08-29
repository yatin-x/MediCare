import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'

export type AppUser = {
  id: string
  name?: string | null
  email?: string | null
  role: string
}

export async function getAppUser(): Promise<AppUser | null> {
  const session = await getServerSession(authOptions)
  const id = session?.user?.id
  if (!id) return null
  return {
    id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role || 'doctor',
  }
}

export function isDoctor(user: AppUser) {
  return user.role !== 'patient'
}

export function isPatient(user: AppUser) {
  return user.role === 'patient'
}
