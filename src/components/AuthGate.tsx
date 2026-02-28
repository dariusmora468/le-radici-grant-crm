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
      <div className="min-h-screen bg-app flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        {/* Extra ambient orbs for the login screen */}
        <div className="fixed top-1/4 left-1/3 w-80 h-80 bg-blue-200/20 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-indigo-200/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm relative z-10 animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{
                background: 'rgba(255, 255, 255, 0.6)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
              }}
            >
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">GrantFlow</h1>
            <p className="text-sm text-slate-500 mt-0.5">EU Funding Intelligence</p>
          </div>

          {/* Login card */}
          <div className="p-6" style={{
            background: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: '20px',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
          }}>
            <form onSubmit={handleLogin}>
              <label className="block mb-2 text-sm font-medium text-slate-600">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field mb-4"
                placeholder="Enter password"
                autoFocus
              />
              {error && (
                <p className="text-rose-500 text-sm mb-3 font-medium">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !password}
                className="btn-primary w-full disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Checking...
                  </span>
                ) : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
