'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, STAGE_COLORS } from '@/lib/supabase'
import type { Grant, GrantApplication, Project, Consultant } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil, cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import { getGrantProjection, getProbabilityDisplay } from '@/lib/projections'
import VerificationBadge from '@/components/VerificationBadge'

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
  const router = useRouter()
  const [grant, setGrant] = useState<Grant | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [applications, setApplications] = useState<GrantApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)

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

  // Verification
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any>(null)

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
      const res = await apiFetch('/api/analyze-grant', {
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
      const res = await apiFetch('/api/match-consultants', {
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

  async function handleApply() {
    if (!grant || !project || applying) return
    setApplying(true)
    try {
      // Step 1: Add to pipeline if not already there
      let pipelineId: string
      if (applications.length > 0) {
        pipelineId = applications[0].id
      } else {
        const { data: newPipeline } = await supabase.from('grant_applications').insert({
          project_id: project.id,
          grant_id: grant.id,
          stage: 'Preparing Application',
          target_amount: grant.max_amount,
        }).select().single()
        if (!newPipeline) throw new Error('Failed to create pipeline entry')
        pipelineId = newPipeline.id
      }

      // Step 2: Check if workspace already exists
      const { data: existing } = await supabase
        .from('applications')
        .select('id')
        .eq('grant_application_id', pipelineId)
        .limit(1)

      if (existing && existing.length > 0) {
        // Workspace exists, navigate directly
        router.push(`/applications/${existing[0].id}`)
        return
      }

      // Step 3: Create application workspace
      const { data: newApp } = await supabase
        .from('applications')
        .insert({ grant_application_id: pipelineId, status: 'in_progress' })
        .select()
        .single()

      if (!newApp) throw new Error('Failed to create application workspace')

      // Step 4: Create default sections
      await supabase.from('application_sections').insert([
        { application_id: newApp.id, section_type: 'proposal', title: 'Proposal Builder' },
        { application_id: newApp.id, section_type: 'budget', title: 'Budget Planner' },
        { application_id: newApp.id, section_type: 'documents', title: 'Document Vault' },
        { application_id: newApp.id, section_type: 'review', title: 'Review & Export' },
      ])

      // Step 5: Update pipeline stage
      await supabase.from('grant_applications').update({
        stage: 'Preparing Application',
        updated_at: new Date().toISOString(),
      }).eq('id', pipelineId)

      // Step 6: Log activity
      await supabase.from('grant_activity_log').insert({
        application_id: pipelineId,
        grant_id: grant.id,
        action: 'Application started',
        details: 'Started from grant detail page',
        performed_by: 'User',
      })

      // Navigate to workspace
      router.push(`/applications/${newApp.id}`)
    } catch (err) {
      console.error('Apply error:', err)
      setApplying(false)
    }
  }

  async function handleVerify() {
    if (!grant || verifying) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await apiFetch('/api/verify-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_id: grant.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Verification failed' }))
        throw new Error(err.error || 'Verification failed')
      }
      const data = await res.json()
      setVerifyResult(data)
      fetchData() // Refresh grant data with new verification status
    } catch (err: any) {
      setVerifyResult({ error: err.message })
    }
    setVerifying(false)
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
            <button
              onClick={handleApply}
              disabled={applying}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}
            >
              {applying ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
              )}
              {applying ? 'Starting...' : 'Apply'}
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

            {/* Data Verification */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Data Verification</p>
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="text-[10px] text-blue-500 hover:text-blue-600 font-medium disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : grant.last_verified_at ? 'Re-verify' : 'Verify Now'}
                </button>
              </div>

              {verifying ? (
                <div className="flex items-center gap-2 py-3">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-500">Checking URL, cross-referencing data, scoring source...</span>
                </div>
              ) : (
                <>
                  <VerificationBadge
                    status={grant.verification_status}
                    confidence={grant.verification_confidence}
                    lastVerifiedAt={grant.last_verified_at}
                    size="lg"
                  />

                  {/* Show verification details if available */}
                  {grant.verification_details && Object.keys(grant.verification_details).length > 0 && (
                    <div className="mt-3 space-y-2">
                      {grant.verification_details.source_type && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Source type</span>
                          <span className="text-slate-600 font-medium">{grant.verification_details.source_type.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {grant.verification_details.checks_passed !== undefined && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Checks passed</span>
                          <span className="text-slate-600 font-medium">{grant.verification_details.checks_passed}/{grant.verification_details.checks_total}</span>
                        </div>
                      )}
                      {grant.verification_details.crossref_ran && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Cross-referenced</span>
                          <span className="text-emerald-600 font-medium">Yes</span>
                        </div>
                      )}
                      {grant.verification_details.discrepancy_count > 0 && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Discrepancies</span>
                          <span className="text-amber-600 font-medium">{grant.verification_details.discrepancy_count} found</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show fresh discrepancies from latest verify result */}
                  {verifyResult && !verifyResult.error && verifyResult.crossref_discrepancies?.length > 0 && (
                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Discrepancies Found</p>
                      {verifyResult.crossref_discrepancies.map((d: any, i: number) => (
                        <div key={i} className={cn(
                          'p-2 rounded-lg text-[10px]',
                          d.severity === 'critical' ? 'bg-rose-50 text-rose-700' :
                          d.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-600'
                        )}>
                          <p className="font-semibold">{d.field}: {d.severity}</p>
                          <p>DB: {d.database_value}</p>
                          <p>Found: {d.fresh_value}</p>
                          {d.explanation && <p className="mt-1 opacity-80">{d.explanation}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {verifyResult?.error && (
                    <p className="text-[10px] text-rose-500 mt-2">{verifyResult.error}</p>
                  )}
                </>
              )}
            </div>
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
