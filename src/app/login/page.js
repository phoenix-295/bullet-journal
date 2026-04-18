'use client'

import { useActionState } from 'react'
import { login } from '@/app/auth-actions'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null)

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-eyebrow">My</div>
          <div className="login-brand-title">Bullet <span>Journal</span></div>
        </div>
        <form className="login-form" action={action}>
          <input
            className="login-input"
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
          />
          {state?.error && (
            <div className="login-error">{state.error}</div>
          )}
          <button className="login-submit" type="submit" disabled={pending}>
            {pending ? '…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
