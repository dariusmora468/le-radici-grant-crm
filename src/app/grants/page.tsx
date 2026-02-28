'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, STAGE_COLORS, FUNDING_SOURCES } from '@/lib/supabase'
import type { Grant, GrantCategory, Project } from '@/lib/supabase'
import { discoverGrants, getPhaseInfo, type DiscoveryProgress, type DiscoveryPhase } from '@/lib/discovery'
import { formatCurrency, cn } from '@/lib/utils'

const PHASE_LABELS: Record<DiscoveryPhase, string> = {
  analyzing: 'Analyzing project',
  searching_eu: 'EU databases',
  searching_national: 'Italian programs',
  searching_regional: 'Tuscan funds',
  matching: 'Matching criteria',
  structuring: 'Structuring results',
  saving: 'Saving grants',
  complete: 'Complete',
  error: 'Error',
}

export default function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([])
  const [categories, setCategories] = useState<GrantCategory[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('')

  // Discovery state
  const [discovering, setDiscovering] = useState(false)
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null)
  const [discoveryResult, setDiscoveryResult] = useState<{ found: number; saved: number } | null>(null)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [grantsRes, catsRes, projRes] = await Promise.all([
      supabase
        .from('grants')
        .select('*, category:grant_categories(*)')
        .order('relevance_score', { ascending: false, nullsFirst: false }),
      supabase.from('grant_categories').select('*').order('name'),
      supabase.from('projects').select('*').limit(1).single(),
    ])
    if (grantsRes.data) setGrants(grantsRes.data)
    if (catsRes.data) setCategories(catsRes.data)
    if (projRes.data) setProject(projRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDiscover() {
    if (!project || discovering) return
    setDiscovering(true)
    setDiscoveryError(null)
    setDiscoveryResult(null)

    const result = await discoverGrants(project, (p) => setProgress(p))

    if (result.error) {
      setDiscoveryError(result.error)
    } else {
      setDiscoveryResult({ found: result.grants.length, saved: result.saved })
    }

    setDiscovering(false)
    fetchData()
  }

  // Stats
  const totalPotentialValue = grants.reduce((sum, g) => sum + (g.max_amount || 0), 0)
  const openGrants = grants.filter((g) => g.window_status === 'Open' || g.window_status === 'Rolling').length
  const highRelevance = grants.filter((g) => (g.relevance_score || 0) >= 4).length

  const filtered = grants.filter((g) => {
    if (search) {
      const q = search.toLowerCase()
      const match =
        g.name.toLowerCase().includes(q) ||
        (g.name_it && g.name_it.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q))
      if (!match) return false
    }
    if (filterSource && g.funding_source !== filterSource) return false
    return true
  })

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  // Discovery in progress
  if (discovering && progress) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="w-full max-w-lg text-center">
            {/* Animated icon */}
            <div className="relative inline-flex items-center justify-center w-20 h-20 mb-8">
              <div
                className="absolute inset-0 rounded-3xl animate-pulse"
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.08) 100%)',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                }}
              />
              <svg className="w-9 h-9 text-blue-500 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ animationDuration: '2s' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-slate-900 mb-2">Finding Your Grants</h2>
            <p className="text-sm text-slate-500 mb-8">{progress.message}</p>

            {/* Progress bar */}
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${progress.pct}%`,
                  background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)',
                }}
              />
            </div>

            {/* Phase indicators */}
            <div className="flex justify-between px-2">
              {(['analyzing', 'searching_eu', 'searching_national', 'searching_regional', 'matching', 'structuring'] as DiscoveryPhase[]).map((phase) => {
                const phaseInfo = getPhaseInfo(phase)
                const currentPct = progress.pct
                const isActive = progress.phase === phase
                const isDone = currentPct > phaseInfo.pct
                return (
                  <div key={phase} className="flex flex-col items-center gap-1.5">
                    <div className={cn(
                      'w-2 h-2 rounded-full transition-all duration-500',
                      isDone ? 'bg-blue-500' : isActive ? 'bg-blue-400 animate-pulse' : 'bg-slate-200'
                    )} />
                    <span className={cn(
                      'text-[10px] transition-colors duration-300',
                      isDone ? 'text-blue-600 font-medium' : isActive ? 'text-slate-600' : 'text-slate-300'
                    )}>
                      {PHASE_LABELS[phase]}
                    </span>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-slate-300 mt-8">
              Searching EU, national, and regional funding databases...
            </p>
          </div>
        </div>
      </AppShell>
    )
  }

  // Empty state: no grants, show discovery CTA
  if (grants.length === 0 && !discoveryResult) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center max-w-md">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(147, 51, 234, 0.06) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.12)',
              }}
            >
              <svg className="w-9 h-9 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 mb-3">Discover Your Grants</h1>
            <p className="text-sm text-slate-500 mb-2 leading-relaxed">
              We'll search EU, national, and regional funding databases to find every grant, loan, and tax credit your project qualifies for.
            </p>
            <p className="text-xs text-slate-400 mb-8">
              Based on your pre-application profile{project?.name ? ` for ${project.name}` : ''}
            </p>

            {discoveryError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100">
                <p className="text-sm text-rose-600">{discoveryError}</p>
                <p className="text-xs text-rose-400 mt-1">Please try again</p>
              </div>
            )}

            <button
              onClick={handleDiscover}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
                boxShadow: '0 8px 30px rgba(59, 130, 246, 0.3), 0 2px 8px rgba(59, 130, 246, 0.2)',
              }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Find My Grants
            </button>

            {!project?.onboarding_complete && (
              <p className="text-xs text-amber-600 mt-4">
                <Link href="/project" className="underline">Complete your pre-application</Link> first for better results
              </p>
            )}
          </div>
        </div>
      </AppShell>
    )
  }

  // Grants found: show mini-dashboard + list
  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Discovery success toast */}
        {discoveryResult && (
          <div
            className="mb-6 p-4 rounded-2xl flex items-center justify-between animate-slide-up"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(59, 130, 246, 0.04) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.12)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm text-emerald-800">
                Found <span className="font-semibold">{discoveryResult.found}</span> grants, <span className="font-semibold">{discoveryResult.saved}</span> new added to your library
              </p>
            </div>
            <button onClick={() => setDiscoveryResult(null)} className="text-emerald-400 hover:text-emerald-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Mini dashboard */}
        <div
          className="rounded-3xl p-6 mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.5) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Your Grants</h1>
              <p className="text-sm text-slate-500 mt-0.5">Matched to your project profile</p>
            </div>
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="btn-secondary text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Search Again
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-2xl" style={{ background: 'rgba(255, 255, 255, 0.5)' }}>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">{grants.length}</p>
              <p className="text-xs text-slate-500 mt-1">Grants Found</p>
            </div>
            <div className="text-center p-4 rounded-2xl" style={{ background: 'rgba(255, 255, 255, 0.5)' }}>
              <p className="text-3xl font-bold text-emerald-600 tracking-tight">{formatCurrency(totalPotentialValue)}</p>
              <p className="text-xs text-slate-500 mt-1">Total Potential Value</p>
            </div>
            <div className="text-center p-4 rounded-2xl" style={{ background: 'rgba(255, 255, 255, 0.5)' }}>
              <p className="text-3xl font-bold text-blue-600 tracking-tight">{openGrants}</p>
              <p className="text-xs text-slate-500 mt-1">Currently Open</p>
            </div>
            <div className="text-center p-4 rounded-2xl" style={{ background: 'rgba(255, 255, 255, 0.5)' }}>
              <p className="text-3xl font-bold text-violet-600 tracking-tight">{highRelevance}</p>
              <p className="text-xs text-slate-500 mt-1">High Relevance</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input type="text" placeholder="Search grants..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" />
            </div>
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="select-field w-40">
              <option value="">All Sources</option>
              {FUNDING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {(search || filterSource) && (
              <button onClick={() => { setSearch(''); setFilterSource('') }} className="btn-ghost text-xs">Clear</button>
            )}
          </div>
        </div>

        {/* Grant list */}
        <div className="space-y-2">
          {filtered.map((grant) => (
            <Link key={grant.id} href={`/grants/${grant.id}`} className="block">
              <div className="card-hover p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1">
                      <h3 className="text-sm font-semibold text-slate-800 truncate">{grant.name}</h3>
                      {grant.funding_source && (
                        <span className="badge bg-blue-50 text-blue-600 text-[10px] shrink-0">{grant.funding_source}</span>
                      )}
                      {grant.funding_type && grant.funding_type !== 'Grant' && (
                        <span className="badge bg-violet-50 text-violet-600 text-[10px] shrink-0">{grant.funding_type}</span>
                      )}
                    </div>
                    {grant.description && (
                      <p className="text-sm text-slate-500 line-clamp-1 mb-2">{grant.description}</p>
                    )}
                    <div className="flex items-center gap-4">
                      {grant.window_status && (
                        <span className={cn(
                          'text-[11px] font-medium',
                          grant.window_status === 'Open' || grant.window_status === 'Rolling' ? 'text-emerald-600' :
                          grant.window_status === 'Closing soon' ? 'text-amber-600' :
                          'text-slate-400'
                        )}>
                          {grant.window_status}
                        </span>
                      )}
                      {grant.application_window_closes && (
                        <span className="text-[11px] text-slate-400">Deadline: {grant.application_window_closes}</span>
                      )}
                      {grant.effort_level && (
                        <span className="text-[11px] text-slate-400">Effort: {grant.effort_level}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {(grant.max_amount || grant.min_amount) ? (
                      <p className="text-base font-bold text-slate-900">
                        {grant.max_amount ? formatCurrency(grant.max_amount) : formatCurrency(grant.min_amount)}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-300">Amount TBD</p>
                    )}
                    {grant.relevance_score !== null && (
                      <div className="flex items-center gap-1 mt-1.5 justify-end">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className={cn('w-1.5 h-1.5 rounded-full', i <= (grant.relevance_score || 0) ? 'bg-blue-400' : 'bg-slate-200')} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && grants.length > 0 && (
          <div className="card p-12 text-center">
            <p className="text-sm text-slate-500">No grants match your search</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
