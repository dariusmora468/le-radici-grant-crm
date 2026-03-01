'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, PIPELINE_STAGES, STAGE_COLORS, PRIORITY_LEVELS } from '@/lib/supabase'
import type { GrantApplication, Grant, Consultant, ActivityLog, GrantStrategy } from '@/lib/supabase'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'
import AIProgressBar from '@/components/AIProgressBar'

type FullApplication = GrantApplication & {
  grant: (Grant & { category: { name: string } | null }) | null
  consultant: Consultant | null
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
  blocked: 'text-rose-700 font-medium',
}

export default function ApplicationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [app, setApp] = useState<FullApplication | null>(null)
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')

  // Strategy state
  const [strategy, setStrategy] = useState<GrantStrategy | null>(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategyError, setStrategyError] = useState('')
  const [strategyDbId, setStrategyDbId] = useState<string | null>(null)
  const [strategyExpanded, setStrategyExpanded] = useState(true)

  // Application workspace state
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [applicationProgress, setApplicationProgress] = useState(0)

  // Q&A state
  const [qaQuestion, setQaQuestion] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [qaHistory, setQaHistory] = useState<Array<{
    question: string
    answer: string
    sources: Array<{ title: string; url: string; relevance?: string }>
    confidence: string
    follow_up_suggestions?: string[]
  }>>([])
  const [qaError, setQaError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const id = params.id as string
    const [appRes, actRes, conRes, stratRes, appWorkspaceRes] = await Promise.all([
      supabase.from('grant_applications').select('*, grant:grants(*, category:grant_categories(*)), consultant:consultants(*)').eq('id', id).single(),
      supabase.from('grant_activity_log').select('*').eq('application_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('consultants').select('*').order('name'),
      supabase.from('strategies').select('*').eq('grant_application_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('applications').select('id, overall_progress').eq('grant_application_id', id).limit(1),
    ])
    if (appRes.data) {
      setApp(appRes.data as FullApplication)
      setNotes(appRes.data.notes || '')
    }
    if (actRes.data) setActivity(actRes.data)
    if (conRes.data) setConsultants(conRes.data)

    // Load existing strategy
    if (stratRes.data && stratRes.data.length > 0) {
      const saved = stratRes.data[0]
      setStrategyDbId(saved.id)
      if (saved.grants_ranked && saved.grants_ranked.length > 0) {
        setStrategy(saved.grants_ranked[0])
      }
    }

    // Load existing application workspace
    if (appWorkspaceRes.data && appWorkspaceRes.data.length > 0) {
      setApplicationId(appWorkspaceRes.data[0].id)
      setApplicationProgress(appWorkspaceRes.data[0].overall_progress)
    }

    setLoading(false)
  }, [params.id])

  useEffect(() => { fetchData() }, [fetchData])

  async function buildStrategy() {
    if (!app?.grant) return

    setStrategyLoading(true)
    setStrategyError('')

    // Fetch project profile
    const { data: project } = await supabase.from('projects').select('*').limit(1).single()
    if (!project) {
      setStrategyError('No project profile found. Go to the Project page to set up your profile first.')
      setStrategyLoading(false)
      return
    }

    try {
      const res = await apiFetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant: app.grant, project }),
      })

      let data
      try {
        const text = await res.text()
        data = JSON.parse(text)
      } catch {
        throw new Error(
          `Server returned a non-JSON response (HTTP ${res.status}). ` +
          'Check /api/health to verify all systems are working.'
        )
      }

      if (!res.ok) {
        const errorCode = data?.error_code ? ` [${data.error_code}]` : ''
        throw new Error((data?.error || 'Strategy generation failed') + errorCode)
      }

      if (!data.summary || !data.probability_of_success) {
        throw new Error('Strategy data was incomplete. Please try again.')
      }

      setStrategy(data)

      // Save to database
      const savePayload = {
        project_id: project.id,
        grant_application_id: app.id,
        executive_summary: data.summary,
        grants_ranked: [data],
        blockers: data.blockers || [],
        action_plan: data.next_steps || [],
        total_potential_value: data.estimated_amount_max || 0,
        total_grants_analyzed: 1,
        high_probability_count: data.probability_of_success === 'High' ? 1 : 0,
      }

      if (strategyDbId) {
        // Update existing
        await supabase.from('strategies').update(savePayload).eq('id', strategyDbId)
      } else {
        // Insert new
        const { data: saved } = await supabase.from('strategies').insert(savePayload).select().single()
        if (saved) setStrategyDbId(saved.id)
      }

      // Log activity
      await supabase.from('grant_activity_log').insert({
        application_id: app.id,
        grant_id: app.grant_id,
        action: 'Strategy generated',
        details: `${data.probability_of_success} probability, ${data.required_documents?.length || 0} documents identified`,
        performed_by: 'AI',
      })

      fetchData()
    } catch (err: any) {
      setStrategyError(err.message || 'Something went wrong. Please try again.')
    }
    setStrategyLoading(false)
  }

  async function updateField(field: string, value: any) {
    if (!app) return
    await supabase.from('grant_applications').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', app.id)
    if (field === 'stage') {
      await supabase.from('grant_activity_log').insert({
        application_id: app.id,
        grant_id: app.grant_id,
        action: 'Stage changed',
        details: `Moved to ${value}`,
        performed_by: 'User',
      })
    }
    fetchData()
  }

  async function saveNotes() {
    if (!app) return
    await supabase.from('grant_applications').update({ notes, updated_at: new Date().toISOString() }).eq('id', app.id)
    setEditingNotes(false)
    fetchData()
  }

  async function deleteApplication() {
    if (!app || !confirm('Delete this application? This cannot be undone.')) return
    await supabase.from('grant_applications').delete().eq('id', app.id)
    router.push('/pipeline')
  }

  async function startApplication() {
    if (!app) return
    // Create application workspace with default sections
    const { data: newApp } = await supabase
      .from('applications')
      .insert({ grant_application_id: app.id, status: 'in_progress' })
      .select()
      .single()

    if (!newApp) return

    // Create the 4 default sections
    await supabase.from('application_sections').insert([
      { application_id: newApp.id, section_type: 'proposal', title: 'Proposal Builder' },
      { application_id: newApp.id, section_type: 'budget', title: 'Budget Planner' },
      { application_id: newApp.id, section_type: 'documents', title: 'Document Vault' },
      { application_id: newApp.id, section_type: 'review', title: 'Review & Export' },
    ])

    // Auto-populate Document Vault from strategy's required_documents
    if (strategy?.required_documents && strategy.required_documents.length > 0) {
      const statusMap: Record<string, string> = {
        likely_ready: 'ready',
        needs_preparation: 'not_started',
        missing: 'not_started',
        blocked: 'not_started',
      }
      const docs = strategy.required_documents.map((doc, i) => ({
        application_id: newApp.id,
        document_name: doc.document,
        description: doc.description,
        status: statusMap[doc.status] || 'not_started',
        effort: doc.effort || null,
        ai_can_help: doc.ai_can_help || null,
        notes: doc.how_to_prepare || null,
        order_index: i,
      }))
      await supabase.from('application_documents').insert(docs)
    }

    // Update pipeline stage
    await supabase.from('grant_applications').update({
      stage: 'Preparing Application',
      updated_at: new Date().toISOString(),
    }).eq('id', app.id)

    // Log activity
    await supabase.from('grant_activity_log').insert({
      application_id: app.id,
      grant_id: app.grant_id,
      action: 'Application started',
      details: `Started preparing grant application${strategy?.required_documents ? ` with ${strategy.required_documents.length} documents tracked` : ''}`,
      performed_by: 'User',
    })

    // Navigate to the application workspace (embedded view)
    router.push(`/applications/${newApp.id}?from=pipeline&pipeline_id=${app.id}`)
  }

  async function askQuestion(q?: string) {
    const question = q || qaQuestion.trim()
    if (!question || !app?.grant || qaLoading) return
    setQaLoading(true)
    setQaError(null)
    setQaQuestion('')
    try {
      const { data: project } = await supabase.from('projects').select('*').limit(1).single()
      const res = await apiFetch('/api/grant-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, grant: app.grant, project }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to get answer' }))
        throw new Error(err.error || `Error: ${res.status}`)
      }
      const data = await res.json()
      setQaHistory(prev => [...prev, {
        question,
        answer: data.answer || 'No answer available.',
        sources: data.sources || [],
        confidence: data.confidence || 'medium',
        follow_up_suggestions: data.follow_up_suggestions || [],
      }])
    } catch (err: any) {
      setQaError(err.message || 'Failed to answer question')
    }
    setQaLoading(false)
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

  if (!app) {
    return (
      <AppShell>
        <div className="card p-16 text-center">
          <p className="text-sm text-slate-500">Application not found</p>
          <Link href="/pipeline" className="btn-primary mt-4 inline-flex">Back to Pipeline</Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/pipeline" className="text-slate-400 hover:text-slate-600 transition-colors">Pipeline</Link>
            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-slate-700 font-medium truncate max-w-xs">{app.grant?.name || 'Application'}</span>
          </div>
          <button onClick={deleteApplication} className="btn-ghost text-rose-500 hover:text-rose-600 text-xs">
            Delete Application
          </button>
        </div>

        {/* Header card */}
        <div className="card p-6 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-semibold text-slate-900">{app.grant?.name || 'Unnamed Grant'}</h1>
                {app.grant?.category && (
                  <span className="badge bg-blue-50 text-blue-600">{app.grant.category.name}</span>
                )}
              </div>
              {app.grant && (
                <Link href={`/grants/${app.grant.id}`} className="text-xs text-blue-500 hover:text-blue-600 transition-colors">
                  View grant details
                </Link>
              )}
            </div>
            {app.target_amount && (
              <div className="text-right">
                <p className="text-xs text-slate-400">Target</p>
                <p className="text-lg font-semibold text-slate-900">{formatCurrency(app.target_amount)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Application Workspace CTA */}
        {!applicationId ? (
          <div className="mb-4 p-6 rounded-2xl text-center" style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(59,130,246,0.06) 100%)',
            border: '1px solid rgba(16,185,129,0.15)',
          }}>
            {/* Stage-aware CTA content */}
            {(() => {
              const stage = app.stage
              const isEarlyStage = stage === 'Discovered' || stage === 'Researching' || stage === 'Serious Consideration'
              const isAdvancedStage = stage === 'Preparing Application' || stage === 'Submitted' || stage === 'Under Review'

              // Advanced stage without workspace = something is off, offer to create
              if (isAdvancedStage) {
                return (
                  <>
                    <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-slate-800 mb-1">Application Workspace Missing</h3>
                    <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
                      This grant is at "{stage}" but doesn't have an application workspace yet. Create one to start building your proposal, budget, and documents.
                    </p>
                    <button onClick={startApplication} className="btn-primary inline-flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Create Application Workspace
                    </button>
                  </>
                )
              }

              // Early stage: position as next step in the journey
              return (
                <>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-slate-800 mb-1">
                    {isEarlyStage ? 'Ready to Start Preparing?' : 'Start Your Application'}
                  </h3>
                  <p className="text-sm text-slate-500 mb-1 max-w-md mx-auto">
                    {isEarlyStage
                      ? 'When you\'re ready to move forward, create an application workspace with a guided proposal builder, budget planner, and document checklist.'
                      : 'Start your application with a guided proposal builder, budget planner, and document checklist.'}
                  </p>
                  {strategy && (
                    <p className="text-xs text-emerald-600 mb-3">
                      {strategy.required_documents?.length || 0} documents will be pre-loaded from your strategy
                    </p>
                  )}
                  {!strategy && isEarlyStage && (
                    <p className="text-xs text-slate-400 mb-3">
                      Tip: Generate a strategy first to auto-populate your document checklist
                    </p>
                  )}
                  <button onClick={startApplication} className="btn-primary inline-flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    {isEarlyStage ? 'Start Preparing Application' : 'Start Application'}
                  </button>
                </>
              )
            })()}
          </div>
        ) : (
          <Link href={`/applications/${applicationId}?from=pipeline&pipeline_id=${app.id}`} className="block mb-4">
            <div className="p-4 rounded-2xl transition-all duration-200 group" style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(59,130,246,0.06) 100%)',
              border: '1px solid rgba(16,185,129,0.15)',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.04)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <svg className="w-4.5 h-4.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                      Continue Application
                    </p>
                    <p className="text-xs text-slate-400">{applicationProgress}% complete</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all',
                        applicationProgress >= 75 ? 'bg-emerald-400' :
                        applicationProgress >= 40 ? 'bg-blue-400' : 'bg-slate-300'
                      )}
                      style={{ width: `${applicationProgress}%` }}
                    />
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* === GRANT Q&A SECTION === */}
        <div className="card p-0 overflow-hidden mb-4">
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-800">Ask anything about this grant</h3>
              <p className="text-[10px] text-slate-400">Get AI-powered answers with verified sources</p>
            </div>
          </div>

          <div className="px-5 py-4">
            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={qaQuestion}
                onChange={(e) => setQaQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion() } }}
                placeholder="e.g. What documents do I need? What's the co-financing rate? Am I eligible as a young farmer?"
                className="input-field flex-1 text-sm"
                disabled={qaLoading}
              />
              <button
                onClick={() => askQuestion()}
                disabled={!qaQuestion.trim() || qaLoading}
                className="btn-primary px-4 shrink-0 disabled:opacity-40"
              >
                {qaLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>

            {qaError && (
              <p className="text-xs text-rose-500 mt-2">{qaError}</p>
            )}

            {/* Loading indicator */}
            {qaLoading && (
              <div className="flex items-center gap-2 mt-4 px-1">
                <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-xs text-slate-500">Researching your question with web sources...</span>
              </div>
            )}

            {/* Q&A History */}
            {qaHistory.length > 0 && (
              <div className="mt-4 space-y-4">
                {qaHistory.map((qa, i) => (
                  <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.04)' }}>
                    {/* Question */}
                    <div className="px-4 py-2.5 flex items-start gap-2" style={{ background: 'rgba(59,130,246,0.04)' }}>
                      <span className="text-blue-500 text-xs font-bold mt-0.5 shrink-0">Q</span>
                      <p className="text-sm text-slate-700 font-medium">{qa.question}</p>
                    </div>
                    {/* Answer */}
                    <div className="px-4 py-3">
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{qa.answer}</p>

                      {/* Sources */}
                      {qa.sources.length > 0 && (
                        <div className="mt-3 pt-3 flex flex-wrap gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider self-center">Sources:</span>
                          {qa.sources.map((s, j) => (
                            <a
                              key={j}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg transition-colors"
                              style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.1)' }}
                              title={s.relevance || s.title}
                            >
                              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.386-3.04a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364l1.757 1.757" />
                              </svg>
                              <span className="truncate max-w-[200px]">{s.title}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Confidence + follow-ups */}
                      <div className="mt-2 flex items-center gap-3">
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded',
                          qa.confidence === 'high' ? 'bg-emerald-50 text-emerald-600' :
                          qa.confidence === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                        )}>
                          {qa.confidence} confidence
                        </span>
                      </div>

                      {/* Follow-up suggestions */}
                      {qa.follow_up_suggestions && qa.follow_up_suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {qa.follow_up_suggestions.map((suggestion, k) => (
                            <button
                              key={k}
                              onClick={() => { setQaQuestion(suggestion); askQuestion(suggestion) }}
                              className="text-[10px] text-slate-500 hover:text-blue-600 px-2.5 py-1 rounded-lg transition-colors"
                              style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}
                              disabled={qaLoading}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Left: main content */}
          <div className="col-span-2 space-y-4">

            {/* === AI STRATEGY SECTION === */}
            <div className="card overflow-hidden">
              {!strategy && !strategyLoading ? (
                /* Empty state: CTA */
                <div className="p-8 text-center" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.04) 0%, rgba(139,92,246,0.04) 100%)' }}>
                  <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-slate-800 mb-1">Build My Strategy</h3>
                  <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">
                    AI will analyze this grant against your project profile and tell you exactly what you need to apply.
                  </p>
                  <button
                    onClick={buildStrategy}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Build Strategy
                  </button>
                  {strategyError && (
                    <p className="mt-4 text-sm text-rose-600 bg-rose-50 rounded-lg px-4 py-2 inline-block">{strategyError}</p>
                  )}
                </div>
              ) : strategyLoading ? (
                /* Loading state */
                <div className="p-4">
                  <AIProgressBar label="Analyzing this grant..." />
                </div>
              ) : strategy ? (
                /* Results */
                <div>
                  {/* Header */}
                  <div className="p-5 flex items-center justify-between border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setStrategyExpanded(!strategyExpanded)} className="text-slate-400 hover:text-slate-600">
                        <svg className={cn('w-4 h-4 transition-transform', strategyExpanded && 'rotate-90')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                      <h2 className="text-sm font-semibold text-slate-800">AI Strategy</h2>
                      <span className={cn('text-xs px-2.5 py-0.5 rounded-full border font-medium', PROB_COLORS[strategy.probability_of_success] || PROB_COLORS.Low)}>
                        {strategy.probability_of_success} Probability
                      </span>
                    </div>
                    <button
                      onClick={buildStrategy}
                      className="text-xs text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                      </svg>
                      Regenerate
                    </button>
                  </div>

                  {strategyExpanded && (
                    <div className="p-5 space-y-6">
                      {/* Summary */}
                      <div>
                        <p className="text-sm text-slate-700 leading-relaxed">{strategy.summary}</p>
                        <p className="text-xs text-slate-400 mt-2 italic">{strategy.probability_reasoning}</p>
                      </div>

                      {/* Amount estimate */}
                      {(strategy.estimated_amount_min || strategy.estimated_amount_max) && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100">
                          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                          </svg>
                          <span className="text-sm font-medium text-emerald-700">
                            Estimated: {formatCurrency(strategy.estimated_amount_min)} - {formatCurrency(strategy.estimated_amount_max)}
                          </span>
                        </div>
                      )}

                      {/* Next Steps (interactive checklist) */}
                      {strategy.next_steps && strategy.next_steps.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Action Plan</h3>
                          <div className="space-y-1">
                            {strategy.next_steps.map((step, i) => (
                              <div key={i} className="group">
                                <button
                                  onClick={() => {
                                    const updated = { ...strategy }
                                    updated.next_steps = [...strategy.next_steps]
                                    updated.next_steps[i] = { ...step, done: !step.done }
                                    setStrategy(updated)
                                  }}
                                  className={cn(
                                    'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all',
                                    step.done ? 'bg-emerald-50/30' : 'hover:bg-white/60'
                                  )}
                                >
                                  <div className={cn(
                                    'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all',
                                    step.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 group-hover:border-blue-400'
                                  )}>
                                    {step.done && (
                                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={cn('text-sm font-medium', step.done ? 'text-slate-400 line-through' : 'text-slate-700')}>
                                      {step.step}
                                    </p>
                                    {step.detail && (
                                      <p className={cn('text-xs mt-1 leading-relaxed', step.done ? 'text-slate-300' : 'text-slate-400')}>
                                        {step.detail}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-1.5">
                                      {step.deadline && (
                                        <span className="text-[10px] text-blue-500 flex items-center gap-1">
                                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          {step.deadline}
                                        </span>
                                      )}
                                      {step.effort && (
                                        <span className={cn('text-[10px] uppercase tracking-wide',
                                          step.effort === 'Low' ? 'text-emerald-500' :
                                          step.effort === 'Medium' ? 'text-amber-500' : 'text-rose-500'
                                        )}>
                                          {step.effort} effort
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Blockers & Warnings (merged, sorted by severity) */}
                      {strategy.blockers && strategy.blockers.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Blockers & Warnings</h3>
                          <div className="space-y-2">
                            {[...strategy.blockers]
                              .sort((a, b) => {
                                const order = { critical: 0, warning: 1, info: 2 }
                                return (order[a.severity] || 2) - (order[b.severity] || 2)
                              })
                              .map((b, i) => (
                              <div key={i} className={cn('p-3 rounded-xl border', SEVERITY_COLORS[b.severity] || SEVERITY_COLORS.info)}>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm font-medium">{b.title || (b as any).blocker || 'Issue'}</p>
                                  <span className="text-[10px] uppercase tracking-wide opacity-70 shrink-0">{b.affected_area}</span>
                                </div>
                                <p className="text-xs opacity-80 mb-2">{b.description || ''}</p>
                                <div className="flex items-center gap-1.5 text-[10px] opacity-70">
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-3.18M15 10.5c0 1.4-.5 2.5-1.5 3.6L12 15.5l-1.5-1.4C9.5 13 9 11.9 9 10.5 9 8 11 6 13.5 6S18 8 18 10.5z" />
                                  </svg>
                                  <span>{b.resolution}</span>
                                  {b.resolution_time && <span>({b.resolution_time})</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Required Documents (expandable) */}
                      {strategy.required_documents && strategy.required_documents.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Required Documents</h3>
                          <div className="space-y-1.5">
                            {strategy.required_documents.map((doc, i) => (
                              <details key={i} className="group rounded-xl overflow-hidden">
                                <summary className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/60 transition-colors list-none">
                                  <div className={cn('w-2 h-2 rounded-full shrink-0',
                                    doc.status === 'likely_ready' ? 'bg-emerald-400' :
                                    doc.status === 'needs_preparation' ? 'bg-amber-400' :
                                    'bg-rose-400'
                                  )} />
                                  <span className="text-sm text-slate-700 font-medium flex-1">{doc.document}</span>
                                  <span className={cn('text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full',
                                    doc.status === 'likely_ready' ? 'bg-emerald-50 text-emerald-600' :
                                    doc.status === 'needs_preparation' ? 'bg-amber-50 text-amber-600' :
                                    'bg-rose-50 text-rose-600'
                                  )}>
                                    {doc.status.replace(/_/g, ' ')}
                                  </span>
                                  <svg className="w-3.5 h-3.5 text-slate-300 group-open:rotate-90 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                </summary>
                                <div className="px-3 pb-3 pt-1 ml-5 space-y-2">
                                  <p className="text-xs text-slate-500 leading-relaxed">{doc.description}</p>
                                  {doc.how_to_prepare && (
                                    <div className="p-2.5 rounded-lg bg-slate-50/80">
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">How to Prepare</p>
                                      <p className="text-xs text-slate-600 leading-relaxed">{doc.how_to_prepare}</p>
                                    </div>
                                  )}
                                  {doc.ai_can_help && (
                                    <div className="p-2.5 rounded-lg bg-violet-50/60 border border-violet-100">
                                      <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                        </svg>
                                        How AI Can Help
                                      </p>
                                      <p className="text-xs text-violet-700 leading-relaxed">{doc.ai_can_help}</p>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                    <span>Effort: <span className={cn('font-medium',
                                      doc.effort === 'Low' ? 'text-emerald-500' :
                                      doc.effort === 'Medium' ? 'text-amber-500' : 'text-rose-500'
                                    )}>{doc.effort}</span></span>
                                  </div>
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Improve Your Chances */}
                      {strategy.improvements && strategy.improvements.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Improve Your Chances</h3>
                          <div className="space-y-2">
                            {strategy.improvements.map((imp, i) => (
                              <div key={i} className="p-3 rounded-xl border border-blue-100 bg-blue-50/30">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm font-medium text-slate-700">{imp.change}</p>
                                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                                    imp.impact === 'High' ? 'bg-emerald-100 text-emerald-700' :
                                    imp.impact === 'Medium' ? 'bg-amber-100 text-amber-700' :
                                    'bg-slate-100 text-slate-500'
                                  )}>
                                    {imp.impact} impact
                                  </span>
                                </div>
                                <p className="text-xs text-blue-700/70 mb-1.5">{imp.impact_detail}</p>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                  {imp.category && <span className="px-1.5 py-0.5 rounded bg-white/60">{imp.category}</span>}
                                  <span>{imp.effort_to_implement}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Insider Tip */}
                      {(strategy.insider_tip || strategy.tips) && (
                        <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-100">
                          <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                            </svg>
                            Insider Tip
                          </p>
                          <p className="text-sm text-slate-700 leading-relaxed">{strategy.insider_tip || strategy.tips}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Right: controls */}
          <div className="space-y-4">
            {/* Stage selector */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Stage</h2>
              <select
                value={app.stage}
                onChange={(e) => updateField('stage', e.target.value)}
                className="select-field mb-3"
              >
                {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className={cn('badge', STAGE_COLORS[app.stage] || 'bg-slate-100 text-slate-500')}>
                {app.stage}
              </span>
            </div>

            {/* Priority */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Priority</h2>
              <select
                value={app.priority || ''}
                onChange={(e) => updateField('priority', e.target.value || null)}
                className="select-field"
              >
                <option value="">Not set</option>
                {PRIORITY_LEVELS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Target amount */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Target Amount</h2>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                <input
                  type="number"
                  defaultValue={app.target_amount || ''}
                  onBlur={(e) => updateField('target_amount', e.target.value ? parseFloat(e.target.value) : null)}
                  className="input-field pl-7"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Consultant */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Consultant</h2>
                <Link
                  href={`/consultants?grant_application_id=${app.id}&grant_name=${encodeURIComponent(app.grant?.name || 'Grant')}`}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                  title="Find consultants for this grant"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </Link>
              </div>
              {app.consultant ? (
                <div className="p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <p className="text-sm font-medium text-slate-700">{app.consultant.name}</p>
                  {app.consultant.organization && <p className="text-xs text-slate-400">{app.consultant.organization}</p>}
                  {app.consultant.email && (
                    <a href={`mailto:${app.consultant.email}`} className="text-xs text-blue-500 hover:text-blue-600 mt-1 block">{app.consultant.email}</a>
                  )}
                  <button
                    onClick={() => updateField('consultant_id', null)}
                    className="text-[10px] text-rose-400 hover:text-rose-500 mt-2 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-xs text-slate-400 mb-2">No consultant assigned</p>
                  <Link
                    href={`/consultants?grant_application_id=${app.id}&grant_name=${encodeURIComponent(app.grant?.name || 'Grant')}`}
                    className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    Find a consultant for this grant
                  </Link>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Dates</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Submission Deadline</label>
                  <input
                    type="date"
                    defaultValue={app.submission_date || app.grant?.application_window_closes || ''}
                    onBlur={(e) => updateField('submission_date', e.target.value || null)}
                    className="input-field"
                  />
                  {!app.submission_date && app.grant?.application_window_closes && (
                    <p className="text-[10px] text-slate-300 mt-1">Pre-filled from grant deadline</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Expected Response</label>
                  <input
                    type="date"
                    defaultValue={app.expected_response_date || ''}
                    onBlur={(e) => updateField('expected_response_date', e.target.value || null)}
                    className="input-field"
                  />
                </div>
                {app.grant?.application_window_opens && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400">
                      Window: {formatDate(app.grant.application_window_opens)}
                      {app.grant.application_window_closes ? ` to ${formatDate(app.grant.application_window_closes)}` : ' (open)'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Notes</h2>
                {!editingNotes && (
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="input-field resize-none text-sm mb-2"
                    placeholder="Add a note..."
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setEditingNotes(false); setNotes(app.notes || '') }} className="btn-ghost text-xs">Cancel</button>
                    <button onClick={saveNotes} className="btn-primary text-xs">Save</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 leading-relaxed">
                  {app.notes || <span className="text-slate-300 italic">No notes yet</span>}
                </p>
              )}
            </div>

            {/* Activity log */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Activity</h2>
              {activity.length > 0 ? (
                <div className="space-y-2.5">
                  {activity.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-slate-300 mt-2 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">{log.action}</span>
                          {log.details && <span className="text-slate-400"> - {log.details}</span>}
                        </p>
                        <p className="text-[10px] text-slate-300 mt-0.5">{formatDate(log.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-300 italic">No activity yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
