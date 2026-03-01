'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('grant_applications')
      .select('*, grant:grants(*, category:grant_categories(*))')
      .order('position', { ascending: true })
    if (data) setApplications(data as AppWithGrant[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function getCardsForStage(stage: string): AppWithGrant[] {
    return applications
      .filter(a => a.stage === stage)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
  }

  function calcNewPosition(cards: AppWithGrant[], targetIndex: number): number {
    if (cards.length === 0) return 1000
    if (targetIndex === 0) return (cards[0]?.position || 1000) - 1000
    if (targetIndex >= cards.length) return (cards[cards.length - 1]?.position || 0) + 1000
    const before = cards[targetIndex - 1]?.position || 0
    const after = cards[targetIndex]?.position || before + 2000
    return Math.round((before + after) / 2)
  }

  async function moveCard(appId: string, targetStage: string, targetIndex: number) {
    const targetCards = getCardsForStage(targetStage).filter(c => c.id !== appId)
    const newPosition = calcNewPosition(targetCards, targetIndex)
    const app = applications.find(a => a.id === appId)
    const stageChanged = app?.stage !== targetStage

    // Optimistic update
    setApplications(prev => prev.map(a =>
      a.id === appId ? { ...a, stage: targetStage, position: newPosition, updated_at: new Date().toISOString() } : a
    ))

    await supabase.from('grant_applications').update({
      stage: targetStage,
      position: newPosition,
      updated_at: new Date().toISOString(),
    }).eq('id', appId)

    if (stageChanged) {
      await supabase.from('grant_activity_log').insert({
        application_id: appId,
        action: 'Stage changed',
        details: `Moved to ${targetStage}`,
        performed_by: 'User',
      })
    }
  }

  function handleDragStart(e: React.DragEvent, appId: string) {
    setDraggedId(appId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', appId)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4'
    }
  }

  function handleDragEnd(e: React.DragEvent) {
    setDraggedId(null)
    setDragOverStage(null)
    setDropIndex(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }

  function handleColumnDragOver(e: React.DragEvent, stage: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }

  function handleColumnDragLeave(e: React.DragEvent) {
    const related = e.relatedTarget as HTMLElement | null
    const current = e.currentTarget as HTMLElement
    if (!related || !current.contains(related)) {
      setDragOverStage(null)
      setDropIndex(null)
    }
  }

  function handleColumnDrop(e: React.DragEvent, stage: string) {
    e.preventDefault()
    const appId = e.dataTransfer.getData('text/plain')
    if (!appId) return

    const cards = getCardsForStage(stage).filter(c => c.id !== appId)
    const idx = dropIndex !== null ? dropIndex : cards.length
    moveCard(appId, stage, idx)

    setDraggedId(null)
    setDragOverStage(null)
    setDropIndex(null)
  }

  function handleCardDragOver(e: React.DragEvent, stage: string, cardIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    setDropIndex(e.clientY < midY ? cardIndex : cardIndex + 1)
  }

  const stages = showClosed ? [...ACTIVE_STAGES, ...CLOSED_STAGES] : ACTIVE_STAGES
  const totalActive = ACTIVE_STAGES.reduce((sum, s) => sum + getCardsForStage(s).length, 0)
  const totalClosed = CLOSED_STAGES.reduce((sum, s) => sum + getCardsForStage(s).length, 0)

  return (
    <AppShell>
      <div className="animate-fade-in">
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
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
              style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No applications in pipeline</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Add grants to the pipeline from the Grants page</p>
            <Link href="/grants" className="btn-primary inline-flex">Browse Grants</Link>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
            {stages.map((stage) => {
              const allCards = getCardsForStage(stage)
              const visibleCards = allCards.filter(c => c.id !== draggedId)
              const isClosed = (CLOSED_STAGES as readonly string[]).includes(stage)
              const isDropTarget = dragOverStage === stage && draggedId !== null

              return (
                <div key={stage} className="flex-shrink-0" style={{ width: '280px' }}>
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className={cn('badge text-[10px]', STAGE_COLORS[stage] || 'bg-slate-100 text-slate-500')}>
                      {stage}
                    </span>
                    <span className="text-xs text-slate-400">{allCards.length}</span>
                  </div>

                  <div
                    className={cn(
                      'rounded-2xl p-2 min-h-[200px] transition-all duration-200',
                      isDropTarget && 'ring-2 ring-blue-300 ring-opacity-60'
                    )}
                    style={{
                      background: isDropTarget
                        ? 'rgba(59, 130, 246, 0.04)'
                        : isClosed ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.3)',
                      border: isDropTarget
                        ? '1px dashed rgba(59, 130, 246, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.2)',
                    }}
                    onDragOver={(e) => handleColumnDragOver(e, stage)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={(e) => handleColumnDrop(e, stage)}
                  >
                    <div className="space-y-0">
                      {visibleCards.map((app, i) => {
                        const showDropBefore = isDropTarget && dropIndex === i

                        return (
                          <div key={app.id}>
                            {showDropBefore && (
                              <div className="h-1 mx-1 my-1 rounded-full bg-blue-400 transition-all duration-150" />
                            )}
                            <div
                              className="py-1"
                              onDragOver={(e) => handleCardDragOver(e, stage, i)}
                            >
                              <PipelineCard
                                app={app}
                                stages={PIPELINE_STAGES}
                                currentStage={stage}
                                onMove={(id, newStage) => {
                                  const targetCards = getCardsForStage(newStage)
                                  moveCard(id, newStage, targetCards.length)
                                }}
                                isDragging={draggedId === app.id}
                                onDragStart={(e) => handleDragStart(e, app.id)}
                                onDragEnd={handleDragEnd}
                              />
                            </div>
                          </div>
                        )
                      })}

                      {isDropTarget && dropIndex !== null && dropIndex >= visibleCards.length && visibleCards.length > 0 && (
                        <div className="h-1 mx-1 my-1 rounded-full bg-blue-400 transition-all duration-150" />
                      )}
                    </div>

                    {visibleCards.length === 0 && !isDropTarget && (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-[11px] text-slate-300">No applications</p>
                      </div>
                    )}
                    {visibleCards.length === 0 && isDropTarget && (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-[11px] text-blue-400 font-medium">Drop here</p>
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
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  app: AppWithGrant
  stages: readonly string[]
  currentStage: string
  onMove: (id: string, stage: string) => void
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const wasDragged = useRef(false)
  const router = useRouter()

  function handleCardDragStart(e: React.DragEvent) {
    wasDragged.current = false
    onDragStart(e)
    setTimeout(() => { wasDragged.current = true }, 100)
  }

  function handleCardDragEnd(e: React.DragEvent) {
    onDragEnd(e)
    setTimeout(() => { wasDragged.current = false }, 50)
  }

  function handleCardClick(e: React.MouseEvent) {
    if (wasDragged.current) { e.preventDefault(); return }
    if ((e.target as HTMLElement).closest('button')) return
    router.push(`/pipeline/${app.id}`)
  }

  const cardStyle = {
    background: 'rgba(255, 255, 255, 0.72)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
  }

  return (
    <div
      className={cn('relative group', isDragging && 'opacity-40')}
      draggable
      onDragStart={handleCardDragStart}
      onDragEnd={handleCardDragEnd}
    >
      <div
        onClick={handleCardClick}
        className="p-3.5 rounded-xl transition-all duration-200 cursor-grab active:cursor-grabbing"
        style={cardStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        }}
      >
        {/* Drag handle dots */}
        <div className="absolute top-2.5 left-1 grid grid-cols-2 gap-[2px] opacity-0 group-hover:opacity-30 transition-opacity">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-[3px] h-[3px] rounded-full bg-slate-500" />
          ))}
        </div>

        <p className="text-sm font-medium text-slate-800 mb-1.5 line-clamp-2 pl-3">
          {app.grant?.name || 'Unnamed Grant'}
        </p>
        {app.grant?.category && (
          <span className="badge bg-blue-50 text-blue-600 text-[10px] mb-2 ml-3">{(app.grant.category as any).name}</span>
        )}
        <div className="flex items-center justify-between mt-2 pl-3">
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

      <div className="absolute top-2 right-2">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu) }}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-white/60 transition-all opacity-0 group-hover:opacity-100"
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
