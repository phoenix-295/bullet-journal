'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(prevState, formData) {
  const password = formData.get('password')

  if (password !== process.env.AUTH_PASSWORD) {
    return { error: 'Wrong password' }
  }

  const cookieStore = await cookies()
  cookieStore.set('bj_session', process.env.AUTH_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  redirect('/')
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('bj_session')
  redirect('/login')
}
