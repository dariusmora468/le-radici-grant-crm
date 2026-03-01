'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'

interface DiscoveredGrant {
  name: string
  name_it: string | null
  funding_source: string
  funding_type: string
  category: string
  min_amount: number | null
  max_amount: number | null
  co_financing_pct: number | null
  description: string
  eligibility_summary: string | null
  why_relevant: string
  window_status: string
  application_window_opens: string | null
  application_window_closes: string | null
  official_url: string | null
  relevance_score: number
  effort_level: string
  requires_young_farmer: boolean
  requires_agricultural_entity: boolean
  requires_bsa_heritage: boolean
}

// Map AI category names to database category IDs
const CATEGORY_MAP: Record<string, string> = {
  'Agriculture': '54814b19-ab0f-48a6-8243-4f22a98cf653',
  'Heritage & Culture': 'ee3096d1-1855-4bc8-8f85-269c16bbfe81',
  'Tourism & Hospitality': 'f90faf92-23eb-4ac8-941b-996067083fdd',
  'Energy & Sustainability': 'd193f1f1-772f-46c3-aaf4-a7df1df54462',
  'Innovation & Digital': 'd20043ce-348e-4189-8384-a06ecde50086',
  'Young Entrepreneurs': 'd5f6a39a-3a98-41cd-9bb6-742bcf0af2cc',
  'Rural Development': 'f1102831-7458-4700-8ea7-6517b929c811',
  'Infrastructure': '36cabcbd-ae71-4400-8fb9-faae12aedf64',
}

export default function GrantDiscovery({
  project,
  existingGrantNames,
  onComplete,
}: {
  project: Project
  existingGrantNames: string[]
  onComplete: () => void
}) {
  const [discovering, setDiscovering] = useState(false)
  const [results, setResults] = useState<DiscoveredGrant[] | null>(null)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())
  const [savingAll, setSavingAll] = useState(false)

  async function handleDiscover() {
    setDiscovering(true)
    setError(null)
    setResults(null)

    try {
      const res = await apiFetch('/api/discover-grants', {
        method: 'POST',
        body: JSON.stringify({ project, existingGrantNames }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || `API error: ${res.status}`)
      }

      const data = await res.json()
      setResults(data.grants || [])
      setSummary(data.search_summary || '')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDiscovering(false)
    }
  }

  async function saveGrant(grant: DiscoveredGrant, index: number) {
    setSavingIds(prev => new Set(prev).add(index))

    try {
      const categoryId = CATEGORY_MAP[grant.category] || null
      const { error } = await supabase.from('grants').insert({
        name: grant.name,
        name_it: grant.name_it,
        funding_source: grant.funding_source,
        funding_type: grant.funding_type,
        category_id: categoryId,
        min_amount: grant.min_amount,
        max_amount: grant.max_amount,
        co_financing_pct: grant.co_financing_pct,
        description: grant.description,
        eligibility_summary: grant.eligibility_summary,
        why_relevant: grant.why_relevant,
        window_status: grant.window_status === 'Expected soon' ? 'Not yet open' : grant.window_status,
        application_window_opens: grant.application_window_opens,
        application_window_closes: grant.application_window_closes,
        official_url: grant.official_url,
        relevance_score: grant.relevance_score,
        effort_level: grant.effort_level,
        requires_young_farmer: grant.requires_young_farmer,
        requires_agricultural_entity: grant.requires_agricultural_entity,
        requires_bsa_heritage: grant.requires_bsa_heritage,
        verification_status: 'ai_generated',
        verification_confidence: 60,
        project_id: project.id,
      })

      if (error) throw error
      setSavedIds(prev => new Set(prev).add(index))
    } catch (err: any) {
      console.error('Save grant error:', err)
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  async function saveAllUnsaved() {
    if (!results) return
    setSavingAll(true)

    for (let i = 0; i < results.length; i++) {
      if (!savedIds.has(i)) {
        await saveGrant(results[i], i)
      }
    }

    setSavingAll(false)
    onComplete()
  }

  const unsavedCount = results ? results.length - savedIds.size : 0

  // Not yet triggered
  if (!results && !discovering) {
    return (
      <div className="card p-8 text-center mb-6">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(124,58,237,0.1) 100%)',
            border: '1px solid rgba(59,130,246,0.15)',
          }}
        >
          <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 mb-1">Discover Grants for Your Project</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
          AI will analyze your project profile and find matching EU, national, and regional funding opportunities.
        </p>
        <button
          onClick={handleDiscover}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          Find Grants with AI
        </button>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 max-w-md mx-auto">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-rose-500 hover:text-rose-700 font-medium">Dismiss</button>
          </div>
        )}
      </div>
    )
  }

  // Loading state
  if (discovering) {
    return (
      <div className="card p-12 text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4" style={{ background: 'rgba(59,130,246,0.08)' }}>
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <h3 className="text-base font-semibold text-slate-800 mb-1">Searching for Grants...</h3>
        <p className="text-sm text-slate-400">Analyzing your project profile against EU, national, and regional funding databases. This takes 15-30 seconds.</p>
      </div>
    )
  }

  // Results
  return (
    <div className="mb-6 space-y-3">
      {/* Summary bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Found {results?.length || 0} matching grants
            </h3>
            {summary && <p className="text-xs text-slate-500 mt-0.5">{summary}</p>}
          </div>
          <div className="flex items-center gap-3">
            {unsavedCount > 0 && (
              <button
                onClick={saveAllUnsaved}
                disabled={savingAll}
                className="btn-primary text-xs"
              >
                {savingAll ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : (
                  `Add All ${unsavedCount} to Database`
                )}
              </button>
            )}
            <button onClick={handleDiscover} className="btn-ghost text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Search Again
            </button>
            <button onClick={() => { setResults(null); onComplete() }} className="btn-ghost text-xs">
              Close
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-rose-500 hover:text-rose-700 font-medium">Dismiss</button>
        </div>
      )}

      {/* Grant cards */}
      {results?.map((grant, i) => {
        const isSaving = savingIds.has(i)
        const isSaved = savedIds.has(i)
        const scoreColor = grant.relevance_score >= 80 ? 'text-emerald-600 bg-emerald-50' :
          grant.relevance_score >= 60 ? 'text-blue-600 bg-blue-50' :
          grant.relevance_score >= 40 ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-50'

        return (
          <div
            key={i}
            className={cn('card p-5 transition-all', isSaved && 'opacity-50')}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-slate-800">{grant.name}</h4>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg', scoreColor)}>
                    {grant.relevance_score}% match
                  </span>
                </div>
                {grant.name_it && (
                  <p className="text-xs text-slate-400 italic mb-1">{grant.name_it}</p>
                )}
                <p className="text-sm text-slate-600 mb-2">{grant.description}</p>
                <p className="text-xs text-blue-600 mb-3">{grant.why_relevant}</p>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/60 text-slate-500 border border-slate-200/60">
                    {grant.funding_source}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/60 text-slate-500 border border-slate-200/60">
                    {grant.funding_type}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/60 text-slate-500 border border-slate-200/60">
                    {grant.category}
                  </span>
                  {grant.window_status && (
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                      grant.window_status === 'Open' ? 'bg-emerald-50 text-emerald-600' :
                      grant.window_status === 'Rolling' ? 'bg-violet-50 text-violet-600' :
                      'bg-slate-50 text-slate-400'
                    )}>
                      {grant.window_status}
                    </span>
                  )}
                  {grant.effort_level && (
                    <span className="text-[10px] text-slate-400">Effort: {grant.effort_level}</span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                {(grant.min_amount || grant.max_amount) && (
                  <p className="text-sm font-bold text-slate-800 mb-2">
                    {grant.max_amount ? formatCurrency(grant.max_amount) : formatCurrency(grant.min_amount)}
                  </p>
                )}
                {isSaved ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Added
                  </span>
                ) : (
                  <button
                    onClick={() => saveGrant(grant, i)}
                    disabled={isSaving}
                    className="btn-primary text-xs"
                  >
                    {isSaving ? (
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Add to Database'
                    )}
                  </button>
                )}

                {grant.official_url && (
                  <a
                    href={grant.official_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[10px] text-blue-500 hover:text-blue-700 mt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Official page →
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
