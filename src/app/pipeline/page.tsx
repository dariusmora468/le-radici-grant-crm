'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, PIPELINE_STAGES, STAGE_COLORS } from '@/lib/supabase'
import type { GrantApplication, Grant } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'

const ACTIVE_STAGES = [
  'Discovered',
  'Researching',
  'Serious Consideration',
  'Preparing Application',
  'Submitted',
  'Under Review',
] as const

const CLOSED_STAGES = ['Awarded', 'Rejected', 'Follow-up', 'Archived'] as const

type AppWithGrant = GrantApplication & { grant: Grant | null }

export default function PipelinePage() {
  const [applications, setApplications] = useState<AppWithGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [showClosed, setShowClosed] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('grant_applications')
      .select('*, grant:grants(*, category:grant_categories(*))')
      .order('updated_at', { ascending: false })
    if (data) setApplications(data as AppWithGrant[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function moveToStage(appId: string, newStage: string) {
    await supabase.from('grant_applications').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', appId)
    // Log activity
    await supabase.from('grant_activity_log').insert({
      application_id: appId,
      action: 'Stage changed',
      details: `Moved to ${newStage}`,
      performed_by: 'User',
    })
    fetchData()
  }

  const stages = showClosed ? [...ACTIVE_STAGES, ...CLOSED_STAGES] : ACTIVE_STAGES
  const appsByStage = (stage: string) => applications.filter((a) => a.stage === stage)

  const totalActive = ACTIVE_STAGES.reduce((sum, s) => sum + appsByStage(s).length, 0)
  const totalClosed = CLOSED_STAGES.reduce((sum, s) => sum + appsByStage(s).length, 0)

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Pipeline</h1>
            <p className="page-subtitle">
              {totalActive} active application{totalActive !== 1 ? 's' : ''}
              {totalClosed > 0 && `, ${totalClosed} closed`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowClosed(!showClosed)}
              className={cn('btn-ghost text-xs', showClosed && 'bg-white/50')}
            >
              {showClosed ? 'Hide closed' : `Show closed (${totalClosed})`}
            </button>
            <Link href="/grants" className="btn-secondary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75" />
              </svg>
              Browse Grants
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : applications.length === 0 ? (
          <div className="card p-16 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
              style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.1)' }}
            >
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No applications in pipeline</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Add grants to the pipeline from the Grants page</p>
            <Link href="/grants" className="btn-primary inline-flex">Browse Grants</Link>
          </div>
        ) : (
          /* Kanban board */
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
            {stages.map((stage) => {
              const cards = appsByStage(stage)
              const isClosed = (CLOSED_STAGES as readonly string[]).includes(stage)
              return (
                <div key={stage} className="flex-shrink-0" style={{ width: '280px' }}>
                  {/* Column header */}
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className={cn('badge text-[10px]', STAGE_COLORS[stage] || 'bg-slate-100 text-slate-500')}>
                      {stage}
                    </span>
                    <span className="text-xs text-slate-400">{cards.length}</span>
                  </div>

                  {/* Column body */}
                  <div
                    className="rounded-2xl p-2 space-y-2 min-h-[200px]"
                    style={{
                      background: isClosed ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    {cards.map((app) => (
                      <PipelineCard
                        key={app.id}
                        app={app}
                        stages={PIPELINE_STAGES}
                        currentStage={stage}
                        onMove={moveToStage}
                      />
                    ))}
                    {cards.length === 0 && (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-[11px] text-slate-300">No applications</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function PipelineCard({
  app,
  stages,
  currentStage,
  onMove,
}: {
  app: AppWithGrant
  stages: readonly string[]
  currentStage: string
  onMove: (id: string, stage: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const currentIndex = stages.indexOf(currentStage as any)

  return (
    <div className="relative">
      <Link href={`/pipeline/${app.id}`}>
        <div
          className="p-3.5 rounded-xl transition-all duration-200 cursor-pointer"
          style={{
            background: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
            ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
          }}
        >
          <p className="text-sm font-medium text-slate-800 mb-1.5 line-clamp-2">
            {app.grant?.name || 'Unnamed Grant'}
          </p>
          {app.grant?.category && (
            <span className="badge bg-blue-50 text-blue-600 text-[10px] mb-2">{app.grant.category.name}</span>
          )}
          <div className="flex items-center justify-between mt-2">
            {app.target_amount ? (
              <span className="text-xs font-medium text-slate-600">{formatCurrency(app.target_amount)}</span>
            ) : (
              <span className="text-xs text-slate-300">No target</span>
            )}
            {app.priority && (
              <span className={cn(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                app.priority === 'Critical' ? 'bg-rose-50 text-rose-600' :
                app.priority === 'High' ? 'bg-amber-50 text-amber-600' :
                app.priority === 'Medium' ? 'bg-blue-50 text-blue-500' :
                'bg-slate-50 text-slate-400'
              )}>
                {app.priority}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Move button */}
      <div className="absolute top-2 right-2">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu) }}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-white/60 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
          </svg>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div
              className="absolute right-0 top-8 z-50 w-48 py-1.5 rounded-xl overflow-hidden"
              style={{
                background: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.5)',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
              }}
            >
              <p className="px-3 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Move to</p>
              {stages.filter((s) => s !== currentStage).map((stage) => (
                <button
                  key={stage}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove(app.id, stage); setShowMenu(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', STAGE_COLORS[stage]?.split(' ')[0] || 'bg-slate-200')} />
                  {stage}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
