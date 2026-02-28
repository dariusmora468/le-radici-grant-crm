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
  const [deleting, setDeleting] = useState(false)

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

  async function handleDelete() {
    if (!grant) return
    if (!confirm('Are you sure you want to delete this grant? This cannot be undone.')) return
    setDeleting(true)
    await supabase.from('grants').delete().eq('id', grant.id)
    router.push('/grants')
  }

  async function handleAddToPipeline() {
    if (!grant) return
    const { data } = await supabase.from('projects').select('id').limit(1).single()
    if (!data) return
    await supabase.from('grant_applications').insert({
      project_id: data.id,
      grant_id: grant.id,
      stage: 'Discovered',
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

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/grants" className="text-slate-400 hover:text-slate-600 transition-colors">Grants</Link>
            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-slate-700 font-medium truncate max-w-xs">{grant.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {applications.length === 0 && (
              <button onClick={handleAddToPipeline} className="btn-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add to Pipeline
              </button>
            )}
            <Link href={`/grants/new?edit=${grant.id}`} className="btn-secondary">Edit</Link>
            <button onClick={handleDelete} disabled={deleting} className="btn-ghost text-rose-500 hover:text-rose-600">
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>

        {/* Header card */}
        <div className="card p-6 mb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-semibold text-slate-900">{grant.name}</h1>
                {grant.category && (
                  <span className="badge bg-blue-50 text-blue-600">{grant.category.name}</span>
                )}
              </div>
              {grant.name_it && (
                <p className="text-sm text-slate-400 italic mb-3">{grant.name_it}</p>
              )}
              {grant.description && (
                <p className="text-sm text-slate-600 leading-relaxed">{grant.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              {(grant.min_amount || grant.max_amount) && (
                <div className="mb-2">
                  <p className="text-xs text-slate-400 mb-0.5">Funding Range</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {grant.min_amount && grant.max_amount
                      ? `${formatCurrency(grant.min_amount)} - ${formatCurrency(grant.max_amount)}`
                      : formatCurrency(grant.max_amount || grant.min_amount)}
                  </p>
                </div>
              )}
              {grant.co_financing_pct !== null && (
                <p className="text-xs text-slate-400">Co-financing: {grant.co_financing_pct}%</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Left column: details */}
          <div className="col-span-2 space-y-4">
            {/* Key info */}
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

          {/* Right column: meta + pipeline status */}
          <div className="space-y-4">
            {/* Pipeline status */}
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Pipeline Status</h2>
              {applications.length > 0 ? (
                <div className="space-y-2">
                  {applications.map((app) => (
                    <Link key={app.id} href={`/pipeline/${app.id}`} className="block">
                      <div className="p-3 rounded-xl transition-all duration-200" style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <span className={cn('badge text-[10px]', STAGE_COLORS[app.stage] || 'bg-slate-100 text-slate-500')}>
                          {app.stage}
                        </span>
                        {app.target_amount && (
                          <p className="text-xs text-slate-500 mt-1.5">Target: {formatCurrency(app.target_amount)}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
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

            {/* Relevance */}
            {grant.relevance_score !== null && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Relevance Score</h2>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={cn('w-3 h-3 rounded-full', i <= (grant.relevance_score || 0) ? 'bg-blue-400' : 'bg-slate-200')} />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-slate-600">{grant.relevance_score}/5</span>
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
        met === true ? 'bg-blue-500' :
        met === false ? 'bg-slate-200' :
        'bg-slate-100'
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
