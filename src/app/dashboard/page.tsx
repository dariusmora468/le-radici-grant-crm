'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, STAGE_COLORS, PIPELINE_STAGES } from '@/lib/supabase'
import type { Grant, GrantApplication, ActivityLog } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil, cn } from '@/lib/utils'

interface DashboardData {
  totalGrants: number
  inPipeline: number
  potentialFunding: number
  submitted: number
  awarded: number
  awardedAmount: number
  applicationsByStage: Record<string, number>
  recentActivity: ActivityLog[]
  upcomingDeadlines: { id: string; name: string; deadline: string; daysLeft: number; type: string }[]
  recentGrants: (Grant & { category?: { name: string } | null })[]
  topApplications: (GrantApplication & { grant: (Grant & { category?: { name: string } | null }) | null })[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [grantsRes, appsRes, activityRes] = await Promise.all([
      supabase.from('grants').select('*, category:grant_categories(name)').order('created_at', { ascending: false }),
      supabase.from('grant_applications').select('*, grant:grants(*, category:grant_categories(name))').order('updated_at', { ascending: false }),
      supabase.from('grant_activity_log').select('*').order('created_at', { ascending: false }).limit(8),
    ])

    const grants = grantsRes.data || []
    const apps = appsRes.data || []
    const activity = activityRes.data || []

    const activeStages = ['Discovered', 'Researching', 'Serious Consideration', 'Preparing Application', 'Submitted', 'Under Review']
    const activeApps = apps.filter((a: any) => activeStages.includes(a.stage))
    const submittedApps = apps.filter((a: any) => ['Submitted', 'Under Review'].includes(a.stage))
    const awardedApps = apps.filter((a: any) => a.stage === 'Awarded')

    const potentialFunding = activeApps.reduce((sum: number, a: any) => sum + (a.target_amount || a.grant?.max_amount || 0), 0)
    const awardedAmount = awardedApps.reduce((sum: number, a: any) => sum + (a.target_amount || 0), 0)

    const applicationsByStage: Record<string, number> = {}
    PIPELINE_STAGES.forEach((s) => {
      const count = apps.filter((a: any) => a.stage === s).length
      if (count > 0) applicationsByStage[s] = count
    })

    // Upcoming deadlines from grants and applications
    const deadlines: DashboardData['upcomingDeadlines'] = []
    grants.forEach((g: any) => {
      if (g.application_window_closes) {
        const days = daysUntil(g.application_window_closes)
        if (days !== null && days > 0 && days <= 90) {
          deadlines.push({ id: g.id, name: g.name, deadline: g.application_window_closes, daysLeft: days, type: 'grant_window' })
        }
      }
    })
    apps.forEach((a: any) => {
      if (a.internal_deadline) {
        const days = daysUntil(a.internal_deadline)
        if (days !== null && days > 0 && days <= 90) {
          deadlines.push({ id: a.id, name: a.grant?.name || 'Application', deadline: a.internal_deadline, daysLeft: days, type: 'internal' })
        }
      }
      if (a.submission_date) {
        const days = daysUntil(a.submission_date)
        if (days !== null && days > 0 && days <= 90) {
          deadlines.push({ id: a.id, name: a.grant?.name || 'Application', deadline: a.submission_date, daysLeft: days, type: 'submission' })
        }
      }
    })
    deadlines.sort((a, b) => a.daysLeft - b.daysLeft)

    setData({
      totalGrants: grants.length,
      inPipeline: activeApps.length,
      potentialFunding,
      submitted: submittedApps.length,
      awarded: awardedApps.length,
      awardedAmount,
      applicationsByStage,
      recentActivity: activity,
      upcomingDeadlines: deadlines.slice(0, 6),
      recentGrants: grants.slice(0, 5) as any,
      topApplications: apps.filter((a: any) => activeStages.includes(a.stage)).slice(0, 5) as any,
    })
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

  if (!data) return null

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Funding overview and pipeline status</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/grants" className="btn-secondary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75" />
              </svg>
              View Grants
            </Link>
            <Link href="/grants/new" className="btn-primary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Grant
            </Link>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Identified" value={data.totalGrants.toString()} sub="grants" color="text-slate-900" />
          <StatCard label="In Pipeline" value={data.inPipeline.toString()} sub="active" color="text-blue-600" />
          <StatCard label="Potential Funding" value={formatCurrency(data.potentialFunding)} sub="estimated" color="text-emerald-600" />
          <StatCard label="Submitted" value={data.submitted.toString()} sub="awaiting review" color="text-violet-600" />
        </div>

        {/* Awarded banner */}
        {data.awarded > 0 && (
          <div
            className="rounded-2xl p-5 mb-6 flex items-center justify-between"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.06) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800">{data.awarded} grant{data.awarded !== 1 ? 's' : ''} awarded</p>
                <p className="text-xs text-emerald-600">{formatCurrency(data.awardedAmount)} secured</p>
              </div>
            </div>
            <Link href="/pipeline" className="btn-ghost text-xs text-emerald-700">View in pipeline</Link>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {/* Pipeline summary */}
          <div className="col-span-2 card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-slate-800">Pipeline Overview</h2>
              <Link href="/pipeline" className="btn-ghost text-xs">View board</Link>
            </div>
            {Object.keys(data.applicationsByStage).length > 0 ? (
              <div className="space-y-2.5">
                {PIPELINE_STAGES.filter((s) => data.applicationsByStage[s]).map((stage) => {
                  const count = data.applicationsByStage[stage]
                  const total = Object.values(data.applicationsByStage).reduce((a, b) => a + b, 0)
                  const pct = total > 0 ? (count / total) * 100 : 0
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className={cn('badge text-[10px] w-36 justify-center', STAGE_COLORS[stage] || 'bg-slate-100 text-slate-500')}>
                        {stage}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-400 transition-all duration-700"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600 w-6 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState icon="pipeline" message="No applications in pipeline" sub="Add grants to the pipeline to track progress" />
            )}

            {/* Top applications */}
            {data.topApplications.length > 0 && (
              <>
                <div className="h-px bg-slate-100 my-5" />
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Active Applications</h3>
                <div className="space-y-2">
                  {data.topApplications.map((app) => (
                    <Link key={app.id} href={`/pipeline/${app.id}`} className="flex items-center justify-between py-2 px-3 -mx-3 rounded-xl hover:bg-white/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn('badge text-[10px] shrink-0', STAGE_COLORS[app.stage] || 'bg-slate-100 text-slate-500')}>
                          {app.stage}
                        </span>
                        <span className="text-sm text-slate-700 truncate">{app.grant?.name || 'Unnamed'}</span>
                      </div>
                      {app.target_amount && (
                        <span className="text-xs font-medium text-slate-500 shrink-0 ml-3">{formatCurrency(app.target_amount)}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Activity */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Recent Activity</h2>
              {data.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {data.recentActivity.map((log) => (
                    <div key={log.id} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-2 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-600 leading-relaxed">
                          <span className="font-medium">{log.action}</span>
                          {log.details && <span className="text-slate-400"> — {log.details}</span>}
                        </p>
                        <p className="text-[10px] text-slate-300 mt-0.5">{formatDate(log.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-300 italic py-4 text-center">No activity yet</p>
              )}
            </div>

            {/* Recent grants */}
            {data.recentGrants.length > 0 && (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-800">Recently Added</h2>
                  <Link href="/grants" className="btn-ghost text-xs">All grants</Link>
                </div>
                <div className="space-y-2">
                  {data.recentGrants.map((g) => (
                    <Link key={g.id} href={`/grants/${g.id}`} className="block py-2 px-3 -mx-3 rounded-xl hover:bg-white/40 transition-colors">
                      <p className="text-sm text-slate-700 truncate">{g.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {g.category && <span className="text-[10px] text-blue-500">{g.category.name}</span>}
                        {g.funding_source && <span className="text-[10px] text-slate-400">{g.funding_source}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Deadlines */}
        <div className="mt-4 card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-800">Upcoming Deadlines</h2>
          </div>
          {data.upcomingDeadlines.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {data.upcomingDeadlines.map((d, i) => (
                <Link
                  key={`${d.id}-${d.type}-${i}`}
                  href={d.type === 'grant_window' ? `/grants/${d.id}` : `/pipeline/${d.id}`}
                  className="p-4 rounded-xl transition-all duration-200 hover:bg-white/40"
                  style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid rgba(0,0,0,0.03)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      'text-xs font-semibold',
                      d.daysLeft <= 7 ? 'text-rose-500' : d.daysLeft <= 30 ? 'text-amber-600' : 'text-slate-500'
                    )}>
                      {d.daysLeft}d left
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {d.type === 'grant_window' ? 'Window closes' : d.type === 'submission' ? 'Submission' : 'Internal'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 truncate">{d.name}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{formatDate(d.deadline)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-300 text-center py-6 italic">No upcoming deadlines</p>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card p-5">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
}

function EmptyState({ icon, message, sub }: { icon: string; message: string; sub: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-2"
          style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.08)' }}
        >
          <svg className="w-5 h-5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">{message}</p>
        <p className="text-xs text-slate-300 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}
