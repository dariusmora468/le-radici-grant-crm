'use client'

import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { supabase, ENTITY_TYPES, ENTITY_STATUSES, SECTORS, OBJECTIVES, URGENCY_LEVELS } from '@/lib/supabase'
import type { Project } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'

const SECTION_FIELDS: Record<string, (keyof Project)[]> = {
  'Basics': ['name', 'summary', 'description', 'country', 'region', 'municipality', 'website'],
  'Entity': ['entity_type', 'entity_status', 'young_farmer_eligible', 'female_farmer_eligible', 'ateco_codes'],
  'Sector': ['primary_sector', 'secondary_sectors', 'objectives'],
  'Property': ['heritage_classification', 'landscape_protections', 'land_area_hectares', 'building_area_sqm', 'land_use_types'],
  'Financial': ['total_investment_estimate', 'own_capital_available', 'co_financing_capacity_pct', 'annual_revenue', 'funding_range_min', 'funding_range_max'],
  'Timeline': ['project_start_date', 'expected_completion_date', 'urgency'],
  'Team': ['team_size', 'key_qualifications', 'experience_summary'],
  'Sustainability': ['sustainability_goals'],
}

function countFilled(project: Project, fields: (keyof Project)[]): number {
  return fields.filter((f) => {
    const v = project[f]
    if (v === null || v === undefined || v === '' || v === false) return false
    if (Array.isArray(v) && v.length === 0) return false
    return true
  }).length
}

export default function ProjectPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [activeSection, setActiveSection] = useState('Basics')

  // Form state mirrors project
  const [form, setForm] = useState<Record<string, any>>({})

  const fetchProject = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').limit(1).single()
    if (data) {
      setProject(data)
      setForm({
        name: data.name || '',
        summary: data.summary || '',
        description: data.description || '',
        country: data.country || '',
        region: data.region || '',
        municipality: data.municipality || '',
        website: data.website || '',
        entity_type: data.entity_type || '',
        entity_status: data.entity_status || '',
        young_farmer_eligible: data.young_farmer_eligible || false,
        female_farmer_eligible: data.female_farmer_eligible || false,
        ateco_codes: data.ateco_codes || '',
        primary_sector: data.primary_sector || '',
        secondary_sectors: data.secondary_sectors || [],
        heritage_classification: data.heritage_classification || '',
        landscape_protections: data.landscape_protections || '',
        land_area_hectares: data.land_area_hectares?.toString() || '',
        building_area_sqm: data.building_area_sqm?.toString() || '',
        land_use_types: data.land_use_types || [],
        total_investment_estimate: data.total_investment_estimate?.toString() || '',
        own_capital_available: data.own_capital_available?.toString() || '',
        co_financing_capacity_pct: data.co_financing_capacity_pct?.toString() || '',
        annual_revenue: data.annual_revenue?.toString() || '',
        funding_range_min: data.funding_range_min?.toString() || '',
        funding_range_max: data.funding_range_max?.toString() || '',
        project_start_date: data.project_start_date || '',
        expected_completion_date: data.expected_completion_date || '',
        urgency: data.urgency || '',
        team_size: data.team_size?.toString() || '',
        key_qualifications: data.key_qualifications || '',
        experience_summary: data.experience_summary || '',
        objectives: data.objectives || [],
        sustainability_goals: data.sustainability_goals || '',
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchProject() }, [fetchProject])

  function update(field: string, value: any) {
    setForm((prev: any) => ({ ...prev, [field]: value }))
  }

  function toggleArrayItem(field: string, item: string) {
    setForm((prev: any) => {
      const arr = prev[field] || []
      return { ...prev, [field]: arr.includes(item) ? arr.filter((i: string) => i !== item) : [...arr, item] }
    })
  }

  async function handleSave() {
    if (!project) return
    setSaving(true)
    setSaveMsg('')
    const payload = {
      name: form.name?.trim() || project.name,
      summary: form.summary?.trim() || null,
      description: form.description?.trim() || null,
      country: form.country?.trim() || null,
      region: form.region?.trim() || null,
      municipality: form.municipality?.trim() || null,
      website: form.website?.trim() || null,
      entity_type: form.entity_type || null,
      entity_status: form.entity_status || null,
      young_farmer_eligible: form.young_farmer_eligible || false,
      female_farmer_eligible: form.female_farmer_eligible || false,
      ateco_codes: form.ateco_codes?.trim() || null,
      primary_sector: form.primary_sector || null,
      secondary_sectors: form.secondary_sectors?.length > 0 ? form.secondary_sectors : null,
      heritage_classification: form.heritage_classification?.trim() || null,
      landscape_protections: form.landscape_protections?.trim() || null,
      land_area_hectares: form.land_area_hectares ? parseFloat(form.land_area_hectares) : null,
      building_area_sqm: form.building_area_sqm ? parseFloat(form.building_area_sqm) : null,
      land_use_types: form.land_use_types?.length > 0 ? form.land_use_types : null,
      total_investment_estimate: form.total_investment_estimate ? parseFloat(form.total_investment_estimate) : null,
      own_capital_available: form.own_capital_available ? parseFloat(form.own_capital_available) : null,
      co_financing_capacity_pct: form.co_financing_capacity_pct ? parseFloat(form.co_financing_capacity_pct) : null,
      annual_revenue: form.annual_revenue ? parseFloat(form.annual_revenue) : null,
      funding_range_min: form.funding_range_min ? parseFloat(form.funding_range_min) : null,
      funding_range_max: form.funding_range_max ? parseFloat(form.funding_range_max) : null,
      project_start_date: form.project_start_date || null,
      expected_completion_date: form.expected_completion_date || null,
      urgency: form.urgency || null,
      team_size: form.team_size ? parseInt(form.team_size) : null,
      key_qualifications: form.key_qualifications?.trim() || null,
      experience_summary: form.experience_summary?.trim() || null,
      objectives: form.objectives?.length > 0 ? form.objectives : null,
      sustainability_goals: form.sustainability_goals?.trim() || null,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('projects').update(payload).eq('id', project.id)
    setSaveMsg('Saved')
    setSaving(false)
    fetchProject()
    setTimeout(() => setSaveMsg(''), 2000)
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

  if (!project) return null

  const totalFields = Object.values(SECTION_FIELDS).flat().length
  const filledFields = Object.values(SECTION_FIELDS).flat().reduce((sum, f) => sum + countFilled(project, [f]), 0)
  const completionPct = Math.round((filledFields / totalFields) * 100)

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Pre-Application</h1>
            <p className="page-subtitle">Your universal project profile, used to match and qualify grants</p>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && <span className="text-xs text-emerald-600 font-medium">{saveMsg}</span>}
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Completion bar */}
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-800">Profile Completeness</span>
              <span className={cn(
                'badge text-[10px]',
                completionPct >= 80 ? 'bg-emerald-50 text-emerald-600' :
                completionPct >= 50 ? 'bg-amber-50 text-amber-600' :
                'bg-rose-50 text-rose-500'
              )}>
                {completionPct}%
              </span>
            </div>
            <span className="text-xs text-slate-400">{filledFields}/{totalFields} fields</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                completionPct >= 80 ? 'bg-emerald-400' :
                completionPct >= 50 ? 'bg-amber-400' :
                'bg-rose-400'
              )}
              style={{ width: `${completionPct}%` }}
            />
          </div>
          {/* Section pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(SECTION_FIELDS).map(([section, fields]) => {
              const filled = countFilled(project, fields)
              const total = fields.length
              const pct = Math.round((filled / total) * 100)
              return (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200',
                    activeSection === section
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                      : 'text-slate-500 hover:bg-white/50'
                  )}
                >
                  <span className={cn(
                    'inline-block w-1.5 h-1.5 rounded-full mr-1.5',
                    pct === 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200'
                  )} />
                  {section}
                </button>
              )
            })}
          </div>
        </div>

        {/* Form sections */}
        <div className="max-w-3xl">
          {activeSection === 'Basics' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Project Basics</h2>
              <div className="space-y-4">
                <Field label="Project Name *" value={form.name} onChange={(v) => update('name', v)} />
                <Field label="One-line Summary" value={form.summary} onChange={(v) => update('summary', v)} placeholder="A brief sentence describing your project" />
                <Field label="Full Description" value={form.description} onChange={(v) => update('description', v)} textarea rows={4} placeholder="Detailed project description..." />
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Country" value={form.country} onChange={(v) => update('country', v)} />
                  <Field label="Region" value={form.region} onChange={(v) => update('region', v)} />
                  <Field label="Municipality" value={form.municipality} onChange={(v) => update('municipality', v)} />
                </div>
                <Field label="Website" value={form.website} onChange={(v) => update('website', v)} placeholder="https://..." />
              </div>
            </div>
          )}

          {activeSection === 'Entity' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Legal Entity</h2>
              <div className="space-y-4">
                <SelectField label="Entity Type" value={form.entity_type} onChange={(v) => update('entity_type', v)} options={ENTITY_TYPES} />
                <SelectField label="Entity Status" value={form.entity_status} onChange={(v) => update('entity_status', v)} options={ENTITY_STATUSES} />
                <Field label="ATECO Codes" value={form.ateco_codes} onChange={(v) => update('ateco_codes', v)} placeholder="e.g. 01.26, 55.20, 96.04" />
                <div className="grid grid-cols-2 gap-4">
                  <CheckboxField label="Young Farmer Eligible (under 40)" checked={form.young_farmer_eligible} onChange={(v) => update('young_farmer_eligible', v)} />
                  <CheckboxField label="Female Farmer Eligible" checked={form.female_farmer_eligible} onChange={(v) => update('female_farmer_eligible', v)} />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'Sector' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Sector and Objectives</h2>
              <div className="space-y-4">
                <SelectField label="Primary Sector" value={form.primary_sector} onChange={(v) => update('primary_sector', v)} options={SECTORS} />
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-2">Secondary Sectors</label>
                  <div className="flex flex-wrap gap-2">
                    {SECTORS.map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleArrayItem('secondary_sectors', s)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border',
                          (form.secondary_sectors || []).includes(s)
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white/40 text-slate-500 border-transparent hover:bg-white/60'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-2">Project Objectives</label>
                  <div className="grid grid-cols-2 gap-2">
                    {OBJECTIVES.map((obj) => (
                      <label key={obj} className="flex items-center gap-2.5 py-1.5 px-3 rounded-xl cursor-pointer hover:bg-white/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={(form.objectives || []).includes(obj)}
                          onChange={() => toggleArrayItem('objectives', obj)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400/40"
                        />
                        <span className="text-sm text-slate-600">{obj}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'Property' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Property and Site</h2>
              <div className="space-y-4">
                <Field label="Heritage Classification" value={form.heritage_classification} onChange={(v) => update('heritage_classification', v)} placeholder="e.g. Bene Storico Architettonico (BSA)" />
                <Field label="Landscape Protections" value={form.landscape_protections} onChange={(v) => update('landscape_protections', v)} textarea rows={2} placeholder="Any landscape or environmental protections..." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Land Area (hectares)" value={form.land_area_hectares} onChange={(v) => update('land_area_hectares', v)} type="number" />
                  <Field label="Building Area (sqm)" value={form.building_area_sqm} onChange={(v) => update('building_area_sqm', v)} type="number" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-2">Land Use Types</label>
                  <div className="space-y-1.5">
                    {(form.land_use_types || []).map((item: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const newArr = [...(form.land_use_types || [])]
                            newArr[i] = e.target.value
                            update('land_use_types', newArr)
                          }}
                          className="input-field text-sm"
                        />
                        <button
                          onClick={() => update('land_use_types', (form.land_use_types || []).filter((_: string, idx: number) => idx !== i))}
                          className="text-slate-300 hover:text-rose-400 transition-colors shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => update('land_use_types', [...(form.land_use_types || []), ''])}
                      className="btn-ghost text-xs"
                    >+ Add land use type</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'Financial' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Financial Profile</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Total Investment Estimate (EUR)" value={form.total_investment_estimate} onChange={(v) => update('total_investment_estimate', v)} type="number" />
                  <Field label="Own Capital Available (EUR)" value={form.own_capital_available} onChange={(v) => update('own_capital_available', v)} type="number" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Co-financing Capacity (%)" value={form.co_financing_capacity_pct} onChange={(v) => update('co_financing_capacity_pct', v)} type="number" />
                  <Field label="Current Annual Revenue" value={form.annual_revenue} onChange={(v) => update('annual_revenue', v)} type="number" />
                  <div />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Funding Range Min (EUR)" value={form.funding_range_min} onChange={(v) => update('funding_range_min', v)} type="number" />
                  <Field label="Funding Range Max (EUR)" value={form.funding_range_max} onChange={(v) => update('funding_range_max', v)} type="number" />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'Timeline' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Timeline</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Project Start Date" value={form.project_start_date} onChange={(v) => update('project_start_date', v)} type="date" />
                  <Field label="Expected Completion" value={form.expected_completion_date} onChange={(v) => update('expected_completion_date', v)} type="date" />
                </div>
                <SelectField label="Urgency" value={form.urgency} onChange={(v) => update('urgency', v)} options={URGENCY_LEVELS} />
              </div>
            </div>
          )}

          {activeSection === 'Team' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Team</h2>
              <div className="space-y-4">
                <Field label="Team Size" value={form.team_size} onChange={(v) => update('team_size', v)} type="number" />
                <Field label="Key Qualifications" value={form.key_qualifications} onChange={(v) => update('key_qualifications', v)} textarea rows={3} placeholder="What qualifications does your team bring?" />
                <Field label="Experience Summary" value={form.experience_summary} onChange={(v) => update('experience_summary', v)} textarea rows={3} placeholder="Brief overview of the team's relevant experience..." />
              </div>
            </div>
          )}

          {activeSection === 'Sustainability' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Sustainability</h2>
              <div className="space-y-4">
                <Field label="Sustainability Goals" value={form.sustainability_goals} onChange={(v) => update('sustainability_goals', v)} textarea rows={4} placeholder="Describe your sustainability and environmental goals..." />
              </div>
            </div>
          )}

          {/* Bottom save */}
          <div className="mt-6 flex items-center justify-between pb-8">
            <p className="text-xs text-slate-400">
              This profile is used to match and qualify grant opportunities. The more complete it is, the better the matching.
            </p>
            <div className="flex items-center gap-3">
              {saveMsg && <span className="text-xs text-emerald-600 font-medium">{saveMsg}</span>}
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function Field({
  label, value, onChange, placeholder, type, textarea, rows,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; textarea?: boolean; rows?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows || 3} className="input-field resize-none" placeholder={placeholder} />
      ) : (
        <input type={type || 'text'} value={value} onChange={(e) => onChange(e.target.value)} className="input-field" placeholder={placeholder} />
      )}
    </div>
  )
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="select-field">
        <option value="">Select...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer hover:bg-white/50 transition-colors">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400/40" />
      <span className="text-sm text-slate-600">{label}</span>
    </label>
  )
}
