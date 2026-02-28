'use client'

import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Project, GrantCategory } from '@/lib/supabase'

export default function SettingsPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [categories, setCategories] = useState<GrantCategory[]>([])
  const [loading, setLoading] = useState(true)

  // Password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Project
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projCountry, setProjCountry] = useState('')
  const [projRegion, setProjRegion] = useState('')
  const [projSaving, setProjSaving] = useState(false)
  const [projMsg, setProjMsg] = useState('')

  // Category
  const [newCat, setNewCat] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [projRes, catRes] = await Promise.all([
      supabase.from('projects').select('*').limit(1).single(),
      supabase.from('grant_categories').select('*').order('name'),
    ])
    if (projRes.data) {
      setProject(projRes.data)
      setProjName(projRes.data.name || '')
      setProjDesc(projRes.data.description || '')
      setProjCountry(projRes.data.country || '')
      setProjRegion(projRes.data.region || '')
    }
    if (catRes.data) setCategories(catRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function changePassword() {
    setPwSaving(true)
    setPwMsg('')
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'app_password').single()
    if (!data || data.value !== currentPw) {
      setPwMsg('Current password is incorrect')
      setPwSaving(false)
      return
    }
    if (newPw.length < 4) {
      setPwMsg('New password must be at least 4 characters')
      setPwSaving(false)
      return
    }
    await supabase.from('app_settings').update({ value: newPw }).eq('key', 'app_password')
    setPwMsg('Password updated successfully')
    setCurrentPw('')
    setNewPw('')
    setPwSaving(false)
  }

  async function saveProject() {
    if (!project) return
    setProjSaving(true)
    setProjMsg('')
    await supabase.from('projects').update({
      name: projName.trim(),
      description: projDesc.trim() || null,
      country: projCountry.trim() || null,
      region: projRegion.trim() || null,
    }).eq('id', project.id)
    setProjMsg('Project updated')
    setProjSaving(false)
    setTimeout(() => setProjMsg(''), 2000)
  }

  async function addCategory() {
    if (!newCat.trim()) return
    setCatSaving(true)
    await supabase.from('grant_categories').insert({ name: newCat.trim() })
    setNewCat('')
    setCatSaving(false)
    fetchData()
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category? Grants using it will lose their category.')) return
    await supabase.from('grant_categories').delete().eq('id', id)
    fetchData()
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
      <div className="animate-fade-in max-w-2xl">
        <div className="mb-6">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your project, categories, and security</p>
        </div>

        <div className="space-y-4">
          {/* Project info */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Project Information</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Project Name</label>
                <input type="text" value={projName} onChange={(e) => setProjName(e.target.value)} className="input-field" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
                <textarea value={projDesc} onChange={(e) => setProjDesc(e.target.value)} rows={2} className="input-field resize-none" placeholder="Brief project description..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Country</label>
                <input type="text" value={projCountry} onChange={(e) => setProjCountry(e.target.value)} className="input-field" placeholder="e.g. Italy" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Region</label>
                <input type="text" value={projRegion} onChange={(e) => setProjRegion(e.target.value)} className="input-field" placeholder="e.g. Tuscany" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveProject} disabled={projSaving} className="btn-primary disabled:opacity-50">
                {projSaving ? 'Saving...' : 'Save'}
              </button>
              {projMsg && <span className="text-xs text-emerald-600 font-medium">{projMsg}</span>}
            </div>
          </div>

          {/* Grant categories */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Grant Categories</h2>
            <div className="space-y-1.5 mb-4">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between py-2 px-3 -mx-3 rounded-xl group hover:bg-white/40 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-sm text-slate-700">{cat.name}</span>
                  </div>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-400 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-slate-300 italic py-2">No categories defined</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                className="input-field text-sm"
                placeholder="New category name..."
              />
              <button onClick={addCategory} disabled={catSaving || !newCat.trim()} className="btn-secondary text-xs shrink-0 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          {/* Change password */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Change Password</h2>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Current Password</label>
                <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="input-field" placeholder="Enter current password" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">New Password</label>
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input-field" placeholder="Enter new password" />
              </div>
            </div>
            {pwMsg && (
              <p className={`text-xs mb-3 font-medium ${pwMsg.includes('success') ? 'text-emerald-600' : 'text-rose-500'}`}>
                {pwMsg}
              </p>
            )}
            <button onClick={changePassword} disabled={pwSaving || !currentPw || !newPw} className="btn-primary disabled:opacity-50">
              {pwSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>

          {/* Info */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">About</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Application</span>
                <span className="text-xs text-slate-600 font-medium">GrantFlow v0.1</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Database</span>
                <span className="text-xs text-slate-600 font-medium">Supabase (eu-central-1)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Hosting</span>
                <span className="text-xs text-slate-600 font-medium">Vercel</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
