'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, APPLICATION_STATUSES, APPLICATION_STATUS_COLORS } from '@/lib/supabase'
import type { Application } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('applications')
      .select('*, grant_application:grant_applications(*, grant:grants(name, name_it, funding_source, max_amount))')
      .order('updated_at', { ascending: false })

    if (data) {
      setApplications(data.map((a: any) => ({
        ...a,
        grant_application: a.grant_application,
      })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  // Empty state
  if (applications.length === 0) {
    return (
      <AppShell>
        <div className="animate-fade-in flex items-center justify-center min-h-[70vh]">
          <div className="text-center max-w-md">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(147,51,234,0.06) 100%)',
                border: '1px solid rgba(59,130,246,0.12)',
              }}
            >
              <svg className="w-9 h-9 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 mb-3">No Active Applications</h1>
            <p className="text-sm text-slate-500 mb-2 leading-relaxed">
              Applications are where you prepare everything needed to submit a grant. Start by adding a grant to your pipeline, then begin your application from there.
            </p>
            <p className="text-xs text-slate-400 mb-8">
              Each application includes a guided proposal builder, budget planner, and document checklist.
            </p>
            <Link href="/grants" className="btn-primary inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              Browse Grants
            </Link>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Applications</h1>
            <p className="page-subtitle">{applications.length} active application{applications.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="space-y-2">
          {applications.map((app) => {
            const grantName = app.grant_application?.grant?.name || 'Unknown Grant'
            const status = app.status as keyof typeof APPLICATION_STATUS_COLORS
            return (
              <Link key={app.id} href={`/applications/${app.id}`} className="block">
                <div
                  className="p-5 rounded-2xl transition-all duration-200 cursor-pointer group"
                  style={{
                    background: 'rgba(255,255,255,0.55)',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.8)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.04)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.55)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                >
                  <div className="flex items-center gap-4">
                    {/* Progress circle */}
                    <div className="relative w-12 h-12 shrink-0">
                      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="2.5" />
                        <circle
                          cx="18" cy="18" r="15.5" fill="none"
                          stroke={app.overall_progress >= 75 ? '#10b981' : app.overall_progress >= 40 ? '#3b82f6' : '#94a3b8'}
                          strokeWidth="2.5"
                          strokeDasharray={`${app.overall_progress * 0.974} 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-600">
                        {app.overall_progress}%
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                        {grantName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn('badge text-[10px]', APPLICATION_STATUS_COLORS[status])}>
                          {APPLICATION_STATUSES[status]}
                        </span>
                        {app.grant_application?.grant?.funding_source && (
                          <span className="badge bg-blue-50 text-blue-600 text-[10px]">
                            {app.grant_application.grant.funding_source}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      {app.grant_application?.grant?.max_amount && (
                        <p className="text-sm font-bold text-slate-700">
                          €{(app.grant_application.grant.max_amount / 1000).toFixed(0)}K
                        </p>
                      )}
                      {app.updated_at && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Updated {formatDate(app.updated_at)}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
