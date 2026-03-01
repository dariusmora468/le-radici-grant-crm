'use client'

import { useState, useEffect } from 'react'
import AuthGate from '@/components/AuthGate'
import Sidebar from '@/components/Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(d => setVersion(`v${d.version} · ${d.build_time?.substring(0, 16)?.replace('T', ' ')}`))
      .catch(() => setVersion(''))
  }, [])

  return (
    <AuthGate>
      <div className="bg-app">
        <Sidebar />
        <main className="ml-56 p-8 relative z-10 min-h-screen pb-16">
          {children}
        </main>
        {version && (
          <div className="fixed bottom-0 right-0 px-3 py-1 text-[10px] text-slate-300 z-50">
            {version}
          </div>
        )}
      </div>
    </AuthGate>
  )
}
