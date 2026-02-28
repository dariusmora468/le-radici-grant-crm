'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, FUNDING_SOURCES, FUNDING_TYPES, EFFORT_LEVELS, WINDOW_STATUSES } from '@/lib/supabase'
import type { Grant, GrantCategory } from '@/lib/supabase'

export default function NewGrantPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    }>
      <NewGrantForm />
    </Suspense>
  )
}

function NewGrantForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const isEdit = !!editId

  const [categories, setCategories] = useState<GrantCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)

  const [form, setForm] = useState({
    name: '',
    name_it: '',
    funding_source: '',
    category_id: '',
    description: '',
    description_it: '',
    min_amount: '',
    max_amount: '',
    co_financing_pct: '',
    funding_type: '',
    eligibility_summary: '',
    requires_young_farmer: false,
    requires_female_farmer: false,
    requires_agricultural_entity: false,
    requires_bsa_heritage: false,
    application_window_opens: '',
    application_window_closes: '',
    window_status: '',
    processing_time_months: '',
    official_url: '',
    documentation_url: '',
    regulation_reference: '',
    relevance_score: '',
    effort_level: '',
    notes: '',
    research_notes: '',
  })

  const fetchData = useCallback(async () => {
    const catsRes = await supabase.from('grant_categories').select('*').order('name')
    if (catsRes.data) setCategories(catsRes.data)

    if (editId) {
      const { data } = await supabase.from('grants').select('*').eq('id', editId).single()
      if (data) {
        setForm({
          name: data.name || '',
          name_it: data.name_it || '',
          funding_source: data.funding_source || '',
          category_id: data.category_id || '',
          description: data.description || '',
          description_it: data.description_it || '',
          min_amount: data.min_amount?.toString() || '',
          max_amount: data.max_amount?.toString() || '',
          co_financing_pct: data.co_financing_pct?.toString() || '',
          funding_type: data.funding_type || '',
          eligibility_summary: data.eligibility_summary || '',
          requires_young_farmer: data.requires_young_farmer || false,
          requires_female_farmer: data.requires_female_farmer || false,
          requires_agricultural_entity: data.requires_agricultural_entity || false,
          requires_bsa_heritage: data.requires_bsa_heritage || false,
          application_window_opens: data.application_window_opens || '',
          application_window_closes: data.application_window_closes || '',
          window_status: data.window_status || '',
          processing_time_months: data.processing_time_months?.toString() || '',
          official_url: data.official_url || '',
          documentation_url: data.documentation_url || '',
          regulation_reference: data.regulation_reference || '',
          relevance_score: data.relevance_score?.toString() || '',
          effort_level: data.effort_level || '',
          notes: data.notes || '',
          research_notes: data.research_notes || '',
        })
      }
      setLoading(false)
    }
  }, [editId])

  useEffect(() => { fetchData() }, [fetchData])

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      name_it: form.name_it.trim() || null,
      funding_source: form.funding_source || null,
      category_id: form.category_id || null,
      description: form.description.trim() || null,
      description_it: form.description_it.trim() || null,
      min_amount: form.min_amount ? parseFloat(form.min_amount) : null,
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
      co_financing_pct: form.co_financing_pct ? parseFloat(form.co_financing_pct) : null,
      funding_type: form.funding_type || null,
      eligibility_summary: form.eligibility_summary.trim() || null,
      requires_young_farmer: form.requires_young_farmer,
      requires_female_farmer: form.requires_female_farmer,
      requires_agricultural_entity: form.requires_agricultural_entity,
      requires_bsa_heritage: form.requires_bsa_heritage,
      application_window_opens: form.application_window_opens || null,
      application_window_closes: form.application_window_closes || null,
      window_status: form.window_status || null,
      processing_time_months: form.processing_time_months ? parseInt(form.processing_time_months) : null,
      official_url: form.official_url.trim() || null,
      documentation_url: form.documentation_url.trim() || null,
      regulation_reference: form.regulation_reference.trim() || null,
      relevance_score: form.relevance_score ? parseInt(form.relevance_score) : null,
      effort_level: form.effort_level || null,
      notes: form.notes.trim() || null,
      research_notes: form.research_notes.trim() || null,
    }

    if (isEdit && editId) {
      await supabase.from('grants').update(payload).eq('id', editId)
      router.push(`/grants/${editId}`)
    } else {
      const { data } = await supabase.from('grants').insert(payload).select('id').single()
      if (data) router.push(`/grants/${data.id}`)
      else router.push('/grants')
    }
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

  return (
    <AppShell>
      <div className="animate-fade-in max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/grants" className="text-slate-400 hover:text-slate-600 transition-colors">Grants</Link>
            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-slate-700 font-medium">{isEdit ? 'Edit Grant' : 'New Grant'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/grants" className="btn-ghost">Cancel</Link>
            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Grant'}
            </button>
          </div>
        </div>

        {/* Form sections */}
        <div className="space-y-4">
          {/* Basic info */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Grant Name *</label>
                <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} className="input-field" placeholder="e.g. PSR Misura 6.4 - Agritourism Diversification" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Italian Name</label>
                <input type="text" value={form.name_it} onChange={(e) => update('name_it', e.target.value)} className="input-field" placeholder="Nome in italiano" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
                <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} className="input-field resize-none" placeholder="What does this grant fund?" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Italian Description</label>
                <textarea value={form.description_it} onChange={(e) => update('description_it', e.target.value)} rows={2} className="input-field resize-none" placeholder="Descrizione in italiano" />
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Classification</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Funding Source</label>
                <select value={form.funding_source} onChange={(e) => update('funding_source', e.target.value)} className="select-field">
                  <option value="">Select...</option>
                  {FUNDING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Funding Type</label>
                <select value={form.funding_type} onChange={(e) => update('funding_type', e.target.value)} className="select-field">
                  <option value="">Select...</option>
                  {FUNDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Category</label>
                <select value={form.category_id} onChange={(e) => update('category_id', e.target.value)} className="select-field">
                  <option value="">Select...</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Effort Level</label>
                <select value={form.effort_level} onChange={(e) => update('effort_level', e.target.value)} className="select-field">
                  <option value="">Select...</option>
                  {EFFORT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Funding amounts */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Funding</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Min Amount (EUR)</label>
                <input type="number" value={form.min_amount} onChange={(e) => update('min_amount', e.target.value)} className="input-field" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Max Amount (EUR)</label>
                <input type="number" value={form.max_amount} onChange={(e) => update('max_amount', e.target.value)} className="input-field" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Co-financing %</label>
                <input type="number" value={form.co_financing_pct} onChange={(e) => update('co_financing_pct', e.target.value)} className="input-field" placeholder="0" min="0" max="100" />
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Timeline</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Window Opens</label>
                <input type="date" value={form.application_window_opens} onChange={(e) => update('application_window_opens', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Window Closes</label>
                <input type="date" value={form.application_window_closes} onChange={(e) => update('application_window_closes', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Window Status</label>
                <select value={form.window_status} onChange={(e) => update('window_status', e.target.value)} className="select-field">
                  <option value="">Select...</option>
                  {WINDOW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Processing Time (months)</label>
                <input type="number" value={form.processing_time_months} onChange={(e) => update('processing_time_months', e.target.value)} className="input-field" placeholder="0" />
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Requirements</h2>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-3">Eligibility Summary</label>
              <textarea value={form.eligibility_summary} onChange={(e) => update('eligibility_summary', e.target.value)} rows={3} className="input-field resize-none mb-4" placeholder="Who is eligible for this grant?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['requires_young_farmer', 'Requires Young Farmer'],
                ['requires_female_farmer', 'Requires Female Farmer'],
                ['requires_agricultural_entity', 'Requires Agricultural Entity'],
                ['requires_bsa_heritage', 'Requires BSA Heritage'],
              ] as const).map(([field, label]) => (
                <label key={field} className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/50">
                  <input
                    type="checkbox"
                    checked={form[field]}
                    onChange={(e) => update(field, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400/40"
                  />
                  <span className="text-sm text-slate-600">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Links + metadata */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Links and Metadata</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Official URL</label>
                <input type="url" value={form.official_url} onChange={(e) => update('official_url', e.target.value)} className="input-field" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Documentation URL</label>
                <input type="url" value={form.documentation_url} onChange={(e) => update('documentation_url', e.target.value)} className="input-field" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Regulation Reference</label>
                <input type="text" value={form.regulation_reference} onChange={(e) => update('regulation_reference', e.target.value)} className="input-field" placeholder="e.g. Reg. EU 2021/2115" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Relevance Score (1-5)</label>
                <input type="number" value={form.relevance_score} onChange={(e) => update('relevance_score', e.target.value)} className="input-field" placeholder="1-5" min="1" max="5" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Notes</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Internal Notes</label>
                <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} className="input-field resize-none" placeholder="Internal notes about this grant..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Research Notes</label>
                <textarea value={form.research_notes} onChange={(e) => update('research_notes', e.target.value)} rows={3} className="input-field resize-none" placeholder="Research findings, sources, contacts..." />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom save bar */}
        <div className="mt-6 flex items-center justify-end gap-3 pb-8">
          <Link href="/grants" className="btn-ghost">Cancel</Link>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Grant'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}
