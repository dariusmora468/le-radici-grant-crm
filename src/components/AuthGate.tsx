'use client'

import { useState, useEffect, ReactNode } from 'react'
import { isAuthenticated, setAuthenticated, verifyPassword } from '@/lib/auth'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setAuthed(isAuthenticated())
    setChecking(false)
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const valid = await verifyPassword(password)
    if (valid) {
      setAuthenticated()
      setAuthed(true)
    } else {
      setError('Incorrect password')
    }
    setLoading(false)
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-terracotta-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-terracotta-100 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-terracotta-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-bold text-walnut-900">Le Radici</h1>
            <p className="font-body text-sm text-walnut-500 mt-1">Grant CRM</p>
          </div>
          <form onSubmit={handleLogin} className="card p-6">
            <label className="block mb-2 text-sm font-medium text-walnut-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field mb-4"
              placeholder="Enter password"
              autoFocus
            />
            {error && <p className="text-terracotta-600 text-sm mb-3">{error}</p>}
            <button type="submit" disabled={loading || !password} className="btn-primary w-full justify-center disabled:opacity-50">
              {loading ? 'Checking...' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
