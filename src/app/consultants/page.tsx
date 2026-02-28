'use client'

import { useState, useEffect, useCallback } from 'react'
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

export default function ConsultantsPage() {
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('consultants').select('*').order('name')
    if (data) setConsultants(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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
    if (editingId) {
      await supabase.from('consultants').update(payload).eq('id', editingId)
    } else {
      await supabase.from('consultants').insert(payload)
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
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Consultant'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
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
                      <svg
                        className={cn('w-4 h-4 text-slate-300 transition-transform duration-200', isExpanded && 'rotate-180')}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
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
