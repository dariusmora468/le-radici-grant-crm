'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, STAGE_COLORS, FUNDING_SOURCES, FUNDING_TYPES } from '@/lib/supabase'
import type { Grant, GrantCategory } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'

export default function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([])
  const [categories, setCategories] = useState<GrantCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [grantsRes, catsRes] = await Promise.all([
      supabase
        .from('grants')
        .select('*, category:grant_categories(*)')
        .order('relevance_score', { ascending: false, nullsFirst: false }),
      supabase.from('grant_categories').select('*').order('name'),
    ])
    if (grantsRes.data) setGrants(grantsRes.data)
    if (catsRes.data) setCategories(catsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = grants.filter((g) => {
    if (search) {
      const q = search.toLowerCase()
      const match =
        g.name.toLowerCase().includes(q) ||
        (g.name_it && g.name_it.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.funding_source && g.funding_source.toLowerCase().includes(q))
      if (!match) return false
    }
    if (filterSource && g.funding_source !== filterSource) return false
    if (filterType && g.funding_type !== filterType) return false
    if (filterCategory && g.category_id !== filterCategory) return false
    return true
  })

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Grants</h1>
            <p className="page-subtitle">{grants.length} grants identified{filtered.length !== grants.length ? `, ${filtered.length} shown` : ''}</p>
          </div>
          <Link href="/grants/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Grant
          </Link>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search grants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="select-field w-40">
              <option value="">All Sources</option>
              {FUNDING_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select-field w-44">
              <option value="">All Types</option>
              {FUNDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="select-field w-48">
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {(search || filterSource || filterType || filterCategory) && (
              <button
                onClick={() => { setSearch(''); setFilterSource(''); setFilterType(''); setFilterCategory('') }}
                className="btn-ghost text-xs whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Grants list */}
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">
              {grants.length === 0 ? 'No grants added yet' : 'No grants match your filters'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {grants.length === 0 ? 'Add your first grant to get started' : 'Try adjusting your search or filters'}
            </p>
            {grants.length === 0 && (
              <Link href="/grants/new" className="btn-primary mt-4 inline-flex">Add first grant</Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((grant) => (
              <Link key={grant.id} href={`/grants/${grant.id}`} className="block">
                <div className="card-hover p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <h3 className="text-sm font-semibold text-slate-800 truncate">{grant.name}</h3>
                        {grant.category && (
                          <span className="badge bg-blue-50 text-blue-600 shrink-0">{grant.category.name}</span>
                        )}
                      </div>
                      {grant.name_it && (
                        <p className="text-xs text-slate-400 mb-1.5 truncate italic">{grant.name_it}</p>
                      )}
                      {grant.description && (
                        <p className="text-sm text-slate-500 line-clamp-2">{grant.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        {grant.funding_source && (
                          <span className="text-xs text-slate-400">
                            <span className="font-medium text-slate-500">{grant.funding_source}</span>
                          </span>
                        )}
                        {grant.funding_type && (
                          <span className="text-xs text-slate-400">{grant.funding_type}</span>
                        )}
                        {grant.effort_level && (
                          <span className="text-xs text-slate-400">Effort: {grant.effort_level}</span>
                        )}
                        {grant.window_status && (
                          <span className={cn(
                            'badge text-[10px]',
                            grant.window_status === 'Open' ? 'bg-emerald-50 text-emerald-600' :
                            grant.window_status === 'Closing soon' ? 'bg-amber-50 text-amber-600' :
                            grant.window_status === 'Closed' ? 'bg-rose-50 text-rose-500' :
                            'bg-slate-50 text-slate-400'
                          )}>
                            {grant.window_status}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {(grant.min_amount || grant.max_amount) && (
                        <p className="text-sm font-semibold text-slate-800">
                          {grant.min_amount && grant.max_amount
                            ? `${formatCurrency(grant.min_amount)} - ${formatCurrency(grant.max_amount)}`
                            : formatCurrency(grant.max_amount || grant.min_amount)}
                        </p>
                      )}
                      {grant.relevance_score !== null && (
                        <div className="flex items-center gap-1 mt-1.5 justify-end">
                          <span className="text-[10px] text-slate-400">Relevance</span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div
                                key={i}
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  i <= (grant.relevance_score || 0) ? 'bg-blue-400' : 'bg-slate-200'
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
