'use client'

import AppShell from '@/components/AppShell'

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Funding overview and pipeline status</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-secondary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export
            </button>
            <button className="btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Grant
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Identified', value: '0', sub: 'grants', color: 'text-slate-900' },
            { label: 'In Pipeline', value: '0', sub: 'active', color: 'text-blue-600' },
            { label: 'Potential Funding', value: '\u20AC0', sub: 'estimated', color: 'text-emerald-600' },
            { label: 'Submitted', value: '0', sub: 'awaiting review', color: 'text-violet-600' },
          ].map((stat) => (
            <div key={stat.label} className="card p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{stat.label}</p>
              <p className={`text-2xl font-semibold tracking-tight ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Main content area */}
        <div className="grid grid-cols-3 gap-4">
          {/* Pipeline summary */}
          <div className="col-span-2 card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-800">Pipeline</h2>
              <button className="btn-ghost text-xs">View all</button>
            </div>
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
                  style={{
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.1)',
                  }}
                >
                  <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-600">No grants in pipeline yet</p>
                <p className="text-xs text-slate-400 mt-1">Add grants to start tracking applications</p>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-800">Recent Activity</h2>
            </div>
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
                  style={{
                    background: 'rgba(0, 0, 0, 0.03)',
                    border: '1px solid rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-600">No activity yet</p>
                <p className="text-xs text-slate-400 mt-1">Activity will appear here</p>
              </div>
            </div>
          </div>
        </div>

        {/* Deadlines */}
        <div className="mt-4 card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-800">Upcoming Deadlines</h2>
            <button className="btn-ghost text-xs">Calendar view</button>
          </div>
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-slate-400">No upcoming deadlines</p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
