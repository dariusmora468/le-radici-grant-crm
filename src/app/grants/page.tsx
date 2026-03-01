'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, FUNDING_SOURCES, FUNDING_TYPES } from '@/lib/supabase'
import type { Grant, GrantCategory, Project } from '@/lib/supabase'
import { formatCurrency, daysUntil, cn } from '@/lib/utils'
import { getRealisticTotal } from '@/lib/projections'
import VerificationBadge from '@/components/VerificationBadge'
import GrantDiscovery from '@/components/GrantDiscovery'
import { computeRelevance } from '@/lib/relevance'

// Compute effective status from dates, overriding stale DB values
function getEffectiveStatus(grant: Grant): string {
  if (grant.application_window_closes) {
    const days = daysUntil(grant.application_window_closes)
    if (days !== null && days <= 0) return 'Closed'
    if (days !== null && days <= 14) return 'Closing soon'
  }
  return grant.window_status || 'Unknown'
}

const STATUS_STYLES: Record<string, string> = {
  'Open': 'bg-emerald-50 text-emerald-600',
  'Closing soon': 'bg-amber-50 text-amber-600',
  'Closed': 'bg-rose-50 text-rose-500',
  'Rolling': 'bg-violet-50 text-violet-500',
  'Not yet open': 'bg-slate-50 text-slate-400',
  'Unknown': 'bg-slate-50 text-slate-400',
}

export default function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([])
  const [categories, setCategories] = useState<GrantCategory[]>([])
  const [pipelineGrantIds, setPipelineGrantIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [showDiscovery, setShowDiscovery] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [grantsRes, catsRes, pipelineRes, projRes] = await Promise.all([
      supabase
        .from('grants')
        .select('*, category:grant_categories(*)')
        .order('relevance_score', { ascending: false, nullsFirst: false }),
      supabase.from('grant_categories').select('*').order('name'),
      supabase.from('grant_applications').select('grant_id, stage'),
      supabase.from('projects').select('*').limit(1).single(),
    ])
    if (grantsRes.data) setGrants(grantsRes.data)
    if (catsRes.data) setCategories(catsRes.data)
    if (pipelineRes.data) {
      const map: Record<string, string> = {}
      pipelineRes.data.forEach((p: any) => { map[p.grant_id] = p.stage })
      setPipelineGrantIds(map)
    }
    if (projRes.data) setProject(projRes.data)
    if (catsRes.data) setCategories(catsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Enrich grants with computed status and dynamic relevance
  const enriched = grants.map(g => {
    const relevance = project ? computeRelevance(g, project) : null
    return {
      ...g,
      effectiveStatus: getEffectiveStatus(g),
      deadlineDays: g.application_window_closes ? daysUntil(g.application_window_closes) : null,
      dynamicScore: relevance?.score ?? g.relevance_score ?? 0,
      scoreReasons: relevance?.reasons ?? [],
      scoreWarnings: relevance?.warnings ?? [],
    }
  })

  // Count closed for toggle button
  const closedCount = enriched.filter(g => g.effectiveStatus === 'Closed').length

  // Filter
  const filtered = enriched.filter((g) => {
    // Hide closed unless toggled
    if (!showClosed && g.effectiveStatus === 'Closed') return false

    if (search) {
      const q = search.toLowerCase()
      const match =
        g.name.toLowerCase().includes(q) ||
        (g.name_it && g.name_it.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.funding_source && g.funding_source.toLowerCase().includes(q))
      if (!match) return false
    }
    if (filterSource && g.funding_source !== filterSource) return false
    if (filterType && g.funding_type !== filterType) return false
    if (filterCategory && g.category_id !== filterCategory) return false
    return true
  })

  // Sort: closing soon first (by days left ascending), then open, then rolling, then rest; within each group by relevance
  const sorted = [...filtered].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      'Closing soon': 0,
      'Open': 1,
      'Not yet open': 2,
      'Rolling': 3,
      'Unknown': 4,
      'Closed': 5,
    }
    const aOrder = statusOrder[a.effectiveStatus] ?? 4
    const bOrder = statusOrder[b.effectiveStatus] ?? 4
    if (aOrder !== bOrder) return aOrder - bOrder

    // Within "Closing soon" and "Open", sort by deadline urgency
    if (a.deadlineDays !== null && b.deadlineDays !== null && a.deadlineDays !== b.deadlineDays) {
      return a.deadlineDays - b.deadlineDays
    }

    // Then by relevance
    return (b.dynamicScore || 0) - (a.dynamicScore || 0)
  })

  const activeCount = filtered.filter(g => g.effectiveStatus !== 'Closed').length

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Grants</h1>
            <p className="page-subtitle">
              {activeCount} active grant{activeCount !== 1 ? 's' : ''}
              {showClosed && closedCount > 0 ? `, ${closedCount} closed` : ''}
              {filtered.length !== enriched.filter(g => showClosed || g.effectiveStatus !== 'Closed').length ? ` (filtered)` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {closedCount > 0 && (
              <button
                onClick={() => setShowClosed(!showClosed)}
                className={cn('btn-ghost text-xs', showClosed && 'bg-white/50')}
              >
                {showClosed ? 'Hide closed' : `Show closed (${closedCount})`}
              </button>
            )}
            <button
              onClick={() => setShowDiscovery(!showDiscovery)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Discover Grants
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search grants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="select-field w-40">
              <option value="">All Sources</option>
              {FUNDING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select-field w-44">
              <option value="">All Types</option>
              {FUNDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="select-field w-48">
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {(search || filterSource || filterType || filterCategory) && (
              <button
                onClick={() => { setSearch(''); setFilterSource(''); setFilterType(''); setFilterCategory('') }}
                className="btn-ghost text-xs whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Grant Discovery */}
        {showDiscovery && project && (
          <GrantDiscovery
            project={project}
            existingGrantNames={grants.map(g => g.name)}
            onComplete={() => { setShowDiscovery(false); fetchData() }}
          />
        )}

        {/* Show discovery CTA when no grants exist */}
        {!loading && grants.length === 0 && !showDiscovery && project && (
          <GrantDiscovery
            project={project}
            existingGrantNames={[]}
            onComplete={() => fetchData()}
          />
        )}

        {/* Funding Summary */}
        {!loading && filtered.length > 0 && (() => {
          const summary = getRealisticTotal(filtered as Grant[])
          return (
            <div className="glass-solid rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Potential</div>
                    <div className="text-xl font-bold text-slate-700 mt-0.5">{formatCurrency(summary.totalAddressable)}</div>
                  </div>
                  <div className="w-px h-10 bg-slate-200/60" />
                  <div>
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Realistic Projection</div>
                    <div className="text-xl font-bold text-emerald-600 mt-0.5">{formatCurrency(summary.realisticTotal)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-lg font-bold text-blue-600">{summary.highProbabilityCount}</div>
                    <div className="text-[10px] text-slate-400">High probability</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Grants list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="card p-16 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
              style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.1)' }}
            >
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">
              {grants.length === 0 ? 'No grants added yet' : 'No grants match your filters'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {grants.length === 0 ? 'Add your first grant to get started' : 'Try adjusting your search or filters'}
            </p>
            {grants.length === 0 && (
              <Link href="/grants/new" className="btn-primary mt-4 inline-flex">Add first grant</Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((grant) => {
              const isClosed = grant.effectiveStatus === 'Closed'
              const pipelineStage = pipelineGrantIds[grant.id]
              const inPipeline = !!pipelineStage
              return (
                <Link key={grant.id} href={`/grants/${grant.id}`} className="block">
                  <div className={cn(
                    'card-hover p-5',
                    isClosed && 'opacity-40',
                    inPipeline && 'border-l-[3px] border-l-blue-400'
                  )}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <h3 className="text-sm font-semibold text-slate-800 truncate">{grant.name}</h3>
                          {inPipeline && (
                            <span className="badge bg-blue-100 text-blue-700 shrink-0 text-[10px] font-semibold">
                              📋 {pipelineStage}
                            </span>
                          )}
                          {grant.category && (
                            <span className="badge bg-blue-50 text-blue-600 shrink-0">{grant.category.name}</span>
                          )}
                        </div>
                        {grant.name_it && (
                          <p className="text-xs text-slate-400 mb-1.5 truncate italic">{grant.name_it}</p>
                        )}
                        {grant.description && (
                          <p className="text-sm text-slate-500 line-clamp-2">{grant.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-3">
                          {grant.funding_source && (
                            <span className="text-xs text-slate-400">
                              <span className="font-medium text-slate-500">{grant.funding_source}</span>
                            </span>
                          )}
                          {grant.funding_type && (
                            <span className="text-xs text-slate-400">{grant.funding_type}</span>
                          )}
                          {grant.effort_level && (
                            <span className="text-xs text-slate-400">Effort: {grant.effort_level}</span>
                          )}
                          <span className={cn(
                            'badge text-[10px]',
                            STATUS_STYLES[grant.effectiveStatus] || 'bg-slate-50 text-slate-400'
                          )}>
                            {grant.effectiveStatus}
                          </span>
                          {grant.deadlineDays !== null && grant.deadlineDays > 0 && grant.deadlineDays <= 90 && (
                            <span className={cn(
                              'text-[10px] font-medium',
                              grant.deadlineDays <= 14 ? 'text-amber-600' :
                              grant.deadlineDays <= 30 ? 'text-amber-500' : 'text-slate-400'
                            )}>
                              {grant.deadlineDays}d left
                            </span>
                          )}
                          <VerificationBadge
                            status={grant.verification_status}
                            confidence={grant.verification_confidence}
                            lastVerifiedAt={grant.last_verified_at}
                            showConfidence
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {(grant.min_amount || grant.max_amount) && (
                          <p className="text-sm font-semibold text-slate-800">
                            {grant.min_amount && grant.max_amount
                              ? `${formatCurrency(grant.min_amount)} - ${formatCurrency(grant.max_amount)}`
                              : formatCurrency(grant.max_amount || grant.min_amount)}
                          </p>
                        )}
                        {grant.dynamicScore > 0 && (
                          <div className="mt-1.5 text-right group relative">
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-[10px] text-slate-400">Match</span>
                              <span className={cn(
                                'text-xs font-bold',
                                grant.dynamicScore >= 70 ? 'text-emerald-600' :
                                grant.dynamicScore >= 45 ? 'text-blue-600' :
                                grant.dynamicScore >= 25 ? 'text-amber-600' : 'text-slate-400'
                              )}>
                                {grant.dynamicScore}%
                              </span>
                            </div>
                            {(grant.scoreReasons.length > 0 || grant.scoreWarnings.length > 0) && (
                              <div className="hidden group-hover:block absolute right-0 top-6 z-20 w-56 p-3 rounded-xl text-left"
                                style={{
                                  background: 'rgba(255,255,255,0.95)',
                                  backdropFilter: 'blur(12px)',
                                  border: '1px solid rgba(0,0,0,0.08)',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                }}
                              >
                                {grant.scoreReasons.map((r, i) => (
                                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-emerald-600 mb-0.5">
                                    <span>✓</span> {r}
                                  </div>
                                ))}
                                {grant.scoreWarnings.map((w, i) => (
                                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-amber-600 mb-0.5">
                                    <span>⚠</span> {w}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
