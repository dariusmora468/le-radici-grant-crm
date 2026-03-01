'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Consultant } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const emptyForm = {
  name: '',
  organization: '',
  email: '',
  phone: '',
  specialization: '',
  region: '',
  website: '',
  notes: '',
}

function ConsultantsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const grantApplicationId = searchParams.get('grant_application_id')
  const grantName = searchParams.get('grant_name')

  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // AI search state
  const [aiSearching, setAiSearching] = useState(false)
  const [aiSearchDone, setAiSearchDone] = useState(false)
  const [aiResults, setAiResults] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('consultants').select('*').order('name')
    if (data) setConsultants(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-search for consultants when arriving with a grant filter
  useEffect(() => {
    if (grantApplicationId && grantName && !aiSearchDone && !aiSearching && consultants.length >= 0 && !loading) {
      runAiSearch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantApplicationId, grantName, loading])

  async function runAiSearch() {
    setAiSearching(true)
    setAiResults([])

    try {
      // Fetch project profile and grant info
      const [projectRes, appRes] = await Promise.all([
        supabase.from('projects').select('*').limit(1).single(),
        grantApplicationId
          ? supabase.from('grant_applications').select('*, grant:grants(*)').eq('id', grantApplicationId).single()
          : Promise.resolve({ data: null }),
      ])

      const grant = appRes.data?.grant || { name: grantName }
      const project = projectRes.data || { name: 'Agricultural estate conversion', region: 'Tuscany', country: 'Italy' }

      const res = await fetch('/api/find-consultants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant, project }),
      })

      let data
      try {
        const text = await res.text()
        data = JSON.parse(text)
      } catch {
        throw new Error('Invalid response from consultant search')
      }

      if (data.error) throw new Error(data.error)

      const found = Array.isArray(data) ? data : data.consultants || []
      setAiResults(found)
    } catch (err: any) {
      console.error('AI consultant search failed:', err)
    }

    setAiSearching(false)
    setAiSearchDone(true)
  }

  async function addAiResult(result: any) {
    setSaving(true)
    const payload = {
      name: result.name || 'Unknown',
      organization: result.organization || null,
      email: result.email || null,
      phone: result.phone || null,
      specialization: result.specialization || null,
      region: result.region || null,
      website: result.website || null,
      notes: result.notes || null,
    }

    const { data } = await supabase.from('consultants').insert(payload).select().single()

    if (data && grantApplicationId) {
      // Assign to the grant application
      await supabase.from('grant_applications').update({ consultant_id: data.id }).eq('id', grantApplicationId)
      await supabase.from('grant_activity_log').insert({
        application_id: grantApplicationId,
        action: 'Consultant assigned',
        details: `Added ${data.name}${data.organization ? ` (${data.organization})` : ''}`,
        performed_by: 'User',
      })
    }

    // Remove from AI results
    setAiResults(prev => prev.filter(r => r.name !== result.name))
    setSaving(false)
    fetchData()
  }

  async function assignExistingConsultant(consultantId: string, consultantName: string) {
    if (!grantApplicationId) return
    await supabase.from('grant_applications').update({ consultant_id: consultantId }).eq('id', grantApplicationId)
    await supabase.from('grant_activity_log').insert({
      application_id: grantApplicationId,
      action: 'Consultant assigned',
      details: `Added ${consultantName}`,
      performed_by: 'User',
    })
    router.push(`/pipeline/${grantApplicationId}`)
  }

  function clearFilter() {
    router.push('/consultants')
    setAiResults([])
    setAiSearchDone(false)
  }

  function startEdit(c: Consultant) {
    setForm({
      name: c.name || '',
      organization: c.organization || '',
      email: c.email || '',
      phone: c.phone || '',
      specialization: c.specialization || '',
      region: c.region || '',
      website: c.website || '',
      notes: c.notes || '',
    })
    setEditingId(c.id)
    setShowForm(true)
  }

  function startNew() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      organization: form.organization.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      specialization: form.specialization.trim() || null,
      region: form.region.trim() || null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
    }

    let newId: string | null = null
    if (editingId) {
      await supabase.from('consultants').update(payload).eq('id', editingId)
      newId = editingId
    } else {
      const { data } = await supabase.from('consultants').insert(payload).select().single()
      newId = data?.id || null
    }

    // If adding while filtered, assign to application
    if (!editingId && newId && grantApplicationId) {
      await supabase.from('grant_applications').update({ consultant_id: newId }).eq('id', grantApplicationId)
      await supabase.from('grant_activity_log').insert({
        application_id: grantApplicationId,
        action: 'Consultant assigned',
        details: `Added ${form.name.trim()}`,
        performed_by: 'User',
      })
    }

    setSaving(false)
    cancelForm()
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this consultant?')) return
    await supabase.from('consultants').delete().eq('id', id)
    if (expandedId === id) setExpandedId(null)
    fetchData()
  }

  const filtered = consultants.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.organization && c.organization.toLowerCase().includes(q)) ||
      (c.specialization && c.specialization.toLowerCase().includes(q)) ||
      (c.region && c.region.toLowerCase().includes(q))
    )
  })

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Grant filter banner */}
        {grantApplicationId && grantName && (
          <div className="mb-4 p-3 rounded-xl flex items-center justify-between" style={{
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
          }}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              <span className="text-xs text-blue-700">
                Finding consultants for: <span className="font-semibold">{decodeURIComponent(grantName)}</span>
              </span>
            </div>
            <button onClick={clearFilter} className="text-xs text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear filter
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Consultants</h1>
            <p className="page-subtitle">{consultants.length} consultant{consultants.length !== 1 ? 's' : ''} in directory</p>
          </div>
          <button onClick={startNew} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Consultant
          </button>
        </div>

        {/* AI Search Results */}
        {(aiSearching || aiResults.length > 0) && (
          <div className="card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              {aiSearching ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-600">Searching for consultants who specialize in this type of grant...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-700">AI found {aiResults.length} potential consultant{aiResults.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>

            {aiResults.length > 0 && (
              <div className="space-y-2">
                {aiResults.map((r, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{r.name}</p>
                      {r.organization && <p className="text-xs text-slate-400">{r.organization}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        {r.specialization && <span className="badge bg-blue-50 text-blue-600 text-[10px]">{r.specialization}</span>}
                        {r.region && <span className="text-[10px] text-slate-400">{r.region}</span>}
                      </div>
                      {r.notes && <p className="text-xs text-slate-500 mt-1">{r.notes}</p>}
                      <div className="flex items-center gap-3 mt-1.5">
                        {r.website && (
                          <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:text-blue-600 truncate">
                            {r.website.replace(/^https?:\/\//, '')}
                          </a>
                        )}
                        {r.email && <span className="text-[10px] text-slate-400">{r.email}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => addAiResult(r)}
                      disabled={saving}
                      className="btn-primary text-xs shrink-0 disabled:opacity-50"
                    >
                      {grantApplicationId ? 'Add & Assign' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        {consultants.length > 0 && (
          <div className="card p-4 mb-6">
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, organization, specialization, or region..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
        )}

        {/* Add/Edit form */}
        {showForm && (
          <div className="card p-6 mb-6 animate-slide-up">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">{editingId ? 'Edit Consultant' : 'New Consultant'}</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Full name" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Organization</label>
                <input type="text" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} className="input-field" placeholder="Company or firm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="+39..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Specialization</label>
                <input type="text" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} className="input-field" placeholder="e.g. EU agricultural grants" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Region</label>
                <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input-field" placeholder="e.g. Tuscany" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Website</label>
                <input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input-field" placeholder="https://..." />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="input-field resize-none" placeholder="How did you find them, what are they good at..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={cancelForm} className="btn-ghost text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : grantApplicationId ? 'Add & Assign' : 'Add Consultant'}
              </button>
            </div>
          </div>
        )}

        {/* Existing consultants list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-16 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
              style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.1)' }}
            >
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">
              {consultants.length === 0 ? 'No consultants yet' : 'No results match your search'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {consultants.length === 0 ? 'Add your first consultant to start building your network' : 'Try a different search term'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {grantApplicationId && filtered.length > 0 && (
              <p className="text-xs text-slate-400 mb-2 px-1">Your existing consultants. Click "Assign" to link one to this grant.</p>
            )}
            {filtered.map((c) => {
              const isExpanded = expandedId === c.id
              return (
                <div key={c.id} className="card-hover">
                  <div
                    className="p-5 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-blue-600 shrink-0"
                          style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.1)' }}
                        >
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">{c.name}</h3>
                          {c.organization && <p className="text-xs text-slate-400 mt-0.5">{c.organization}</p>}
                          <div className="flex items-center gap-3 mt-2">
                            {c.specialization && <span className="badge bg-blue-50 text-blue-600 text-[10px]">{c.specialization}</span>}
                            {c.region && <span className="text-xs text-slate-400">{c.region}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {grantApplicationId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); assignExistingConsultant(c.id, c.name) }}
                            className="btn-secondary text-xs"
                          >
                            Assign
                          </button>
                        )}
                        <svg
                          className={cn('w-4 h-4 text-slate-300 transition-transform duration-200', isExpanded && 'rotate-180')}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-0 animate-fade-in">
                      <div className="h-px bg-slate-100 mb-4" />
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {c.email && (
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">Email</p>
                            <a href={`mailto:${c.email}`} className="text-sm text-blue-600 hover:text-blue-700 transition-colors">{c.email}</a>
                          </div>
                        )}
                        {c.phone && (
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">Phone</p>
                            <a href={`tel:${c.phone}`} className="text-sm text-slate-700">{c.phone}</a>
                          </div>
                        )}
                        {c.website && (
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">Website</p>
                            <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 transition-colors truncate block">{c.website.replace(/^https?:\/\//, '')}</a>
                          </div>
                        )}
                      </div>
                      {c.notes && (
                        <div className="mb-4">
                          <p className="text-xs text-slate-400 mb-0.5">Notes</p>
                          <p className="text-sm text-slate-600">{c.notes}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); startEdit(c) }} className="btn-secondary text-xs">Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }} className="btn-ghost text-xs text-rose-500 hover:text-rose-600">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default function ConsultantsPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    }>
      <ConsultantsContent />
    </Suspense>
  )
}
