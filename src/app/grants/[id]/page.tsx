'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, STAGE_COLORS } from '@/lib/supabase'
import type { Grant, GrantApplication, Project, Consultant } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil, cn } from '@/lib/utils'
import { getGrantProjection, getProbabilityDisplay } from '@/lib/projections'

interface FoundConsultant {
  name: string
  organization: string | null
  specialization: string | null
  region: string | null
  email: string | null
  phone: string | null
  website: string | null
  notes: string | null
  match_score?: number | null
  match_reasoning?: string | null
  is_existing?: boolean
  is_verified?: boolean
  verification?: {
    source: string
    website_verified: boolean | null
    email_verified: boolean | null
  } | null
}

interface ConsultantSearchStats {
  existing_scored: number
  web_discovered: number
  sites_checked: number
  total: number
}

export default function GrantDetailPage() {
  const params = useParams()
  const [grant, setGrant] = useState<Grant | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [applications, setApplications] = useState<GrantApplication[]>([])
  const [loading, setLoading] = useState(true)

  // AI analysis
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Consultant search
  const [searchingConsultants, setSearchingConsultants] = useState(false)
  const [searchCompleted, setSearchCompleted] = useState(false)
  const [foundConsultants, setFoundConsultants] = useState<FoundConsultant[]>([])
  const [consultantError, setConsultantError] = useState<string | null>(null)
  const [savedConsultantIds, setSavedConsultantIds] = useState<Set<string>>(new Set())
  const [searchStats, setSearchStats] = useState<ConsultantSearchStats | null>(null)
  const [dbConsultants, setDbConsultants] = useState<FoundConsultant[]>([])
  const [showDbFallback, setShowDbFallback] = useState(false)

  const fetchData = useCallback(async () => {
    const id = params.id as string
    const [grantRes, appsRes, projRes] = await Promise.all([
      supabase.from('grants').select('*, category:grant_categories(*)').eq('id', id).single(),
      supabase.from('grant_applications').select('*').eq('grant_id', id).order('created_at', { ascending: false }),
      supabase.from('projects').select('*').limit(1).single(),
    ])
    if (grantRes.data) setGrant(grantRes.data)
    if (appsRes.data) setApplications(appsRes.data)
    if (projRes.data) setProject(projRes.data)
    setLoading(false)

    // Auto-trigger analysis if fields are empty
    if (grantRes.data && projRes.data && !grantRes.data.why_relevant) {
      runAnalysis(grantRes.data, projRes.data)
    }
  }, [params.id])

  useEffect(() => { fetchData() }, [fetchData])

  async function runAnalysis(g: Grant, p: Project) {
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const res = await fetch('/api/analyze-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant: g, project: p }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json()

      await supabase.from('grants').update({
        why_relevant: data.why_relevant,
        risks: data.risks,
        who_is_it_for: data.who_is_it_for,
      }).eq('id', g.id)

      setGrant((prev) => prev ? { ...prev, why_relevant: data.why_relevant, risks: data.risks, who_is_it_for: data.who_is_it_for } : null)
    } catch (err: any) {
      setAnalysisError(err.message)
    }
    setAnalyzing(false)
  }

  async function handleFindConsultants() {
    if (!grant || !project || searchingConsultants) return
    setSearchingConsultants(true)
    setSearchCompleted(false)
    setConsultantError(null)
    setFoundConsultants([])
    setSearchStats(null)
    setShowDbFallback(false)
    try {
      const res = await fetch('/api/match-consultants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant, project }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Search failed' }))
        throw new Error(errData.error || `Search failed (${res.status})`)
      }
      const data = await res.json()
      setFoundConsultants(data.consultants || [])
      setSearchStats(data.stats || null)

      // If no results, fetch all DB consultants as fallback
      if (!data.consultants || data.consultants.length === 0) {
        const { data: allConsultants } = await supabase
          .from('consultants')
          .select('*')
          .order('name')
        if (allConsultants && allConsultants.length > 0) {
          setDbConsultants(allConsultants.map((c: any) => ({
            ...c,
            match_score: null,
            match_reasoning: 'Saved in your consultant database',
            is_existing: true,
            is_verified: true,
          })))
        }
      }
    } catch (err: any) {
      setConsultantError(err.message || 'Search failed')
      // On error, also try to load DB consultants as fallback
      try {
        const { data: allConsultants } = await supabase
          .from('consultants')
          .select('*')
          .order('name')
        if (allConsultants && allConsultants.length > 0) {
          setDbConsultants(allConsultants.map((c: any) => ({
            ...c,
            match_score: null,
            match_reasoning: 'Saved in your consultant database',
            is_existing: true,
            is_verified: true,
          })))
        }
      } catch { /* DB fallback failed too */ }
    }
    setSearchingConsultants(false)
    setSearchCompleted(true)
  }

  async function saveConsultant(c: FoundConsultant) {
    // Check if already exists
    const { data: existing } = await supabase.from('consultants').select('id').eq('name', c.name).limit(1)
    if (existing && existing.length > 0) {
      setSavedConsultantIds((prev) => new Set(prev).add(c.name))
      return
    }
    await supabase.from('consultants').insert({
      name: c.name,
      organization: c.organization,
      specialization: c.specialization,
      region: c.region,
      email: c.email,
      phone: c.phone,
      website: c.website,
      notes: c.notes,
    })
    setSavedConsultantIds((prev) => new Set(prev).add(c.name))
  }

  async function handleAddToPipeline() {
    if (!grant || !project) return
    await supabase.from('grant_applications').insert({
      project_id: project.id,
      grant_id: grant.id,
      stage: 'Discovered',
      target_amount: grant.max_amount,
    })
    fetchData()
  }

  if (loading) return <AppShell><div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div></AppShell>
  if (!grant) return <AppShell><div className="card p-16 text-center"><p className="text-sm text-slate-500">Grant not found</p><Link href="/grants" className="btn-primary mt-4 inline-flex">Back to grants</Link></div></AppShell>

  const deadlineDays = daysUntil(grant.application_window_closes)
  const inPipeline = applications.length > 0

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/grants" className="text-slate-400 hover:text-slate-600 transition-colors">Grants</Link>
          <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          <span className="text-slate-700 font-medium truncate max-w-xs">{grant.name}</span>
        </div>

        {/* Header */}
        <div className="card p-6 mb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-semibold text-slate-900">{grant.name}</h1>
                {grant.funding_source && <span className="badge bg-blue-50 text-blue-600">{grant.funding_source}</span>}
                {grant.funding_type && grant.funding_type !== 'Grant' && <span className="badge bg-violet-50 text-violet-600">{grant.funding_type}</span>}
              </div>
              {grant.name_it && <p className="text-sm text-slate-400 italic mb-2">{grant.name_it}</p>}
            </div>
            <div className="text-right shrink-0">
              {(grant.min_amount || grant.max_amount) && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Potential Value</p>
                  <p className="text-2xl font-bold text-slate-900">{grant.max_amount ? formatCurrency(grant.max_amount) : formatCurrency(grant.min_amount)}</p>
                  {grant.min_amount && grant.max_amount && <p className="text-xs text-slate-400">from {formatCurrency(grant.min_amount)}</p>}
                </div>
              )}
            </div>
          </div>

          {/* CTAs */}
          <div className="mt-5 pt-5 flex items-center gap-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            {!inPipeline ? (
              <button onClick={handleAddToPipeline} className="btn-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add to Pipeline
              </button>
            ) : (
              <Link href={`/pipeline/${applications[0].id}`} className="btn-secondary">View in Pipeline</Link>
            )}
            <button disabled className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white/60 cursor-not-allowed" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.3) 0%, rgba(124,58,237,0.3) 100%)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              Apply with AI
              <span className="text-[10px] font-normal opacity-70 ml-1">Coming Soon</span>
            </button>
            {grant.official_url && (
              <a href={grant.official_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                Official Page
              </a>
            )}
          </div>
        </div>

        {/* Description + Who is it for */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="col-span-2 space-y-4">
            {grant.description && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">About This Grant</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{grant.description}</p>
              </div>
            )}

            {grant.who_is_it_for && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Who Is It For</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{grant.who_is_it_for}</p>
              </div>
            )}

            {grant.eligibility_summary && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Eligibility Criteria</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{grant.eligibility_summary}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Key details */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Key Details</h2>
              <div className="space-y-3">
                <InfoRow label="Source" value={grant.funding_source} />
                <InfoRow label="Type" value={grant.funding_type} />
                <InfoRow label="Effort" value={grant.effort_level} />
                <InfoRow label="Co-financing" value={grant.co_financing_pct !== null ? `${grant.co_financing_pct}%` : null} />
                <InfoRow label="Window" value={
                  grant.window_status ? (
                    <span className={cn('font-medium', grant.window_status === 'Open' || grant.window_status === 'Rolling' ? 'text-emerald-600' : grant.window_status === 'Closing soon' ? 'text-amber-600' : '')}>
                      {grant.window_status}
                    </span>
                  ) : null
                } />
                <InfoRow label="Deadline" value={
                  grant.application_window_closes ? (
                    <span className="flex items-center gap-2">
                      {grant.application_window_closes}
                      {deadlineDays !== null && deadlineDays > 0 && deadlineDays <= 30 && <span className="badge bg-amber-50 text-amber-600 text-[10px]">{deadlineDays}d left</span>}
                    </span>
                  ) : null
                } />
                <InfoRow label="Regulation" value={grant.regulation_reference} />
              </div>
            </div>

            {/* Requirements */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Requirements</h2>
              <div className="space-y-2">
                <ReqFlag label="Young Farmer" met={grant.requires_young_farmer} />
                <ReqFlag label="Agricultural Entity" met={grant.requires_agricultural_entity} />
                <ReqFlag label="BSA Heritage" met={grant.requires_bsa_heritage} />
              </div>
            </div>

            {/* Match Score */}
            {grant.relevance_score !== null && (
              <div className="card p-6">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Match Score</p>
                <div className="flex items-center gap-3 mb-2">
                  <span className={cn(
                    'text-2xl font-bold',
                    (grant.relevance_score || 0) >= 70 ? 'text-emerald-600' :
                    (grant.relevance_score || 0) >= 50 ? 'text-blue-600' : 'text-slate-500'
                  )}>
                    {grant.relevance_score}%
                  </span>
                  <span className="text-xs text-slate-400">match</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      (grant.relevance_score || 0) >= 70 ? 'bg-emerald-400' :
                      (grant.relevance_score || 0) >= 50 ? 'bg-blue-400' : 'bg-slate-300'
                    )}
                    style={{ width: `${grant.relevance_score || 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Realistic Projection */}
            {(grant.max_amount || grant.min_amount) && (() => {
              const projection = getGrantProjection(grant)
              const display = getProbabilityDisplay(projection.combinedProbability)
              return (
                <div className="card p-6">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Realistic Projection</p>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn('text-xs font-bold px-2.5 py-1 rounded-lg', display.bgColor, display.color)}>
                      {display.percentage}% probability
                    </span>
                    <span className={cn('text-xs font-medium', display.color)}>{display.label}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Expected value</span>
                      <span className="text-sm font-bold text-emerald-600">{formatCurrency(projection.expectedValue)}</span>
                    </div>
                    {projection.expectedMin > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Expected min</span>
                        <span className="text-sm font-medium text-slate-600">{formatCurrency(projection.expectedMin)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Relevance: {projection.probability * 100}%</span>
                      <span>Status: x{projection.statusMultiplier}</span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* AI-generated sections: Why Relevant + Risks */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              <h2 className="text-sm font-semibold text-slate-800">Why This Grant Fits Your Project</h2>
            </div>
            {analyzing ? (
              <div className="flex items-center gap-2 py-4"><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-slate-400">Analyzing match...</span></div>
            ) : grant.why_relevant ? (
              <p className="text-sm text-slate-600 leading-relaxed">{grant.why_relevant}</p>
            ) : analysisError ? (
              <div>
                <p className="text-xs text-rose-500 mb-2">{analysisError}</p>
                <button onClick={() => grant && project && runAnalysis(grant, project)} className="btn-ghost text-xs">Retry</button>
              </div>
            ) : (
              <button onClick={() => grant && project && runAnalysis(grant, project)} className="btn-secondary text-xs">Analyze Match</button>
            )}
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <h2 className="text-sm font-semibold text-slate-800">Risks and Challenges</h2>
            </div>
            {analyzing ? (
              <div className="flex items-center gap-2 py-4"><div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-slate-400">Assessing risks...</span></div>
            ) : grant.risks ? (
              <p className="text-sm text-slate-600 leading-relaxed">{grant.risks}</p>
            ) : (
              <p className="text-xs text-slate-300 italic py-4">Analysis pending</p>
            )}
          </div>
        </div>

        {/* Notes */}
        {grant.notes && (
          <div className="card p-6 mb-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Notes</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{grant.notes}</p>
          </div>
        )}

        {/* CONSULTANT DISCOVERY SECTION */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
              <h2 className="text-base font-semibold text-slate-900">Find Consultants</h2>
            </div>
            {foundConsultants.length > 0 && (
              <div className="flex items-center gap-2">
                {searchStats && (
                  <span className="text-[10px] text-slate-400">
                    {searchStats.existing_scored > 0 && `${searchStats.existing_scored} from DB`}
                    {searchStats.existing_scored > 0 && searchStats.web_discovered > 0 && ' + '}
                    {searchStats.web_discovered > 0 && `${searchStats.web_discovered} discovered`}
                  </span>
                )}
                <span className="text-xs font-medium text-slate-500">{foundConsultants.length} found</span>
              </div>
            )}
          </div>

          {searchingConsultants ? (
            <div className="py-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3" style={{ background: 'rgba(139,92,246,0.06)' }}>
                <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-sm text-slate-600 mb-1">Searching for consultants...</p>
              <p className="text-xs text-slate-400">Scoring database matches, searching the web, verifying contacts</p>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-4 max-w-xs mx-auto">
                <div className="h-full rounded-full animate-pulse" style={{ width: '60%', background: 'linear-gradient(90deg, #8b5cf6 0%, #3b82f6 100%)' }} />
              </div>
            </div>
          ) : foundConsultants.length > 0 ? (
            <div className="space-y-2">
              {foundConsultants.map((c, i) => {
                const isSaved = savedConsultantIds.has(c.name)
                const scoreColor = (c.match_score || 0) >= 70 ? 'text-emerald-600 bg-emerald-50' :
                  (c.match_score || 0) >= 50 ? 'text-blue-600 bg-blue-50' :
                  (c.match_score || 0) >= 30 ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-50'
                return (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid rgba(0,0,0,0.03)' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-violet-600 shrink-0" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.1)' }}>
                      {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-semibold text-slate-800">{c.name}</h3>
                        {c.match_score != null && (
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md', scoreColor)}>
                            {c.match_score}% match
                          </span>
                        )}
                        {c.is_existing && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-500">In Database</span>
                        )}
                        {c.is_verified && !c.is_existing && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-500">Verified</span>
                        )}
                      </div>
                      {c.organization && <p className="text-xs text-slate-400">{c.organization}</p>}
                      {c.specialization && <p className="text-xs text-slate-500 mt-1">{c.specialization}</p>}
                      {c.match_reasoning && <p className="text-xs text-slate-400 mt-1 italic">{c.match_reasoning}</p>}
                      <div className="flex items-center gap-4 mt-2">
                        {c.email && <a href={`mailto:${c.email}`} className="text-xs text-blue-600 hover:text-blue-700">{c.email}</a>}
                        {c.phone && <span className="text-xs text-slate-500">{c.phone}</span>}
                        {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700">Website</a>}
                      </div>
                    </div>
                    {!c.is_existing && (
                      <button
                        onClick={() => saveConsultant(c)}
                        disabled={isSaved}
                        className={cn('btn-secondary text-xs shrink-0', isSaved && 'opacity-50 cursor-default')}
                      >
                        {isSaved ? (
                          <><svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> Saved</>
                        ) : (
                          <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg> Save</>
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
              <div className="pt-2 flex items-center justify-between">
                <button onClick={handleFindConsultants} className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                  Search again
                </button>
                <Link href="/consultants" className="text-xs text-blue-600 hover:text-blue-700">View all saved consultants &rarr;</Link>
              </div>
            </div>
          ) : searchCompleted ? (
            /* Search completed but found nothing */
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3" style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.1)' }}>
                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
              </div>
              {consultantError ? (
                <>
                  <p className="text-sm font-medium text-slate-700 mb-1">Search encountered an issue</p>
                  <p className="text-xs text-rose-500 mb-3">{consultantError}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700 mb-1">No consultants found for this specific grant</p>
                  <p className="text-xs text-slate-400 mb-3">
                    We searched the web and your database but couldn't find specialists matching this exact grant type.
                    {searchStats && searchStats.sites_checked > 0 && ` Checked ${searchStats.sites_checked} websites.`}
                  </p>
                </>
              )}

              {/* DB fallback section */}
              {dbConsultants.length > 0 && !showDbFallback && (
                <button
                  onClick={() => setShowDbFallback(true)}
                  className="btn-secondary text-xs mb-3"
                >
                  Show {dbConsultants.length} consultant{dbConsultants.length !== 1 ? 's' : ''} from your database
                </button>
              )}

              <div className="flex items-center justify-center gap-3">
                <button onClick={handleFindConsultants} className="btn-secondary text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  Try Again
                </button>
                <Link href="/consultants" className="btn-ghost text-xs">
                  Browse All Consultants
                </Link>
              </div>

              {/* Show DB fallback consultants */}
              {showDbFallback && dbConsultants.length > 0 && (
                <div className="mt-4 pt-4 text-left" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">From Your Database</p>
                  <div className="space-y-2">
                    {dbConsultants.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.01)', border: '1px solid rgba(0,0,0,0.03)' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold text-violet-600 shrink-0" style={{ background: 'rgba(139,92,246,0.06)' }}>
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs font-semibold text-slate-700">{c.name}</h3>
                          {c.specialization && <p className="text-[10px] text-slate-400 mt-0.5">{c.specialization}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            {c.email && <a href={`mailto:${c.email}`} className="text-[10px] text-blue-600">{c.email}</a>}
                            {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600">Website</a>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Initial state: not yet searched */
            <div className="text-center py-6">
              <p className="text-sm text-slate-500 mb-1">Find grant application specialists in your area</p>
              <p className="text-xs text-slate-400 mb-4">We'll score your saved consultants, then search the web for new specialists matching this grant</p>
              <button onClick={handleFindConsultants} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                Find Consultants
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode | string | null }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-slate-400">{label}</p>
      <div className="text-sm text-slate-700 text-right">{value || <span className="text-slate-300">N/A</span>}</div>
    </div>
  )
}

function ReqFlag({ label, met }: { label: string; met: boolean | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn('w-4 h-4 rounded-md flex items-center justify-center text-white', met ? 'bg-blue-500' : 'bg-slate-200')}>
        {met && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
      </div>
      <span className="text-xs text-slate-600">{label}</span>
    </div>
  )
}
