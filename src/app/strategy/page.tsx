'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'

interface GrantStrategy {
  rank: number
  name: string
  name_local: string | null
  funding_source: string
  funding_type: string
  probability_of_success: 'High' | 'Medium' | 'Low'
  probability_reasoning: string
  potential_amount_min: number | null
  potential_amount_max: number | null
  co_financing_pct: number | null
  application_sequence: string
  preparation_weeks: number
  window_opens: string | null
  window_closes: string | null
  window_status: string | null
  required_documents: {
    document: string
    description: string
    status: 'likely_ready' | 'needs_preparation' | 'missing' | 'blocked'
    effort: 'Low' | 'Medium' | 'High'
    estimated_cost_eur: number | null
  }[]
  blockers: {
    blocker: string
    severity: 'critical' | 'warning' | 'info'
    resolution: string
    resolution_time: string
  }[]
  why_apply: string
  risks: string
  official_url: string | null
  regulation_reference: string | null
}

interface BlockerSummary {
  blocker: string
  severity: 'critical' | 'warning' | 'info'
  affects_grants: string[]
  resolution: string
  resolution_time: string
}

interface ActionPhase {
  phase: string
  actions: {
    action: string
    why: string
    owner: string
    deadline: string
  }[]
}

interface Strategy {
  id?: string
  executive_summary: string
  grants_ranked: GrantStrategy[]
  blockers_summary: BlockerSummary[]
  action_plan: ActionPhase[]
  total_potential_value: number
  total_grants_analyzed: number
  high_probability_count: number
  generated_at?: string
}

const PROB_COLORS = {
  High: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-50 text-slate-500 border-slate-200',
}

const SEVERITY_COLORS = {
  critical: 'bg-rose-50 text-rose-700 border-rose-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-600 border-blue-200',
}

const DOC_STATUS_COLORS = {
  likely_ready: 'text-emerald-600',
  needs_preparation: 'text-amber-600',
  missing: 'text-rose-600',
  blocked: 'text-rose-700 font-semibold',
}

export default function StrategyPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genPhase, setGenPhase] = useState('')
  const [genPct, setGenPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [expandedGrant, setExpandedGrant] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'grants' | 'blockers' | 'action'>('grants')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [projRes, stratRes] = await Promise.all([
      supabase.from('projects').select('*').limit(1).single(),
      supabase.from('strategies').select('*').order('generated_at', { ascending: false }).limit(1).single(),
    ])
    if (projRes.data) setProject(projRes.data)
    if (stratRes.data) setStrategy(stratRes.data as unknown as Strategy)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleGenerate() {
    if (!project || generating) return
    setGenerating(true)
    setError(null)
    setGenPhase('Analyzing your project profile...')
    setGenPct(5)

    // Simulate progress phases while waiting for API
    const phases = [
      { msg: 'Searching EU funding databases...', pct: 15, delay: 3000 },
      { msg: 'Searching national programs...', pct: 30, delay: 5000 },
      { msg: 'Searching regional funds...', pct: 45, delay: 4000 },
      { msg: 'Evaluating eligibility criteria...', pct: 60, delay: 4000 },
      { msg: 'Ranking by probability of success...', pct: 72, delay: 3000 },
      { msg: 'Identifying blockers and prerequisites...', pct: 82, delay: 3000 },
      { msg: 'Building action plan...', pct: 90, delay: 2000 },
    ]

    let phaseIndex = 0
    const interval = setInterval(() => {
      if (phaseIndex < phases.length) {
        setGenPhase(phases[phaseIndex].msg)
        setGenPct(phases[phaseIndex].pct)
        phaseIndex++
      }
    }, 4000)

    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project }),
      })

      clearInterval(interval)

      // Safely parse the response (handle both JSON and non-JSON)
      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('Server returned an unexpected response. Please try again.')
      }

      if (!res.ok) {
        throw new Error(data?.error || `Strategy generation failed (status ${res.status})`)
      }

      if (!data.grants_ranked || !Array.isArray(data.grants_ranked)) {
        throw new Error('Strategy data was incomplete. Please try again.')
      }

      setGenPhase('Saving strategy...')
      setGenPct(95)

      // Save to database
      const { data: saved, error: saveErr } = await supabase.from('strategies').insert({
        project_id: project.id,
        executive_summary: data.executive_summary,
        grants_ranked: data.grants_ranked,
        blockers: data.blockers_summary,
        action_plan: data.action_plan,
        total_potential_value: data.total_potential_value,
        total_grants_analyzed: data.total_grants_analyzed,
        high_probability_count: data.high_probability_count,
      }).select().single()

      if (saved) {
        setStrategy({ ...data, id: saved.id, blockers_summary: data.blockers_summary })
      } else {
        setStrategy(data)
      }

      setGenPct(100)
      setGenPhase('Complete!')
    } catch (err: any) {
      clearInterval(interval)
      setError(err.message || 'Something went wrong. Please try again.')
    }
    setGenerating(false)
  }

  async function handleExportPDF() {
    if (!strategy) return
    // Open PDF export in new tab (we'll build this as a simple print-friendly page)
    const params = new URLSearchParams({ id: strategy.id || 'latest' })
    window.open(`/strategy/print?${params.toString()}`, '_blank')
  }

  if (loading) {
    return <AppShell><div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div></AppShell>
  }

  // Generating state
  if (generating) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="w-full max-w-lg text-center">
            <div className="relative inline-flex items-center justify-center w-20 h-20 mb-8">
              <div className="absolute inset-0 rounded-3xl animate-pulse" style={{ background: 'linear-gradient(135deg, rgba(147,51,234,0.1) 0%, rgba(59,130,246,0.08) 100%)', border: '1px solid rgba(147,51,234,0.15)' }} />
              <svg className="w-9 h-9 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ animation: 'pulse 2s ease-in-out infinite' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Building Your Strategy</h2>
            <p className="text-sm text-slate-500 mb-8">{genPhase}</p>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
              <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${genPct}%`, background: 'linear-gradient(90deg, #8b5cf6 0%, #3b82f6 100%)' }} />
            </div>
            <p className="text-xs text-slate-400">This takes 60-90 seconds. We're searching funding databases across the EU.</p>
          </div>
        </div>
      </AppShell>
    )
  }

  // No strategy yet
  if (!strategy) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center max-w-lg">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6" style={{ background: 'linear-gradient(135deg, rgba(147,51,234,0.08) 0%, rgba(59,130,246,0.06) 100%)', border: '1px solid rgba(147,51,234,0.12)' }}>
              <svg className="w-9 h-9 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 mb-3">Grant Application Strategy</h1>
            <p className="text-sm text-slate-500 mb-2 leading-relaxed">
              AI will analyze your project profile, search current EU, national, and regional funding programs,
              and build a ranked strategy with the top grants, required documents, blockers, and an action plan.
            </p>
            <p className="text-xs text-slate-400 mb-8">
              Based on your pre-application profile{project?.name ? ` for ${project.name}` : ''}
            </p>
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100">
                <p className="text-sm text-rose-600">{error}</p>
              </div>
            )}
            {!project?.onboarding_complete && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-sm text-amber-700">Your project profile is incomplete. The strategy will be more accurate with a complete profile.</p>
                <Link href="/project" className="text-xs text-amber-600 font-medium hover:text-amber-800 mt-1 inline-block">Complete your profile →</Link>
              </div>
            )}
            <button onClick={handleGenerate} className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)', boxShadow: '0 8px 30px rgba(124,58,237,0.3)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Build My Strategy
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  // Strategy exists: render the full document
  const criticalBlockers = (strategy.blockers_summary || (strategy as any).blockers || []).filter((b: BlockerSummary) => b.severity === 'critical')
  const warningBlockers = (strategy.blockers_summary || (strategy as any).blockers || []).filter((b: BlockerSummary) => b.severity === 'warning')
  const allBlockers = strategy.blockers_summary || (strategy as any).blockers || []
  const actionPlan = strategy.action_plan || []

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="card p-6 mb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-semibold text-slate-900">Grant Strategy</h1>
                <span className="badge bg-violet-50 text-violet-600">
                  {strategy.total_grants_analyzed} grants analyzed
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{strategy.executive_summary}</p>
              {strategy.generated_at && (
                <p className="text-xs text-slate-400 mt-2">Generated {new Date(strategy.generated_at).toLocaleDateString()}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-400 mb-0.5">Total Potential Value</p>
              <p className="text-3xl font-bold text-slate-900">{formatCurrency(strategy.total_potential_value)}</p>
              <p className="text-xs text-slate-400 mt-1">{strategy.high_probability_count} high probability</p>
            </div>
          </div>
          <div className="mt-5 pt-5 flex items-center gap-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            <button onClick={handleGenerate} className="btn-secondary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
              Regenerate
            </button>
            <button onClick={handleExportPDF} className="btn-secondary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Export PDF
            </button>
          </div>
        </div>

        {/* Critical blockers alert */}
        {criticalBlockers.length > 0 && (
          <div className="p-5 rounded-2xl mb-4" style={{ background: 'rgba(244,63,94,0.04)', border: '1px solid rgba(244,63,94,0.12)' }}>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <h2 className="text-sm font-semibold text-rose-800">{criticalBlockers.length} Critical Blocker{criticalBlockers.length > 1 ? 's' : ''}</h2>
            </div>
            <div className="space-y-2">
              {criticalBlockers.map((b: BlockerSummary, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/60">
                  <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-rose-600">!</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-rose-800">{b.blocker}</p>
                    <p className="text-xs text-rose-600 mt-0.5">{b.resolution} ({b.resolution_time})</p>
                    {b.affects_grants?.length > 0 && (
                      <p className="text-[10px] text-rose-400 mt-1">Blocks: {b.affects_grants.join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex items-center gap-1 mb-4 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
          {[
            { key: 'grants', label: `Top ${strategy.grants_ranked.length} Grants`, icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75' },
            { key: 'blockers', label: `Blockers (${allBlockers.length})`, icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
            { key: 'action', label: 'Action Plan', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} /></svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content: Grants */}
        {activeTab === 'grants' && (
          <div className="space-y-3">
            {strategy.grants_ranked.map((grant, i) => (
              <div key={i} className="card overflow-hidden">
                {/* Compact row */}
                <button
                  onClick={() => setExpandedGrant(expandedGrant === i ? null : i)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/40 transition-colors"
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0',
                    grant.probability_of_success === 'High' ? 'bg-emerald-50 text-emerald-600' :
                    grant.probability_of_success === 'Medium' ? 'bg-amber-50 text-amber-600' :
                    'bg-slate-50 text-slate-400'
                  )}>
                    {grant.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">{grant.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', PROB_COLORS[grant.probability_of_success])}>
                        {grant.probability_of_success}
                      </span>
                      <span className="badge bg-blue-50 text-blue-600 text-[10px]">{grant.funding_source}</span>
                      <span className="text-[10px] text-slate-400">{grant.application_sequence}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(grant.potential_amount_max || grant.potential_amount_min || 0)}</p>
                    {grant.window_status && (
                      <p className={cn('text-[10px]', grant.window_status === 'Open' ? 'text-emerald-600' : 'text-slate-400')}>{grant.window_status}</p>
                    )}
                  </div>
                  <svg className={cn('w-4 h-4 text-slate-300 transition-transform', expandedGrant === i && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {expandedGrant === i && (
                  <div className="px-5 pb-5 animate-fade-in" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                    <div className="grid grid-cols-2 gap-6 pt-5">
                      {/* Left: Details */}
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-800 mb-1.5">Why Apply</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">{grant.why_apply}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-800 mb-1.5">Probability Reasoning</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">{grant.probability_reasoning}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-800 mb-1.5">Risks</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">{grant.risks}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          {grant.preparation_weeks && <span>Prep: ~{grant.preparation_weeks} weeks</span>}
                          {grant.co_financing_pct !== null && <span>Co-financing: {grant.co_financing_pct}%</span>}
                          {grant.window_closes && <span>Deadline: {grant.window_closes}</span>}
                        </div>
                        {(grant.official_url || grant.regulation_reference) && (
                          <div className="flex items-center gap-3">
                            {grant.official_url && (
                              <a href={grant.official_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700">Official page →</a>
                            )}
                            {grant.regulation_reference && (
                              <span className="text-xs text-slate-400">{grant.regulation_reference}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Documents + Blockers */}
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-800 mb-2">Required Documents</h4>
                          <div className="space-y-1.5">
                            {grant.required_documents?.map((doc, j) => (
                              <div key={j} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.015)' }}>
                                <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                                  doc.status === 'likely_ready' ? 'bg-emerald-400' :
                                  doc.status === 'needs_preparation' ? 'bg-amber-400' :
                                  'bg-rose-400'
                                )} />
                                <div className="flex-1">
                                  <p className={cn('text-xs font-medium', DOC_STATUS_COLORS[doc.status])}>{doc.document}</p>
                                  <p className="text-[10px] text-slate-400">{doc.description}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[10px] text-slate-400">{doc.effort}</span>
                                  {doc.estimated_cost_eur && (
                                    <p className="text-[10px] text-slate-400">{formatCurrency(doc.estimated_cost_eur)}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {grant.blockers?.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-slate-800 mb-2">Blockers</h4>
                            <div className="space-y-1.5">
                              {grant.blockers.map((b, j) => (
                                <div key={j} className={cn('p-2.5 rounded-lg border text-xs', SEVERITY_COLORS[b.severity])}>
                                  <p className="font-medium">{b.blocker}</p>
                                  <p className="mt-0.5 opacity-80">{b.resolution} ({b.resolution_time})</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab content: Blockers */}
        {activeTab === 'blockers' && (
          <div className="space-y-3">
            {allBlockers.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-sm text-emerald-600 font-medium">No blockers identified</p>
                <p className="text-xs text-slate-400 mt-1">Your project is well-positioned for all recommended grants</p>
              </div>
            ) : (
              allBlockers.map((b: BlockerSummary, i: number) => (
                <div key={i} className={cn('p-5 rounded-2xl border', SEVERITY_COLORS[b.severity])}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{b.blocker}</p>
                      <p className="text-sm mt-2 opacity-80">{b.resolution}</p>
                      <p className="text-xs mt-1 opacity-60">Estimated time: {b.resolution_time}</p>
                    </div>
                    <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full border uppercase', SEVERITY_COLORS[b.severity])}>
                      {b.severity}
                    </span>
                  </div>
                  {b.affects_grants?.length > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                      <p className="text-[10px] font-medium opacity-60 mb-1">Affects these grants:</p>
                      <div className="flex flex-wrap gap-1">
                        {b.affects_grants.map((g, j) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-white/50">{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab content: Action Plan */}
        {activeTab === 'action' && (
          <div className="space-y-4">
            {actionPlan.map((phase: ActionPhase, i: number) => (
              <div key={i} className="card p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">{phase.phase}</h3>
                <div className="space-y-2">
                  {phase.actions?.map((action, j) => (
                    <div key={j} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.015)' }}>
                      <div className="w-6 h-6 rounded-lg bg-violet-50 flex items-center justify-center text-xs font-bold text-violet-600 shrink-0 mt-0.5">
                        {j + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{action.action}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{action.why}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {action.owner && <span className="text-[10px] text-slate-400">Owner: {action.owner}</span>}
                          {action.deadline && <span className="text-[10px] text-slate-400">By: {action.deadline}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
