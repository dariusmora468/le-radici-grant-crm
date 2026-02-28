'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, STAGE_COLORS } from '@/lib/supabase'
import type { Grant, GrantApplication } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil, cn } from '@/lib/utils'

export default function GrantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [grant, setGrant] = useState<Grant | null>(null)
  const [applications, setApplications] = useState<GrantApplication[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGrant = useCallback(async () => {
    const id = params.id as string
    const [grantRes, appsRes] = await Promise.all([
      supabase.from('grants').select('*, category:grant_categories(*)').eq('id', id).single(),
      supabase.from('grant_applications').select('*').eq('grant_id', id).order('created_at', { ascending: false }),
    ])
    if (grantRes.data) setGrant(grantRes.data)
    if (appsRes.data) setApplications(appsRes.data)
    setLoading(false)
  }, [params.id])

  useEffect(() => { fetchGrant() }, [fetchGrant])

  async function handleAddToPipeline() {
    if (!grant) return
    const { data } = await supabase.from('projects').select('id').limit(1).single()
    if (!data) return
    await supabase.from('grant_applications').insert({
      project_id: data.id,
      grant_id: grant.id,
      stage: 'Discovered',
      target_amount: grant.max_amount,
    })
    fetchGrant()
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

  if (!grant) {
    return (
      <AppShell>
        <div className="card p-16 text-center">
          <p className="text-sm text-slate-500">Grant not found</p>
          <Link href="/grants" className="btn-primary mt-4 inline-flex">Back to grants</Link>
        </div>
      </AppShell>
    )
  }

  const deadlineDays = daysUntil(grant.application_window_closes)
  const inPipeline = applications.length > 0

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/grants" className="text-slate-400 hover:text-slate-600 transition-colors">Grants</Link>
          <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-slate-700 font-medium truncate max-w-xs">{grant.name}</span>
        </div>

        {/* Header card with CTA */}
        <div className="card p-6 mb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-semibold text-slate-900">{grant.name}</h1>
                {grant.funding_source && <span className="badge bg-blue-50 text-blue-600">{grant.funding_source}</span>}
                {grant.funding_type && grant.funding_type !== 'Grant' && (
                  <span className="badge bg-violet-50 text-violet-600">{grant.funding_type}</span>
                )}
              </div>
              {grant.name_it && <p className="text-sm text-slate-400 italic mb-2">{grant.name_it}</p>}
              {grant.description && <p className="text-sm text-slate-600 leading-relaxed">{grant.description}</p>}
            </div>
            <div className="text-right shrink-0">
              {(grant.min_amount || grant.max_amount) && (
                <div className="mb-3">
                  <p className="text-xs text-slate-400 mb-0.5">Potential Value</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {grant.max_amount ? formatCurrency(grant.max_amount) : formatCurrency(grant.min_amount)}
                  </p>
                  {grant.min_amount && grant.max_amount && (
                    <p className="text-xs text-slate-400">from {formatCurrency(grant.min_amount)}</p>
                  )}
                </div>
              )}
              {grant.co_financing_pct !== null && (
                <p className="text-xs text-slate-400">Co-financing: {grant.co_financing_pct}%</p>
              )}
            </div>
          </div>

          {/* CTA buttons */}
          <div className="mt-5 pt-5 flex items-center gap-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            {!inPipeline ? (
              <button onClick={handleAddToPipeline} className="btn-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add to Pipeline
              </button>
            ) : (
              <Link href={`/pipeline/${applications[0].id}`} className="btn-secondary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                View in Pipeline
              </Link>
            )}
            <button
              disabled
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white/60 cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(124, 58, 237, 0.3) 100%)',
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Apply with AI
              <span className="text-[10px] font-normal opacity-70 ml-1">Coming Soon</span>
            </button>
            {grant.official_url && (
              <a href={grant.official_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Official Page
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Left column */}
          <div className="col-span-2 space-y-4">
            {/* Details */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Details</h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <InfoRow label="Funding Source" value={grant.funding_source} />
                <InfoRow label="Funding Type" value={grant.funding_type} />
                <InfoRow label="Effort Level" value={grant.effort_level} />
                <InfoRow label="Processing Time" value={grant.processing_time_months ? `${grant.processing_time_months} months` : null} />
                <InfoRow label="Window Opens" value={formatDate(grant.application_window_opens)} />
                <InfoRow label="Window Closes" value={
                  grant.application_window_closes ? (
                    <span className="flex items-center gap-2">
                      {formatDate(grant.application_window_closes)}
                      {deadlineDays !== null && deadlineDays > 0 && deadlineDays <= 30 && (
                        <span className="badge bg-amber-50 text-amber-600 text-[10px]">{deadlineDays}d left</span>
                      )}
                      {deadlineDays !== null && deadlineDays <= 0 && (
                        <span className="badge bg-rose-50 text-rose-500 text-[10px]">Closed</span>
                      )}
                    </span>
                  ) : null
                } />
                <InfoRow label="Window Status" value={grant.window_status} />
                <InfoRow label="Regulation" value={grant.regulation_reference} />
              </div>
            </div>

            {/* Eligibility */}
            {grant.eligibility_summary && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Eligibility</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{grant.eligibility_summary}</p>
              </div>
            )}

            {/* Requirements flags */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Requirements</h2>
              <div className="grid grid-cols-2 gap-3">
                <ReqFlag label="Young Farmer" met={grant.requires_young_farmer} />
                <ReqFlag label="Female Farmer" met={grant.requires_female_farmer} />
                <ReqFlag label="Agricultural Entity" met={grant.requires_agricultural_entity} />
                <ReqFlag label="BSA Heritage" met={grant.requires_bsa_heritage} />
              </div>
            </div>

            {/* Notes */}
            {(grant.notes || grant.research_notes) && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Notes</h2>
                {grant.notes && <p className="text-sm text-slate-600 leading-relaxed mb-3">{grant.notes}</p>}
                {grant.research_notes && (
                  <>
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-4 mb-2">Research Notes</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{grant.research_notes}</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Relevance */}
            {grant.relevance_score !== null && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Relevance Score</h2>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={cn('w-4 h-4 rounded-full', i <= (grant.relevance_score || 0) ? 'bg-blue-400' : 'bg-slate-200')} />
                    ))}
                  </div>
                  <span className="text-lg font-semibold text-slate-700">{grant.relevance_score}/5</span>
                </div>
              </div>
            )}

            {/* Pipeline status */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Pipeline Status</h2>
              {inPipeline ? (
                <div className="space-y-2">
                  {applications.map((app) => (
                    <Link key={app.id} href={`/pipeline/${app.id}`} className="block p-3 rounded-xl transition-colors hover:bg-white/40" style={{ background: 'rgba(0,0,0,0.02)' }}>
                      <span className={cn('badge text-[10px]', STAGE_COLORS[app.stage] || 'bg-slate-100 text-slate-500')}>
                        {app.stage}
                      </span>
                      {app.target_amount && (
                        <p className="text-xs text-slate-500 mt-1.5">Target: {formatCurrency(app.target_amount)}</p>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-xs text-slate-400 mb-2">Not in pipeline</p>
                  <button onClick={handleAddToPipeline} className="btn-secondary text-xs">Add to Pipeline</button>
                </div>
              )}
            </div>

            {/* Links */}
            {(grant.official_url || grant.documentation_url) && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Links</h2>
                <div className="space-y-2">
                  {grant.official_url && (
                    <a href={grant.official_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      Official page
                    </a>
                  )}
                  {grant.documentation_url && (
                    <a href={grant.documentation_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      Documentation
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode | string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <div className="text-sm text-slate-700">{value || <span className="text-slate-300">N/A</span>}</div>
    </div>
  )
}

function ReqFlag({ label, met }: { label: string; met: boolean | null }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className={cn(
        'w-5 h-5 rounded-md flex items-center justify-center text-white',
        met === true ? 'bg-blue-500' : met === false ? 'bg-slate-200' : 'bg-slate-100'
      )}>
        {met === true && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
        {met === false && (
          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <span className="text-sm text-slate-600">{label}</span>
      {met === null && <span className="text-[10px] text-slate-300">Unknown</span>}
    </div>
  )
}
