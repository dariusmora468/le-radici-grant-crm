'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { cn, formatCurrency } from '@/lib/utils'
import { getRealisticTotal } from '@/lib/projections'
import VerificationBadge from '@/components/VerificationBadge'
import OnboardingWizard from '@/components/OnboardingWizard'
import type { Grant as FullGrant } from '@/lib/supabase'

type Grant = {
  id: string
  name: string
  name_it: string | null
  funding_source: string
  min_amount: number | null
  max_amount: number | null
  relevance_score: number | null
  window_status: string | null
  application_window_opens: string | null
  application_window_closes: string | null
  effort_level: string | null
  description: string | null
  funding_type: string | null
  verification_status: string | null
  verification_confidence: number | null
  last_verified_at: string | null
}

type Blocker = {
  id: string
  name: string
  description: string | null
  status: 'blocking' | 'in_progress' | 'resolved'
  grants_blocked: string[] | null
  unlock_value: string | null
  time_to_fix: string | null
  action_needed: string | null
  owner: string | null
  resolved_at: string | null
  sort_order: number
}

type PipelineApp = {
  id: string
  stage: string
  grant: { name: string; max_amount: number | null } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  'Open': { label: 'Open', color: 'text-emerald-600', dot: 'bg-emerald-400' },
  'Closing soon': { label: 'Closing Soon', color: 'text-amber-600', dot: 'bg-amber-400' },
  'Not yet open': { label: 'Not Yet Open', color: 'text-blue-500', dot: 'bg-blue-400' },
  'Rolling': { label: 'Rolling', color: 'text-violet-600', dot: 'bg-violet-400' },
  'Closed': { label: 'Closed', color: 'text-slate-400', dot: 'bg-slate-300' },
  'Unknown': { label: 'Unknown', color: 'text-slate-400', dot: 'bg-slate-300' },
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDeadline(dateStr: string | null): string {
  if (!dateStr) return 'No deadline'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DashboardPage() {
  const [grants, setGrants] = useState<Grant[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [pipeline, setPipeline] = useState<PipelineApp[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBlocker, setExpandedBlocker] = useState<string | null>(null)
  const [project, setProject] = useState<any>(null)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  const fetchData = useCallback(async () => {
    const [grantsRes, blockersRes, pipelineRes, projRes] = await Promise.all([
      supabase.from('grants').select('*').order('relevance_score', { ascending: false }),
      supabase.from('project_blockers').select('*').order('sort_order'),
      supabase.from('grant_applications').select('id, stage, grant:grants(name, max_amount)'),
      supabase.from('projects').select('*').limit(1).single(),
    ])
    if (grantsRes.data) setGrants(grantsRes.data)
    if (blockersRes.data) setBlockers(blockersRes.data as Blocker[])
    if (pipelineRes.data) setPipeline(pipelineRes.data as unknown as PipelineApp[])
    if (projRes.data) setProject(projRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function updateBlockerStatus(id: string, status: string) {
    await supabase.from('project_blockers').update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    fetchData()
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  // Determine if onboarding should show
  const profileHasBasics = !!(project?.name && project?.country && project?.primary_sector && project?.summary)
  const shouldShowOnboarding = project && !project.onboarding_complete && !onboardingDismissed

  if (shouldShowOnboarding) {
    return (
      <AppShell>
        <div className="max-w-6xl mx-auto py-8">
          <OnboardingWizard
            projectName={project.name || ''}
            profileComplete={profileHasBasics}
            grantCount={grants.length}
            pipelineCount={pipeline.length}
            onDismiss={async () => {
              setOnboardingDismissed(true)
              if (project) {
                await supabase.from('projects').update({ onboarding_complete: true }).eq('id', project.id)
              }
            }}
          />
        </div>
      </AppShell>
    )
  }

  // Computed stats
  const openGrants = grants.filter(g => g.window_status === 'Open' || g.window_status === 'Closing soon')
  const rollingGrants = grants.filter(g => g.window_status === 'Rolling')
  const closedGrants = grants.filter(g => g.window_status === 'Closed')
  const notYetOpen = grants.filter(g => g.window_status === 'Not yet open')

  const totalAddressable = grants
    .filter(g => g.window_status !== 'Closed')
    .reduce((sum, g) => sum + (g.max_amount || 0), 0)

  const activeBlockers = blockers.filter(b => b.status === 'blocking')
  const inProgressBlockers = blockers.filter(b => b.status === 'in_progress')
  const resolvedBlockers = blockers.filter(b => b.status === 'resolved')

  // Deadlines sorted by date
  const upcomingDeadlines = grants
    .filter(g => g.application_window_closes && g.window_status !== 'Closed')
    .map(g => ({ ...g, daysLeft: daysUntil(g.application_window_closes) }))
    .filter(g => g.daysLeft !== null && g.daysLeft > 0)
    .sort((a, b) => (a.daysLeft || 999) - (b.daysLeft || 999))

  // Actions: combine blocker actions with deadline-driven actions
  const urgentActions = [
    ...activeBlockers.map(b => ({
      type: 'blocker' as const,
      priority: b.sort_order,
      title: b.name,
      action: b.action_needed || '',
      owner: b.owner || 'Team',
      urgency: 'blocker' as const,
    })),
    ...upcomingDeadlines
      .filter(g => (g.daysLeft || 999) <= 90)
      .map(g => ({
        type: 'deadline' as const,
        priority: 100 + (g.daysLeft || 0),
        title: g.name,
        action: `Deadline: ${formatDeadline(g.application_window_closes)}. ${g.daysLeft} days remaining.`,
        owner: 'Team',
        urgency: (g.daysLeft || 999) <= 30 ? 'critical' as const : 'warning' as const,
      })),
  ].sort((a, b) => a.priority - b.priority)

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Funding Command Center</h1>
            <p className="page-subtitle">Live overview of grants, blockers, and next actions</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/grants" className="btn-secondary text-sm">
              All Grants
            </Link>
            <Link href="/pipeline" className="btn-primary text-sm">
              Pipeline
            </Link>
          </div>
        </div>

        {/* ============= SECTION 1: STATS CARDS ============= */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card p-5">
            <div className="text-3xl font-bold text-emerald-600">{openGrants.length}</div>
            <div className="text-sm text-slate-600 font-medium mt-1">Open Now</div>
            <div className="text-xs text-slate-400 mt-0.5">Ready to apply</div>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-bold text-violet-600">{rollingGrants.length}</div>
            <div className="text-sm text-slate-600 font-medium mt-1">Rolling</div>
            <div className="text-xs text-slate-400 mt-0.5">Ongoing programs</div>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-bold text-blue-500">{notYetOpen.length}</div>
            <div className="text-sm text-slate-600 font-medium mt-1">Upcoming</div>
            <div className="text-xs text-slate-400 mt-0.5">Not yet open</div>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-bold text-slate-700">{grants.length}</div>
            <div className="text-sm text-slate-600 font-medium mt-1">Total Tracked</div>
            <div className="text-xs text-slate-400 mt-0.5">{closedGrants.length} closed</div>
          </div>
        </div>

        {/* Funding Projection Banner */}
        {(() => {
          const summary = getRealisticTotal(grants as unknown as FullGrant[])
          return (
            <div className="glass-solid rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Addressable</div>
                    <div className="text-2xl font-bold text-slate-700 mt-1">
                      {formatCurrency(summary.totalAddressable)}+
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Across {summary.activeGrantCount} active grants
                    </div>
                  </div>
                  <div className="w-px h-14 bg-slate-200/60" />
                  <div>
                    <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Realistic Projection</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">
                      {formatCurrency(summary.realisticTotal)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Weighted by relevance + status
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <div className="text-lg font-bold text-blue-600">{summary.highProbabilityCount}</div>
                    <div className="text-[10px] text-slate-400">High probability</div>
                  </div>
                  <div className="w-px h-10 bg-slate-200/40" />
                  <div>
                    <div className="text-lg font-bold text-blue-600">{pipeline.length}</div>
                    <div className="text-[10px] text-slate-400">In pipeline</div>
                  </div>
                  <div className="w-px h-10 bg-slate-200/40" />
                  {(() => {
                    const verified = grants.filter(g => g.verification_status === 'verified').length
                    const warned = grants.filter(g => g.verification_status === 'warning' || g.verification_status === 'failed').length
                    const pct = grants.length > 0 ? Math.round((verified / grants.length) * 100) : 0
                    return (
                      <div>
                        <div className={cn(
                          'text-lg font-bold',
                          pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-slate-400'
                        )}>
                          {verified}/{grants.length}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Verified{warned > 0 && <span className="text-amber-500"> ({warned} ⚠)</span>}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        })()}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* ============= SECTION 2: BLOCKER TRACKER ============= */}
          <div className="card p-0 overflow-hidden">
            <div className="p-5 border-b border-white/20">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">Blocker Tracker</h2>
                <div className="flex items-center gap-2">
                  {activeBlockers.length > 0 && (
                    <span className="badge bg-red-100 text-red-600 text-[10px]">
                      {activeBlockers.length} blocking
                    </span>
                  )}
                  {inProgressBlockers.length > 0 && (
                    <span className="badge bg-amber-50 text-amber-600 text-[10px]">
                      {inProgressBlockers.length} in progress
                    </span>
                  )}
                  {resolvedBlockers.length > 0 && (
                    <span className="badge bg-emerald-50 text-emerald-600 text-[10px]">
                      {resolvedBlockers.length} resolved
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">Structural prerequisites. Resolving one unlocks multiple grants.</p>
            </div>

            <div className="divide-y divide-white/10">
              {blockers.map((blocker) => {
                const isExpanded = expandedBlocker === blocker.id
                const statusIcon = blocker.status === 'resolved' ? '✅' : blocker.status === 'in_progress' ? '🟡' : '🔴'
                return (
                  <div key={blocker.id} className={cn('transition-opacity', blocker.status === 'resolved' && 'opacity-50')}>
                    <button
                      onClick={() => setExpandedBlocker(isExpanded ? null : blocker.id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-white/20 text-left transition-colors"
                    >
                      <span className="text-sm">{statusIcon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{blocker.name}</span>
                          {blocker.owner && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/40 text-slate-500">{blocker.owner}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {blocker.unlock_value} · {blocker.time_to_fix}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">
                          {blocker.grants_blocked?.length || 0} grants
                        </span>
                        <svg className={cn("w-3.5 h-3.5 text-slate-300 transition-transform", isExpanded && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 ml-8">
                        {blocker.description && (
                          <p className="text-xs text-slate-500 mb-3">{blocker.description}</p>
                        )}
                        {blocker.action_needed && (
                          <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-200/30 mb-3">
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-0.5">Next Action</p>
                            <p className="text-xs text-slate-600">{blocker.action_needed}</p>
                          </div>
                        )}
                        {blocker.grants_blocked && blocker.grants_blocked.length > 0 && (
                          <div className="mb-3">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Grants Blocked</p>
                            <div className="flex flex-wrap gap-1">
                              {blocker.grants_blocked.map((g, i) => (
                                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/50 text-slate-500 border border-white/30">{g}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <select
                          value={blocker.status}
                          onChange={(e) => updateBlockerStatus(blocker.id, e.target.value)}
                          className="select-field text-xs w-36"
                        >
                          <option value="blocking">Blocking</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ============= SECTION 3: PRIORITY ACTIONS ============= */}
          <div className="card p-0 overflow-hidden">
            <div className="p-5 border-b border-white/20">
              <h2 className="text-base font-semibold text-slate-800">Priority Actions</h2>
              <p className="text-xs text-slate-400 mt-1">Generated from blocker status and grant deadlines</p>
            </div>

            <div className="divide-y divide-white/10 max-h-[520px] overflow-y-auto">
              {urgentActions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-slate-400">No urgent actions. All blockers resolved and no imminent deadlines.</p>
                </div>
              ) : (
                urgentActions.map((action, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5',
                        action.urgency === 'blocker' ? 'bg-red-400' :
                        action.urgency === 'critical' ? 'bg-orange-400' : 'bg-amber-400'
                      )}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{action.title}</span>
                          <span className={cn(
                            'badge text-[10px]',
                            action.type === 'blocker' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                          )}>
                            {action.type === 'blocker' ? 'Blocker' : 'Deadline'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{action.action}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/40 text-slate-400 mt-1.5 inline-block">{action.owner}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ============= SECTION 4: DEADLINE TIMELINE ============= */}
        <div className="card p-0 overflow-hidden mb-6">
          <div className="p-5 border-b border-white/20">
            <h2 className="text-base font-semibold text-slate-800">Deadline Timeline</h2>
            <p className="text-xs text-slate-400 mt-1">Upcoming grant windows sorted by urgency</p>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400">No upcoming deadlines with specific dates. Check Rolling grants for always-open opportunities.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {upcomingDeadlines.map((grant) => {
                const days = grant.daysLeft || 0
                const urgencyColor = days <= 30 ? 'text-red-600 bg-red-50' :
                  days <= 90 ? 'text-amber-600 bg-amber-50' :
                  'text-blue-600 bg-blue-50'
                const barColor = days <= 30 ? 'bg-red-400' : days <= 90 ? 'bg-amber-400' : 'bg-blue-400'
                const barWidth = Math.max(5, Math.min(100, 100 - (days / 365) * 100))

                return (
                  <div key={grant.id} className="p-4 hover:bg-white/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={cn('text-xs font-bold px-2.5 py-1 rounded-lg shrink-0', urgencyColor)}>
                        {days}d
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 truncate">{grant.name}</span>
                          {grant.max_amount && (
                            <span className="text-[10px] text-slate-400 shrink-0">up to {formatCurrency(grant.max_amount)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100/60 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', barColor)}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">{formatDeadline(grant.application_window_closes)}</span>
                        </div>
                      </div>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                        STATUS_CONFIG[grant.window_status || 'Unknown']?.color || 'text-slate-400',
                        'bg-white/40'
                      )}>
                        {grant.window_status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ============= SECTION 5: FULL GRANT TABLE ============= */}
        <div className="card p-0 overflow-hidden mb-6">
          <div className="p-5 border-b border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">All Grants ({grants.length})</h2>
                <p className="text-xs text-slate-400 mt-1">Complete database sorted by relevance</p>
              </div>
              <Link href="/grants" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                View Details →
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/15">
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-left p-3 pl-5">Grant</th>
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-left p-3">Source</th>
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right p-3">Max</th>
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center p-3">Match</th>
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center p-3">Status</th>
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center p-3">Effort</th>
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center p-3">Verified</th>
                  <th className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right p-3 pr-5">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {grants.map((grant) => {
                  const statusCfg = STATUS_CONFIG[grant.window_status || 'Unknown'] || STATUS_CONFIG['Unknown']
                  const score = grant.relevance_score || 0
                  const scoreColor = score >= 90 ? 'text-emerald-600' : score >= 70 ? 'text-blue-600' : score >= 50 ? 'text-amber-600' : 'text-slate-400'

                  return (
                    <tr key={grant.id} className={cn('hover:bg-white/20 transition-colors', grant.window_status === 'Closed' && 'opacity-40')}>
                      <td className="p-3 pl-5">
                        <span className="text-xs font-medium text-slate-700">{grant.name}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/40 text-slate-500">{grant.funding_source}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-xs font-medium text-slate-700">
                          {grant.max_amount ? formatCurrency(grant.max_amount) : 'Varies'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={cn('text-xs font-bold', scoreColor)}>{score}%</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium bg-white/40', statusCfg.color)}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={cn('text-[10px]',
                          grant.effort_level === 'Low' ? 'text-emerald-500' :
                          grant.effort_level === 'Medium' ? 'text-amber-500' :
                          grant.effort_level === 'High' ? 'text-orange-500' : 'text-red-500'
                        )}>{grant.effort_level || '—'}</span>
                      </td>
                      <td className="p-3 text-center">
                        <VerificationBadge
                          status={grant.verification_status}
                          confidence={grant.verification_confidence}
                          lastVerifiedAt={grant.last_verified_at}
                          showConfidence
                        />
                      </td>
                      <td className="p-3 pr-5 text-right">
                        <span className="text-[10px] text-slate-400">
                          {grant.application_window_closes ? formatDeadline(grant.application_window_closes) : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppShell>
  )
}
