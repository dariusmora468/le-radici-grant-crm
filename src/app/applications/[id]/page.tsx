'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, SECTION_LABELS, APPLICATION_STATUSES, APPLICATION_STATUS_COLORS } from '@/lib/supabase'
import type { Application, ApplicationSection, ApplicationDocument, ApplicationQuestion, SectionType } from '@/lib/supabase'
import { cn, formatCurrency } from '@/lib/utils'

type FullApplication = Application & {
  grant_application: {
    id: string
    grant: {
      id: string
      name: string
      name_it: string | null
      funding_source: string
      max_amount: number | null
      description: string | null
      eligibility_summary: string | null
      application_window_closes: string | null
    } | null
    consultant: {
      name: string
      organization: string | null
      email: string | null
    } | null
    target_amount: number | null
  }
}

const SECTION_ORDER: SectionType[] = ['proposal', 'budget', 'documents', 'review']

const SECTION_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  onboarding: 'Gathering Info',
  drafting: 'Drafting',
  reviewing: 'Reviewing',
  complete: 'Complete',
}

export default function ApplicationWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const [app, setApp] = useState<FullApplication | null>(null)
  const [sections, setSections] = useState<ApplicationSection[]>([])
  const [documents, setDocuments] = useState<ApplicationDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<SectionType>('proposal')

  // Proposal onboarding state
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const id = params.id as string
    const [appRes, sectionsRes, docsRes] = await Promise.all([
      supabase.from('applications')
        .select('*, grant_application:grant_applications(id, target_amount, consultant:consultants(name, organization, email), grant:grants(id, name, name_it, funding_source, max_amount, description, eligibility_summary, application_window_closes))')
        .eq('id', id)
        .single(),
      supabase.from('application_sections')
        .select('*')
        .eq('application_id', id)
        .order('section_type'),
      supabase.from('application_documents')
        .select('*')
        .eq('application_id', id)
        .order('order_index'),
    ])

    if (appRes.data) setApp(appRes.data as unknown as FullApplication)
    if (sectionsRes.data) setSections(sectionsRes.data)
    if (docsRes.data) setDocuments(docsRes.data)
    setLoading(false)
  }, [params.id])

  useEffect(() => { fetchData() }, [fetchData])

  // Load questions when switching to a section
  useEffect(() => {
    const section = sections.find(s => s.section_type === activeSection)
    if (section) {
      loadQuestions(section.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, sections])

  async function loadQuestions(sectionId: string) {
    const { data } = await supabase
      .from('application_questions')
      .select('*')
      .eq('section_id', sectionId)
      .order('batch_number')
      .order('order_index')
    if (data) setQuestions(data)
  }

  async function generateQuestions() {
    const section = sections.find(s => s.section_type === activeSection)
    if (!section || !app?.grant_application?.grant) return

    setQuestionsLoading(true)

    try {
      const res = await fetch('/api/application-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: activeSection,
          section_id: section.id,
          grant: app.grant_application.grant,
          existing_answers: questions.filter(q => q.is_answered).map(q => ({ question: q.question, answer: q.answer })),
        }),
      })

      let data
      try {
        const text = await res.text()
        data = JSON.parse(text)
      } catch {
        throw new Error('Failed to parse AI response')
      }

      if (data.error) throw new Error(data.error)

      // Update section status to onboarding if it was not_started
      if (section.status === 'not_started') {
        await supabase.from('application_sections').update({
          status: 'onboarding',
          updated_at: new Date().toISOString(),
        }).eq('id', section.id)
      }

      // Reload questions
      await loadQuestions(section.id)
      fetchData()
    } catch (err: any) {
      console.error('Failed to generate questions:', err)
    }

    setQuestionsLoading(false)
  }

  async function saveAnswer(questionId: string, answer: string) {
    setSaving(true)
    await supabase.from('application_questions').update({
      answer,
      is_answered: answer.trim().length > 0,
    }).eq('id', questionId)

    // Update local state
    setQuestions(prev => prev.map(q =>
      q.id === questionId ? { ...q, answer, is_answered: answer.trim().length > 0 } : q
    ))

    // Recalculate section progress
    const section = sections.find(s => s.section_type === activeSection)
    if (section) {
      const total = questions.length
      const answered = questions.filter(q => q.id === questionId ? answer.trim().length > 0 : q.is_answered).length
      const progress = total > 0 ? Math.round((answered / total) * 100) : 0
      await supabase.from('application_sections').update({
        progress,
        updated_at: new Date().toISOString(),
      }).eq('id', section.id)

      // Update overall progress
      const allSections = sections.map(s =>
        s.id === section.id ? { ...s, progress } : s
      )
      const overallProgress = Math.round(allSections.reduce((sum, s) => sum + s.progress, 0) / allSections.length)
      await supabase.from('applications').update({
        overall_progress: overallProgress,
        status: overallProgress > 0 ? 'in_progress' : 'not_started',
        updated_at: new Date().toISOString(),
      }).eq('id', app?.id)
    }

    setSaving(false)
  }

  async function generateDraft() {
    const section = sections.find(s => s.section_type === activeSection)
    if (!section || !app?.grant_application?.grant) return

    setQuestionsLoading(true)

    try {
      const res = await fetch('/api/application-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: activeSection,
          section_id: section.id,
          grant: app.grant_application.grant,
          answers: questions.filter(q => q.is_answered).map(q => ({ question: q.question, answer: q.answer })),
        }),
      })

      let data
      try {
        const text = await res.text()
        data = JSON.parse(text)
      } catch {
        throw new Error('Failed to parse AI response')
      }

      if (data.error) throw new Error(data.error)

      // Save draft to section
      await supabase.from('application_sections').update({
        ai_draft: data.draft,
        status: 'drafting',
        updated_at: new Date().toISOString(),
      }).eq('id', section.id)

      fetchData()
    } catch (err: any) {
      console.error('Failed to generate draft:', err)
    }

    setQuestionsLoading(false)
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

  if (!app) {
    return (
      <AppShell>
        <div className="card p-16 text-center">
          <p className="text-sm text-slate-500">Application not found</p>
          <Link href="/applications" className="btn-primary mt-4 inline-flex">Back to Applications</Link>
        </div>
      </AppShell>
    )
  }

  const grant = app.grant_application?.grant
  const currentSection = sections.find(s => s.section_type === activeSection)
  const answeredCount = questions.filter(q => q.is_answered).length
  const totalQuestions = questions.length
  const canGenerateDraft = answeredCount >= 3 && activeSection === 'proposal'

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-4">
          <Link href="/applications" className="text-slate-400 hover:text-slate-600 transition-colors">Applications</Link>
          <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-slate-700 font-medium truncate max-w-sm">{grant?.name || 'Application'}</span>
        </div>

        {/* Header */}
        <div className="card p-6 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{grant?.name || 'Grant Application'}</h1>
              <div className="flex items-center gap-3 mt-1">
                {grant?.funding_source && <span className="badge bg-blue-50 text-blue-600 text-[10px]">{grant.funding_source}</span>}
                <span className={cn('badge text-[10px]', APPLICATION_STATUS_COLORS[app.status])}>
                  {APPLICATION_STATUSES[app.status]}
                </span>
                {app.grant_application?.consultant && (
                  <span className="text-xs text-slate-400">
                    Consultant: {app.grant_application.consultant.name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Overall progress */}
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-800">{app.overall_progress}%</p>
                <p className="text-[10px] text-slate-400">complete</p>
              </div>
              <div className="w-16 h-16 relative">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="2" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke={app.overall_progress >= 75 ? '#10b981' : app.overall_progress >= 40 ? '#3b82f6' : '#94a3b8'}
                    strokeWidth="2"
                    strokeDasharray={`${app.overall_progress * 0.974} 100`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 mb-4">
          {SECTION_ORDER.map((type) => {
            const info = SECTION_LABELS[type]
            const section = sections.find(s => s.section_type === type)
            const isActive = activeSection === type
            const progress = section?.progress || 0

            return (
              <button
                key={type}
                onClick={() => setActiveSection(type)}
                className={cn(
                  'flex-1 p-4 rounded-2xl text-left transition-all duration-200',
                  isActive
                    ? 'ring-2 ring-blue-400 ring-offset-1'
                    : 'hover:shadow-md'
                )}
                style={{
                  background: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-lg">{info.icon}</span>
                  <span className="text-[10px] font-medium text-slate-400">
                    {section ? SECTION_STATUS_LABELS[section.status] : 'Not Started'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800 mb-1">{info.title}</p>
                <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all',
                      progress >= 75 ? 'bg-emerald-400' : progress >= 40 ? 'bg-blue-400' : progress > 0 ? 'bg-slate-300' : ''
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </button>
            )
          })}
        </div>

        {/* Active section content */}
        <div className="card p-6">
          {activeSection === 'proposal' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Proposal Builder</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Answer guided questions to build your grant narrative</p>
                </div>
                {totalQuestions > 0 && (
                  <span className="text-xs text-slate-400">{answeredCount} of {totalQuestions} answered</span>
                )}
              </div>

              {/* No questions yet: start onboarding */}
              {totalQuestions === 0 && !questionsLoading && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center border border-blue-100">
                    <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Let's Build Your Proposal</h3>
                  <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                    AI will ask you targeted questions based on this specific grant's requirements. Your answers become the foundation of a compelling proposal.
                  </p>
                  <button onClick={generateQuestions} className="btn-primary inline-flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Start Guided Questions
                  </button>
                </div>
              )}

              {/* Loading questions */}
              {questionsLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-500">AI is preparing your next questions...</p>
                  </div>
                </div>
              )}

              {/* Questions list */}
              {totalQuestions > 0 && !questionsLoading && (
                <div className="space-y-4">
                  {/* Progress bar */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all',
                          answeredCount === totalQuestions ? 'bg-emerald-400' : 'bg-blue-400'
                        )}
                        style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">
                      {answeredCount}/{totalQuestions}
                    </span>
                  </div>

                  {questions.map((q, i) => (
                    <div key={q.id} className="p-4 rounded-xl border border-slate-100" style={{ background: 'rgba(0,0,0,0.01)' }}>
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
                          q.is_answered ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                        )}>
                          {q.is_answered ? '✓' : i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-700 mb-1">{q.question}</p>
                          {q.guidance && (
                            <p className="text-xs text-slate-400 mb-2 italic">{q.guidance}</p>
                          )}
                          <textarea
                            defaultValue={q.answer || ''}
                            onBlur={(e) => saveAnswer(q.id, e.target.value)}
                            rows={3}
                            className="input-field resize-none text-sm"
                            placeholder="Type your answer here..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button
                      onClick={generateQuestions}
                      disabled={questionsLoading}
                      className="btn-secondary text-sm inline-flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      More Questions
                    </button>

                    {canGenerateDraft && (
                      <button
                        onClick={generateDraft}
                        disabled={questionsLoading}
                        className="btn-primary text-sm inline-flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        Generate Draft Proposal
                      </button>
                    )}
                  </div>

                  {/* AI Draft */}
                  {currentSection?.ai_draft && (
                    <div className="mt-6 p-6 rounded-xl border border-violet-100" style={{ background: 'rgba(139,92,246,0.03)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        <h3 className="text-sm font-semibold text-violet-700">AI-Generated Draft</h3>
                      </div>
                      <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                        {currentSection.ai_draft}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeSection === 'budget' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Budget Planner</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Structure your financial plan and cost breakdown</p>
                </div>
              </div>
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center border border-amber-100">
                  <span className="text-2xl">💰</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Budget Planner</h3>
                <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
                  Structure your costs, co-financing, and budget categories. We recommend completing the Proposal section first.
                </p>
                <button onClick={() => { setActiveSection('proposal') }} className="btn-secondary text-sm">
                  Start with Proposal First
                </button>
              </div>
            </div>
          )}

          {activeSection === 'documents' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Document Vault</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Track all required documentation for this grant</p>
                </div>
                {documents.length > 0 && (
                  <span className="text-xs text-slate-400">
                    {documents.filter(d => d.status === 'ready').length}/{documents.length} ready
                  </span>
                )}
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center border border-blue-100">
                    <span className="text-2xl">📁</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">No Documents Tracked Yet</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Run the AI Strategy analysis on your pipeline grant first. When you start an application, required documents will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <details key={doc.id} className="group rounded-xl border border-slate-100 overflow-hidden">
                      <summary className="flex items-center gap-3 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className={cn(
                          'w-2.5 h-2.5 rounded-full shrink-0',
                          doc.status === 'ready' ? 'bg-emerald-400' :
                          doc.status === 'in_progress' ? 'bg-amber-400' : 'bg-slate-200'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700">{doc.document_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {doc.effort && (
                              <span className={cn('text-[10px] font-medium',
                                doc.effort === 'Low' ? 'text-emerald-500' :
                                doc.effort === 'Medium' ? 'text-amber-500' : 'text-rose-500'
                              )}>{doc.effort} effort</span>
                            )}
                            {doc.ai_can_help && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">AI can help</span>
                            )}
                          </div>
                        </div>
                        <select
                          value={doc.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            await supabase.from('application_documents').update({
                              status: e.target.value,
                              updated_at: new Date().toISOString(),
                            }).eq('id', doc.id)
                            fetchData()
                          }}
                          className="select-field text-xs w-28"
                        >
                          <option value="not_started">Not Started</option>
                          <option value="in_progress">In Progress</option>
                          <option value="ready">Ready</option>
                        </select>
                        <svg className="w-4 h-4 text-slate-300 transition-transform group-open:rotate-180 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </summary>
                      <div className="px-4 pb-4 pt-1 ml-5.5 border-t border-slate-50">
                        {doc.description && (
                          <p className="text-xs text-slate-500 mb-2">{doc.description}</p>
                        )}
                        {doc.notes && (
                          <div className="mb-2">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">How to Prepare</p>
                            <p className="text-xs text-slate-600">{doc.notes}</p>
                          </div>
                        )}
                        {doc.ai_can_help && (
                          <div className="p-2 rounded-lg bg-violet-50/50 border border-violet-100">
                            <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-0.5">AI Assistance</p>
                            <p className="text-xs text-violet-700">{doc.ai_can_help}</p>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}

                  {/* Summary bar */}
                  <div className="flex items-center gap-4 pt-3 mt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-[10px] text-slate-500">{documents.filter(d => d.status === 'ready').length} ready</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-[10px] text-slate-500">{documents.filter(d => d.status === 'in_progress').length} in progress</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-200" />
                      <span className="text-[10px] text-slate-500">{documents.filter(d => d.status === 'not_started').length} not started</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'review' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Review & Export</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Review your application and export as PDF</p>
                </div>
              </div>
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center border border-emerald-100">
                  <span className="text-2xl">✅</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Review & Export</h3>
                <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
                  Complete your Proposal and Budget sections first. Then you can review everything and export a PDF to share with your consultant.
                </p>

                {/* Section completion summary */}
                <div className="max-w-xs mx-auto mt-6 space-y-2">
                  {SECTION_ORDER.filter(t => t !== 'review').map((type) => {
                    const info = SECTION_LABELS[type]
                    const section = sections.find(s => s.section_type === type)
                    const progress = section?.progress || 0
                    return (
                      <div key={type} className="flex items-center gap-3 text-left">
                        <span className="text-sm">{info.icon}</span>
                        <span className="text-xs text-slate-600 flex-1">{info.title}</span>
                        <span className={cn('text-xs font-medium',
                          progress >= 75 ? 'text-emerald-600' : progress > 0 ? 'text-blue-600' : 'text-slate-400'
                        )}>{progress}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {saving && (
          <div className="fixed bottom-4 right-4 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs z-50">
            Saving...
          </div>
        )}
      </div>
    </AppShell>
  )
}
