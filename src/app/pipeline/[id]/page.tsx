'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, PIPELINE_STAGES, STAGE_COLORS, PRIORITY_LEVELS } from '@/lib/supabase'
import type { GrantApplication, Grant, Consultant, ApplicationRequirement, ActivityLog } from '@/lib/supabase'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

type FullApplication = GrantApplication & {
  grant: (Grant & { category: { name: string } | null }) | null
  consultant: Consultant | null
}

export default function ApplicationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [app, setApp] = useState<FullApplication | null>(null)
  const [requirements, setRequirements] = useState<ApplicationRequirement[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [newReq, setNewReq] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')

  const fetchData = useCallback(async () => {
    const id = params.id as string
    const [appRes, reqRes, actRes, conRes] = await Promise.all([
      supabase.from('grant_applications').select('*, grant:grants(*, category:grant_categories(*)), consultant:consultants(*)').eq('id', id).single(),
      supabase.from('application_requirements').select('*').eq('application_id', id).order('sort_order'),
      supabase.from('grant_activity_log').select('*').eq('application_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('consultants').select('*').order('name'),
    ])
    if (appRes.data) {
      setApp(appRes.data as FullApplication)
      setNotes(appRes.data.notes || '')
    }
    if (reqRes.data) setRequirements(reqRes.data)
    if (actRes.data) setActivity(actRes.data)
    if (conRes.data) setConsultants(conRes.data)
    setLoading(false)
  }, [params.id])

  useEffect(() => { fetchData() }, [fetchData])

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

  async function addRequirement() {
    if (!app || !newReq.trim()) return
    const maxOrder = requirements.reduce((max, r) => Math.max(max, r.sort_order || 0), 0)
    await supabase.from('application_requirements').insert({
      application_id: app.id,
      requirement: newReq.trim(),
      is_met: false,
      sort_order: maxOrder + 1,
    })
    setNewReq('')
    fetchData()
  }

  async function toggleRequirement(reqId: string, currentMet: boolean | null) {
    await supabase.from('application_requirements').update({ is_met: !currentMet }).eq('id', reqId)
    fetchData()
  }

  async function deleteRequirement(reqId: string) {
    await supabase.from('application_requirements').delete().eq('id', reqId)
    fetchData()
  }

  async function deleteApplication() {
    if (!app) return
    if (!confirm('Delete this application? The grant itself will not be deleted.')) return
    await supabase.from('application_requirements').delete().eq('application_id', app.id)
    await supabase.from('grant_activity_log').delete().eq('application_id', app.id)
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

  const metCount = requirements.filter((r) => r.is_met).length
  const totalReqs = requirements.length

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
            {/* Requirements checklist */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-slate-800">Requirements</h2>
                  {totalReqs > 0 && (
                    <span className="text-xs text-slate-400">{metCount}/{totalReqs} complete</span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {totalReqs > 0 && (
                <div className="h-1.5 rounded-full bg-slate-100 mb-4 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all duration-500"
                    style={{ width: `${(metCount / totalReqs) * 100}%` }}
                  />
                </div>
              )}

              {/* Checklist */}
              <div className="space-y-1.5 mb-4">
                {requirements.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 group py-1.5 px-2 -mx-2 rounded-lg hover:bg-white/40 transition-colors">
                    <button
                      onClick={() => toggleRequirement(req.id, req.is_met)}
                      className={cn(
                        'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all duration-200',
                        req.is_met
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-slate-300 hover:border-blue-400'
                      )}
                    >
                      {req.is_met && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                    <span className={cn('text-sm flex-1', req.is_met ? 'text-slate-400 line-through' : 'text-slate-700')}>
                      {req.requirement}
                    </span>
                    <button
                      onClick={() => deleteRequirement(req.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-400 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add requirement */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newReq}
                  onChange={(e) => setNewReq(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addRequirement()}
                  className="input-field text-sm"
                  placeholder="Add a requirement..."
                />
                <button onClick={addRequirement} disabled={!newReq.trim()} className="btn-secondary text-xs shrink-0 disabled:opacity-50">
                  Add
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Notes</h2>
                {!editingNotes && (
                  <button onClick={() => setEditingNotes(true)} className="btn-ghost text-xs">Edit</button>
                )}
              </div>
              {editingNotes ? (
                <div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="input-field resize-none mb-3"
                    placeholder="Add notes about this application..."
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
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Activity</h2>
              {activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.map((log) => (
                    <div key={log.id} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 shrink-0" />
                      <div>
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">{log.action}</span>
                          {log.details && <span className="text-slate-400"> — {log.details}</span>}
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">{formatDate(log.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-300 italic">No activity recorded</p>
              )}
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
          </div>
        </div>
      </div>
    </AppShell>
  )
}
