'use client'

import AppShell from '@/components/AppShell'

export default function DashboardPage() {
  return (
    <AppShell>
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Grant funding overview for Le Radici</p>
      </div>
      <div className="mt-8 card p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-olive-100 rounded-2xl mb-4">
          <svg className="w-8 h-8 text-olive-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="font-display text-xl font-semibold text-walnut-900 mb-2">Foundation is live</h2>
        <p className="text-walnut-500 text-sm max-w-md mx-auto">
          Auth, navigation, and layout are working. Dashboard stats, grants list, pipeline, and other pages are coming in the next build batches.
        </p>
      </div>
    </AppShell>
  )
}
