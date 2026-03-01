'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, PIPELINE_STAGES, STAGE_COLORS, PRIORITY_LEVELS } from '@/lib/supabase'
import type { GrantApplication, Grant, Consultant, ActivityLog, GrantStrategy } from '@/lib/supabase'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

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

  const fetchData = useCallback(async () => {
    const id = params.id as string
    const [appRes, actRes, conRes, stratRes] = await Promise.all([
      supabase.from('grant_applications').select('*, grant:grants(*, category:grant_categories(*)), consultant:consultants(*)').eq('id', id).single(),
      supabase.from('grant_activity_log').select('*').eq('application_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('consultants').select('*').order('name'),
      supabase.from('strategies').select('*').eq('grant_application_id', id).order('created_at', { ascending: false }).limit(1),
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
      // The strategy data is stored in grants_ranked[0] for single-grant strategies
      if (saved.grants_ranked && saved.grants_ranked.length > 0) {
        setStrategy(saved.grants_ranked[0])
      }
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
      const res = await fetch('/api/strategy', {
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
                <div className="p-8 text-center">
                  <div className="w-10 h-10 mx-auto mb-4 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-medium text-slate-700 mb-1">Analyzing this grant...</p>
                  <p className="text-xs text-slate-400">Checking eligibility, documents, and blockers (15-30 seconds)</p>
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
                    <div className="p-5 space-y-5">
                      {/* Summary */}
                      <div>
                        <p className="text-sm text-slate-700 leading-relaxed">{strategy.summary}</p>
                        <p className="text-xs text-slate-400 mt-2 italic">{strategy.probability_reasoning}</p>
                      </div>

                      {/* Amount estimate */}
                      {(strategy.estimated_amount_min || strategy.estimated_amount_max) && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50/50">
                          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                          </svg>
                          <span className="text-sm font-medium text-emerald-700">
                            Estimated: {formatCurrency(strategy.estimated_amount_min)} - {formatCurrency(strategy.estimated_amount_max)}
                          </span>
                        </div>
                      )}

                      {/* Critical blockers alert */}
                      {strategy.blockers?.some(b => b.severity === 'critical') && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
                          <p className="text-xs font-semibold text-rose-700 mb-2 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            Critical Blockers
                          </p>
                          {strategy.blockers.filter(b => b.severity === 'critical').map((b, i) => (
                            <div key={i} className="text-xs text-rose-600 mb-1.5 last:mb-0">
                              <span className="font-medium">{b.blocker}:</span> {b.resolution} ({b.resolution_time})
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Required Documents */}
                      {strategy.required_documents && strategy.required_documents.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Required Documents</h3>
                          <div className="space-y-1.5">
                            {strategy.required_documents.map((doc, i) => (
                              <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/40 transition-colors">
                                <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                                  doc.status === 'likely_ready' ? 'bg-emerald-400' :
                                  doc.status === 'needs_preparation' ? 'bg-amber-400' :
                                  'bg-rose-400'
                                )} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-700 font-medium">{doc.document}</span>
                                    <span className={cn('text-[10px] uppercase tracking-wide', DOC_STATUS_COLORS[doc.status] || 'text-slate-400')}>
                                      {doc.status.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-400 mt-0.5">{doc.description}</p>
                                </div>
                                <span className="text-[10px] text-slate-300 uppercase shrink-0">{doc.effort}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* All blockers (non-critical) */}
                      {strategy.blockers?.filter(b => b.severity !== 'critical').length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Warnings & Notes</h3>
                          <div className="space-y-1.5">
                            {strategy.blockers.filter(b => b.severity !== 'critical').map((b, i) => (
                              <div key={i} className="flex items-start gap-2 p-2 rounded-lg">
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded border shrink-0 mt-0.5', SEVERITY_COLORS[b.severity] || SEVERITY_COLORS.info)}>
                                  {b.severity}
                                </span>
                                <div>
                                  <p className="text-sm text-slate-600">{b.blocker}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{b.resolution} ({b.resolution_time})</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Next Steps */}
                      {strategy.next_steps && strategy.next_steps.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Next Steps</h3>
                          <div className="space-y-2">
                            {strategy.next_steps.map((step, i) => (
                              <div key={i} className="flex items-start gap-3 p-2">
                                <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <div>
                                  <p className="text-sm text-slate-700">{step.step}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{step.why}</p>
                                  {step.deadline && <p className="text-[10px] text-blue-500 mt-0.5">Deadline: {step.deadline}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tips & Risks */}
                      {(strategy.tips || strategy.risks) && (
                        <div className="grid grid-cols-2 gap-3">
                          {strategy.tips && (
                            <div className="p-3 rounded-xl bg-blue-50/50">
                              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">Insider Tip</p>
                              <p className="text-xs text-slate-600">{strategy.tips}</p>
                            </div>
                          )}
                          {strategy.risks && (
                            <div className="p-3 rounded-xl bg-amber-50/50">
                              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-1">Risks</p>
                              <p className="text-xs text-slate-600">{strategy.risks}</p>
                            </div>
                          )}
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
              <input
                type="number"
                defaultValue={app.target_amount || ''}
                onBlur={(e) => updateField('target_amount', e.target.value ? parseFloat(e.target.value) : null)}
                className="input-field"
                placeholder="EUR"
              />
            </div>

            {/* Consultant */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Consultant</h2>
              <select
                value={app.consultant_id || ''}
                onChange={(e) => updateField('consultant_id', e.target.value || null)}
                className="select-field"
              >
                <option value="">None assigned</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.organization ? ` (${c.organization})` : ''}</option>
                ))}
              </select>
              {app.consultant && (
                <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <p className="text-sm font-medium text-slate-700">{app.consultant.name}</p>
                  {app.consultant.organization && <p className="text-xs text-slate-400">{app.consultant.organization}</p>}
                  {app.consultant.email && (
                    <a href={`mailto:${app.consultant.email}`} className="text-xs text-blue-500 hover:text-blue-600 mt-1 block">{app.consultant.email}</a>
                  )}
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Dates</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Internal Deadline</label>
                  <input
                    type="date"
                    defaultValue={app.internal_deadline || ''}
                    onBlur={(e) => updateField('internal_deadline', e.target.value || null)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Submission Date</label>
                  <input
                    type="date"
                    defaultValue={app.submission_date || ''}
                    onBlur={(e) => updateField('submission_date', e.target.value || null)}
                    className="input-field"
                  />
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
