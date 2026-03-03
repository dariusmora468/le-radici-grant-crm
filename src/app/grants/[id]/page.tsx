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

  // Edit panel
  const [isEditing, setIsEditing] = useState(false)
  const [editUrl, setEditUrl] = useState('')
  const [editDocUrl, setEditDocUrl] = useState('')
  const [editCallText, setEditCallText] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Call text analysis
  const [analyzingCallText, setAnalyzingCallText] = useState(false)
  const [callTextError, setCallTextError] = useState<string | null>(null)

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

  // Sync edit fields when grant loads
  useEffect(() => {
    if (grant) {
      setEditUrl(grant.official_url || '')
      setEditDocUrl(grant.documentation_url || '')
      setEditCallText(grant.call_text || '')
      setEditNotes(grant.notes || '')
    }
  }, [grant?.id])

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

      // Step 4b: Seed documents from strategy if one exists
      const { data: strategyData } = await supabase
        .from('strategies')
        .select('grants_ranked')
        .eq('grant_application_id', pipelineId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (strategyData?.grants_ranked?.[0]?.required_documents) {
        const docs = strategyData.grants_ranked[0].required_documents
        const docInserts = docs.map((doc: any, i: number) => ({
          application_id: newApp.id,
          document_name: doc.document || doc.name || 'Untitled Document',
          description: doc.description || null,
          status: doc.status === 'likely_ready' ? 'ready' : 'not_started',
          notes: doc.how_to_prepare || null,
          effort: doc.effort || null,
          ai_can_help: doc.ai_can_help || null,
          order_index: i,
        }))
        if (docInserts.length > 0) {
          await supabase.from('application_documents').insert(docInserts)
        }
      }

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

  async function handleSaveEdits() {
    if (!grant) return
    setSavingEdit(true)
    const callTextChanged = editCallText !== (grant.call_text || '')
    await supabase.from('grants').update({
      official_url: editUrl || null,
      documentation_url: editDocUrl || null,
      call_text: editCallText || null,
      notes: editNotes || null,
    }).eq('id', grant.id)
    setGrant((prev) => prev ? {
      ...prev,
      official_url: editUrl || null,
      documentation_url: editDocUrl || null,
      call_text: editCallText || null,
      notes: editNotes || null,
    } : null)
    setSavingEdit(false)
    setIsEditing(false)
    // Auto-analyze if call text was updated
    if (callTextChanged && editCallText) {
      handleAnalyzeCallText(editCallText, grant.id)
    }
  }

  async function handleAnalyzeCallText(text: string, grantId: string) {
    setAnalyzingCallText(true)
    setCallTextError(null)
    try {
      const res = await apiFetch('/api/analyze-call-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_id: grantId, call_text: text }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json()
      setGrant((prev) => prev ? { ...prev, scoring_criteria: data.scoring_criteria } : null)
    } catch (err: any) {
      setCallTextError(err.message || 'Analysis failed')
    }
    setAnalyzingCallText(false)
  }

  if (loading) return <AppShell><div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div></AppShell>
  if (!grant) return <AppShell><div className="card p-16 text-center"><p className="text-sm text-slate-500">Grant not found</p><Link href="/grants" className="btn-primary mt-4 inline-flex">Back to grants</Link></div></AppShell>

  const deadlineDays = daysUntil(grant.application_window_closes)
  const inPipeline = applications.length > 0

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* URL Warning Banner */}
        {!grant.official_url && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            <p className="text-sm font-medium">No official URL for this grant. Click <button onClick={() => setIsEditing(true)} className="underline font-semibold hover:text-amber-900">Edit Grant</button> to add the source link.</p>
          </div>
        )}

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
            <button
              onClick={() => setIsEditing((v) => !v)}
              className="ml-auto btn-ghost text-sm text-slate-400 hover:text-slate-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
              {isEditing ? 'Cancel' : 'Edit Grant'}
            </button>
          </div>

          {/* Edit Panel */}
          {isEditing && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Edit Grant Details</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Official URL</label>
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://..."
                    className="input-field w-full text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Documentation URL (optional)</label>
                  <input
                    type="url"
                    value={editDocUrl}
                    onChange={(e) => setEditDocUrl(e.target.value)}
                    placeholder="https://..."
                    className="input-field w-full text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">
                    Call for Proposals Text
                    <span className="ml-2 text-blue-500 font-medium">Paste this to unlock AI scoring analysis</span>
                  </label>
                  <textarea
                    value={editCallText}
                    onChange={(e) => setEditCallText(e.target.value)}
                    placeholder="Paste the full text of the official call for proposals here. The more complete, the better the scoring analysis."
                    rows={8}
                    className="input-field w-full text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Internal Notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Internal notes about this grant..."
                    rows={2}
                    className="input-field w-full text-sm resize-y"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleSaveEdits}
                    disabled={savingEdit}
                    className="btn-primary text-sm disabled:opacity-60"
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="btn-ghost text-sm text-slate-400"
                  >
                    Cancel
                  </button>
                  {editCallText && (
                    <span className="text-xs text-slate-400 ml-2">Scoring analysis will run automatically after saving</span>
                  )}
                </div>
              </div>
            </div>
          )}
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

            {/* Possible Scoring Criteria */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                  <h2 className="text-sm font-semibold text-slate-800">Possible Scoring Criteria</h2>
                </div>
                {grant.call_text && !grant.scoring_criteria && !analyzingCallText && (
                  <button
                    onClick={() => grant && handleAnalyzeCallText(grant.call_text!, grant.id)}
                    className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                  >
                    Run Analysis
                  </button>
                )}
                {grant.scoring_criteria && (
                  <button
                    onClick={() => grant && grant.call_text && handleAnalyzeCallText(grant.call_text, grant.id)}
                    disabled={analyzingCallText}
                    className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  >
                    Re-analyze
                  </button>
                )}
              </div>

              {analyzingCallText ? (
                <div className="flex items-center gap-3 py-6">
                  <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-500">Extracting scoring criteria from the call text...</span>
                </div>
              ) : callTextError ? (
                <p className="text-xs text-rose-500">{callTextError}</p>
              ) : grant.scoring_criteria ? (
                <div className="space-y-5">
                  {/* Keywords */}
                  {grant.scoring_criteria.keywords?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Use These Keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {grant.scoring_criteria.keywords.map((kw: string, i: number) => (
                          <button
                            key={i}
                            onClick={() => navigator.clipboard.writeText(kw)}
                            title="Click to copy"
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors cursor-pointer"
                          >
                            {kw}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Click any keyword to copy</p>
                    </div>
                  )}

                  {/* Scoring Criteria */}
                  {grant.scoring_criteria.scoring_criteria?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">How They Score Applications</p>
                      <div className="space-y-2">
                        {grant.scoring_criteria.scoring_criteria.map((sc: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50/60">
                            <span className={cn(
                              'shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5',
                              sc.weight === 'High' ? 'bg-rose-100 text-rose-600' :
                              sc.weight === 'Medium' ? 'bg-amber-100 text-amber-600' :
                              'bg-slate-100 text-slate-500'
                            )}>{sc.weight}</span>
                            <div>
                              <p className="text-xs font-semibold text-slate-700">{sc.criterion}</p>
                              {sc.notes && <p className="text-xs text-slate-500 mt-0.5">{sc.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* What they want */}
                  {grant.scoring_criteria.what_they_want && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">What They Really Want</p>
                      <p className="text-sm text-slate-600 leading-relaxed">{grant.scoring_criteria.what_they_want}</p>
                    </div>
                  )}

                  {/* Red flags */}
                  {grant.scoring_criteria.red_flags?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wider mb-2">Common Disqualifiers</p>
                      <div className="space-y-1">
                        {grant.scoring_criteria.red_flags.map((flag: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-rose-600">
                            <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 transition-all group"
                >
                  <svg className="w-6 h-6 text-slate-300 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-500 group-hover:text-violet-600 transition-colors">Paste the call for proposals to unlock</p>
                    <p className="text-xs text-slate-400 mt-0.5">AI will extract keywords, scoring criteria, and red flags</p>
                  </div>
                </button>
              )}
            </div>
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

        {/* Expert Consultants */}
        <div className="card p-6 mb-4">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
              <h2 className="text-sm font-semibold text-slate-800">Expert Consultants</h2>
            </div>
            {searchCompleted ? (
              <button
                onClick={handleFindConsultants}
                disabled={searchingConsultants}
                className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-colors"
              >
                Refresh
              </button>
            ) : (
              <button
                onClick={handleFindConsultants}
                disabled={searchingConsultants}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 4px 16px rgba(99,102,241,0.25)' }}
              >
                {searchingConsultants ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    Find Consultants
                  </>
                )}
              </button>
            )}
          </div>

          {searchingConsultants ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Searching for expert consultants...</p>
              <p className="text-xs text-slate-400">Scanning Italian grant specialist directories</p>
            </div>
          ) : consultantError && foundConsultants.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-rose-500 mb-3">{consultantError}</p>
              <button onClick={handleFindConsultants} className="btn-ghost text-xs">Try Again</button>
            </div>
          ) : foundConsultants.length > 0 ? (
            <div className="space-y-3">
              {foundConsultants.slice(0, 5).map((c, i) => {
                const isSaved = savedConsultantIds.has(c.name)
                return (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-slate-50/60 border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/20 transition-colors">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center shrink-0 text-sm font-bold text-indigo-600">
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                          {c.organization && c.organization !== c.name && (
                            <p className="text-xs text-slate-500">{c.organization}</p>
                          )}
                        </div>
                        {c.match_score != null && (
                          <span className={cn(
                            'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg',
                            c.match_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                            c.match_score >= 60 ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-500'
                          )}>
                            {c.match_score}% match
                          </span>
                        )}
                      </div>

                      {c.specialization && (
                        <p className="text-xs text-slate-500 mb-1.5">{c.specialization}</p>
                      )}

                      {c.match_reasoning && (
                        <p className="text-xs text-indigo-600/70 italic mb-2 leading-relaxed">"{c.match_reasoning}"</p>
                      )}

                      {/* Contact row */}
                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                        {c.website && (
                          <a href={c.website} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                            Website
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                            {c.email}
                          </a>
                        )}
                        {c.phone && (
                          <a href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 6.75z" /></svg>
                            {c.phone}
                          </a>
                        )}
                        {!c.email && !c.phone && c.website && (
                          <span className="text-[10px] text-slate-300 italic">No direct contact found — visit website</span>
                        )}
                        <button
                          onClick={() => saveConsultant(c)}
                          disabled={isSaved || c.is_existing}
                          className={cn(
                            'ml-auto inline-flex items-center gap-1 text-xs font-medium transition-colors',
                            isSaved || c.is_existing
                              ? 'text-emerald-600 cursor-default'
                              : 'text-slate-300 hover:text-indigo-600'
                          )}
                        >
                          {isSaved || c.is_existing ? (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              Saved
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                              Save Contact
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {searchStats && (
                <p className="text-[10px] text-slate-300 text-right pt-1">
                  {searchStats.total} specialist{searchStats.total !== 1 ? 's' : ''} found via AI web search
                </p>
              )}
            </div>
          ) : !searchCompleted ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">Find specialist consultants</p>
                <p className="text-xs text-slate-400 mt-1">AI searches Italian grant directories to surface experts who specialize in this specific program</p>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-400">No consultants found for this grant.</p>
              <button onClick={handleFindConsultants} className="text-xs text-indigo-500 hover:text-indigo-600 mt-2 block mx-auto">Try Again</button>
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
