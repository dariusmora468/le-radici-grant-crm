'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase, SECTION_LABELS, APPLICATION_STATUSES, APPLICATION_STATUS_COLORS } from '@/lib/supabase'
import type { Application, ApplicationSection, ApplicationDocument, ApplicationQuestion, SectionType } from '@/lib/supabase'
import { cn, formatCurrency } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'

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

export default function ApplicationWorkspaceWrapper() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    }>
      <ApplicationWorkspacePage />
    </Suspense>
  )
}

function ApplicationWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromPipeline = searchParams.get('from') === 'pipeline'
  const pipelineId = searchParams.get('pipeline_id')
  const [app, setApp] = useState<FullApplication | null>(null)
  const [sections, setSections] = useState<ApplicationSection[]>([])
  const [documents, setDocuments] = useState<ApplicationDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<SectionType>('proposal')

  // Proposal onboarding state
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Review section: consultant matching
  const [matchedConsultants, setMatchedConsultants] = useState<any[]>([])
  const [consultantsLoading, setConsultantsLoading] = useState(false)
  const [expandedConsultant, setExpandedConsultant] = useState<number | null>(null)
  const [aiError, setAiError] = useState('')

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
    setAiError('')

    try {
      const res = await apiFetch('/api/application-questions', {
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
      setAiError(err.message || 'Failed to generate questions. Please try again.')
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
    setAiError('')

    try {
      const res = await apiFetch('/api/application-draft', {
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
      setAiError(err.message || 'Failed to generate draft. Please try again.')
    }

    setQuestionsLoading(false)
  }

  async function findConsultants() {
    if (!app?.grant_application?.grant) return
    setConsultantsLoading(true)
    setMatchedConsultants([])

    try {
      const res = await apiFetch('/api/match-consultants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant: app.grant_application.grant }),
      })

      let data
      try {
        const text = await res.text()
        data = JSON.parse(text)
      } catch {
        throw new Error('Failed to parse response')
      }

      if (data.error) throw new Error(data.error)
      setMatchedConsultants(Array.isArray(data) ? data : data.consultants || [])
    } catch (err: any) {
      console.error('Consultant matching failed:', err)
      setAiError(err.message || 'Failed to find consultants. Please try again.')
    }
    setConsultantsLoading(false)
  }

  async function assignConsultant(consultant: any) {
    if (!app?.grant_application?.id) return
    setSaving(true)

    // Check if consultant already exists in DB
    const { data: existing } = await supabase
      .from('consultants')
      .select('id')
      .eq('name', consultant.name)
      .limit(1)

    let consultantId: string
    if (existing && existing.length > 0) {
      consultantId = existing[0].id
    } else {
      const { data: created } = await supabase.from('consultants').insert({
        name: consultant.name,
        organization: consultant.organization || null,
        email: consultant.email || null,
        phone: consultant.phone || null,
        specialization: consultant.specialization || null,
        region: consultant.region || null,
        website: consultant.website || null,
        notes: consultant.notes || null,
      }).select().single()
      consultantId = created?.id
    }

    if (consultantId) {
      await supabase.from('grant_applications').update({
        consultant_id: consultantId,
        updated_at: new Date().toISOString(),
      }).eq('id', app.grant_application.id)

      await supabase.from('grant_activity_log').insert({
        application_id: app.grant_application.id,
        action: 'Consultant assigned',
        details: `Assigned ${consultant.name} from application review`,
        performed_by: 'User',
      })
    }

    setSaving(false)
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

  if (!app) {
    return (
      <AppShell>
        <div className="card p-16 text-center">
          <p className="text-sm text-slate-500">Application not found</p>
          <Link href="/pipeline" className="btn-primary mt-4 inline-flex">Back to Pipeline</Link>
        </div>
      </AppShell>
    )
  }

  const grant = app.grant_application?.grant
  const currentSection = sections.find(s => s.section_type === activeSection)
  const answeredCount = questions.filter(q => q.is_answered).length
  const totalQuestions = questions.length
  const canGenerateDraft = answeredCount >= 3 && (activeSection === 'proposal' || activeSection === 'budget')

  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-4">
          <Link
            href={fromPipeline && pipelineId ? `/pipeline/${pipelineId}` : '/pipeline'}
            className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {fromPipeline ? 'Back to Pipeline' : 'Pipeline'}
          </Link>
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
          {/* Error banner */}
          {aiError && (
            <div className="mb-4 p-3 rounded-xl border border-rose-200 bg-rose-50/80 flex items-start gap-3">
              <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-rose-700">{aiError}</p>
              </div>
              <button onClick={() => setAiError('')} className="text-rose-400 hover:text-rose-600 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
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
                  <p className="text-sm text-slate-500 mt-0.5">Structure your financial plan through guided questions</p>
                </div>
                {totalQuestions > 0 && (
                  <span className="text-xs text-slate-400">{answeredCount} of {totalQuestions} answered</span>
                )}
              </div>

              {/* Same Q&A pattern as proposal */}
              {totalQuestions === 0 && !questionsLoading && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center border border-amber-100">
                    <span className="text-2xl">💰</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Plan Your Budget</h3>
                  <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                    AI will ask about your project costs, co-financing, and budget categories based on this grant's requirements.
                  </p>
                  <button onClick={generateQuestions} className="btn-primary inline-flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Start Budget Questions
                  </button>
                </div>
              )}

              {questionsLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-500">AI is preparing budget questions...</p>
                  </div>
                </div>
              )}

              {totalQuestions > 0 && !questionsLoading && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all',
                          answeredCount === totalQuestions ? 'bg-emerald-400' : 'bg-amber-400'
                        )}
                        style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{answeredCount}/{totalQuestions}</span>
                  </div>

                  {questions.map((q, i) => (
                    <div key={q.id} className="p-4 rounded-xl border border-slate-100" style={{ background: 'rgba(0,0,0,0.01)' }}>
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
                          q.is_answered ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-50 text-amber-500'
                        )}>
                          {q.is_answered ? '✓' : i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-700 mb-1">{q.question}</p>
                          {q.guidance && <p className="text-xs text-slate-400 mb-2 italic">{q.guidance}</p>}
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

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button onClick={generateQuestions} disabled={questionsLoading} className="btn-secondary text-sm inline-flex items-center gap-2">
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
                        Generate Budget Plan
                      </button>
                    )}
                  </div>

                  {/* AI Budget Draft */}
                  {currentSection?.ai_draft && (
                    <div className="mt-6 p-6 rounded-xl border border-amber-100" style={{ background: 'rgba(245,158,11,0.03)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        <h3 className="text-sm font-semibold text-amber-700">AI-Generated Budget Plan</h3>
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
                  <p className="text-sm text-slate-500 mt-0.5">Review progress, find consultants, and export your application</p>
                </div>
              </div>

              {/* Section completion summary */}
              <div className="mb-6 p-4 rounded-xl border border-slate-100" style={{ background: 'rgba(0,0,0,0.01)' }}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Application Progress</h3>
                <div className="space-y-3">
                  {SECTION_ORDER.filter(t => t !== 'review').map((type) => {
                    const info = SECTION_LABELS[type]
                    const section = sections.find(s => s.section_type === type)
                    const progress = section?.progress || 0
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <span className="text-base w-6 text-center">{info.icon}</span>
                        <span className="text-sm text-slate-600 flex-1">{info.title}</span>
                        <div className="w-32 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all',
                              progress >= 75 ? 'bg-emerald-400' : progress >= 40 ? 'bg-blue-400' : progress > 0 ? 'bg-slate-300' : ''
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className={cn('text-xs font-semibold w-10 text-right',
                          progress >= 75 ? 'text-emerald-600' : progress > 0 ? 'text-blue-600' : 'text-slate-400'
                        )}>{progress}%</span>
                      </div>
                    )
                  })}
                </div>

                {/* Document summary */}
                {documents.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Documents</span>
                      <span className="text-xs font-semibold text-slate-600">
                        {documents.filter(d => d.status === 'ready').length}/{documents.length} ready
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Consultant Matching */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Find Consultants</h3>
                    <p className="text-xs text-slate-500 mt-0.5">AI will find and rank consultants by relevance to this grant</p>
                  </div>
                  <button
                    onClick={findConsultants}
                    disabled={consultantsLoading}
                    className="btn-primary text-sm inline-flex items-center gap-2"
                  >
                    {consultantsLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        {matchedConsultants.length > 0 ? 'Search Again' : 'Find Consultants'}
                      </>
                    )}
                  </button>
                </div>

                {/* Already assigned consultant */}
                {app.grant_application?.consultant && (
                  <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700">Assigned Consultant</span>
                    </div>
                    <p className="text-sm font-medium text-slate-700">{app.grant_application.consultant.name}</p>
                    {app.grant_application.consultant.organization && (
                      <p className="text-xs text-slate-500">{app.grant_application.consultant.organization}</p>
                    )}
                  </div>
                )}

                {/* Matched consultants list */}
                {matchedConsultants.length > 0 && (
                  <div className="space-y-2">
                    {matchedConsultants.map((c, i) => {
                      const isExpanded = expandedConsultant === i
                      const matchScore = c.match_score || 0
                      return (
                        <div key={i} className="rounded-xl border border-slate-100 overflow-hidden transition-all duration-200" style={{ background: 'rgba(255,255,255,0.6)' }}>
                          <button
                            onClick={() => setExpandedConsultant(isExpanded ? null : i)}
                            className="w-full flex items-center gap-3 p-4 text-left"
                          >
                            {/* Match score circle */}
                            <div className="relative w-11 h-11 shrink-0">
                              <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="2.5" />
                                <circle
                                  cx="18" cy="18" r="15" fill="none"
                                  stroke={matchScore >= 70 ? '#10b981' : matchScore >= 40 ? '#3b82f6' : '#94a3b8'}
                                  strokeWidth="2.5"
                                  strokeDasharray={`${matchScore * 0.942} 100`}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                {matchScore}%
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                                {c.is_existing ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold border border-emerald-200">In Database</span>
                                ) : c.is_verified ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold border border-blue-200">Web Verified</span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold border border-amber-200">Unverified</span>
                                )}
                              </div>
                              {c.specialization && (
                                <p className="text-xs text-slate-500 truncate">{c.specialization}</p>
                              )}
                            </div>

                            <svg className={cn('w-4 h-4 text-slate-300 transition-transform shrink-0', isExpanded && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 border-t border-slate-50">
                              <div className="grid grid-cols-2 gap-3 mt-3">
                                {c.specialization && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Focus Area</p>
                                    <p className="text-xs text-slate-700 mt-0.5">{c.specialization}</p>
                                  </div>
                                )}
                                {c.region && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Region</p>
                                    <p className="text-xs text-slate-700 mt-0.5">{c.region}</p>
                                  </div>
                                )}
                                {c.email && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Email</p>
                                    <a href={`mailto:${c.email}`} className="text-xs text-blue-600 hover:text-blue-700 mt-0.5 block">{c.email}</a>
                                  </div>
                                )}
                                {c.phone && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Phone</p>
                                    <a href={`tel:${c.phone}`} className="text-xs text-blue-600 hover:text-blue-700 mt-0.5 block">{c.phone}</a>
                                  </div>
                                )}
                                {c.website && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Website</p>
                                    <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 mt-0.5 block truncate">{c.website}</a>
                                  </div>
                                )}
                                {c.organization && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Organization</p>
                                    <p className="text-xs text-slate-700 mt-0.5">{c.organization}</p>
                                  </div>
                                )}
                              </div>

                              {c.match_reasoning && (
                                <div className="mt-3 p-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
                                  <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-0.5">Why This Match</p>
                                  <p className="text-xs text-blue-800">{c.match_reasoning}</p>
                                </div>
                              )}

                              {/* Verification details */}
                              {c.verification && !c.is_existing && (
                                <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                                  {c.verification.website_verified && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                      Website verified
                                    </span>
                                  )}
                                  {c.verification.email_verified && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                      Email domain verified
                                    </span>
                                  )}
                                  {c.phone && !c.verification.phone_verified && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                                      Phone unverified
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => assignConsultant(c)}
                                  disabled={saving}
                                  className="btn-primary text-xs inline-flex items-center gap-1.5"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                  </svg>
                                  Assign to Application
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {consultantsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-slate-500">Finding consultants who specialize in this type of grant...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Export */}
              <div className="p-4 rounded-xl border border-slate-200" style={{ background: 'rgba(0,0,0,0.01)' }}>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Export Application</h3>
                <p className="text-xs text-slate-500 mb-4">Generate a printable summary of your proposal, budget plan, and document checklist to share with your consultant or submit.</p>
                <button
                  onClick={() => {
                    // Build printable content
                    const proposalSection = sections.find(s => s.section_type === 'proposal')
                    const budgetSection = sections.find(s => s.section_type === 'budget')
                    const printWindow = window.open('', '_blank')
                    if (!printWindow) return

                    printWindow.document.write(`<!DOCTYPE html><html><head>
                      <title>${grant?.name || 'Grant Application'} - Application Package</title>
                      <style>
                        body { font-family: 'Inter', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1e293b; line-height: 1.6; }
                        h1 { font-size: 22px; margin-bottom: 4px; }
                        h2 { font-size: 16px; color: #3b82f6; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 32px; }
                        h3 { font-size: 14px; margin-top: 20px; }
                        .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
                        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
                        .badge-green { background: #ecfdf5; color: #059669; }
                        .badge-amber { background: #fffbeb; color: #d97706; }
                        .badge-slate { background: #f1f5f9; color: #64748b; }
                        .draft { white-space: pre-wrap; font-size: 13px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
                        .doc-list { list-style: none; padding: 0; }
                        .doc-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
                        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
                        .dot-green { background: #10b981; }
                        .dot-amber { background: #f59e0b; }
                        .dot-slate { background: #cbd5e1; }
                        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
                        @media print { body { padding: 20px; } }
                      </style>
                    </head><body>
                      <h1>${grant?.name || 'Grant Application'}</h1>
                      <div class="meta">
                        ${grant?.funding_source ? `<span class="badge badge-green">${grant.funding_source}</span> ` : ''}
                        ${grant?.max_amount ? `Up to €${Number(grant.max_amount).toLocaleString()}` : ''}
                        <br/>Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} via GrantFlow
                      </div>

                      ${proposalSection?.ai_draft ? `
                        <h2>Proposal Narrative</h2>
                        <div class="draft">${proposalSection.ai_draft}</div>
                      ` : '<h2>Proposal Narrative</h2><p style="color:#94a3b8;font-size:13px;">Not yet generated. Complete the Proposal Builder questions first.</p>'}

                      ${budgetSection?.ai_draft ? `
                        <h2>Budget Plan</h2>
                        <div class="draft">${budgetSection.ai_draft}</div>
                      ` : '<h2>Budget Plan</h2><p style="color:#94a3b8;font-size:13px;">Not yet generated. Complete the Budget Planner questions first.</p>'}

                      <h2>Document Checklist</h2>
                      ${documents.length > 0 ? `
                        <ul class="doc-list">
                          ${documents.map(d => `
                            <li class="doc-item">
                              <span class="dot ${d.status === 'ready' ? 'dot-green' : d.status === 'in_progress' ? 'dot-amber' : 'dot-slate'}"></span>
                              <span style="flex:1">${d.document_name}</span>
                              <span class="badge ${d.status === 'ready' ? 'badge-green' : d.status === 'in_progress' ? 'badge-amber' : 'badge-slate'}">${d.status === 'ready' ? 'Ready' : d.status === 'in_progress' ? 'In Progress' : 'Not Started'}</span>
                            </li>
                          `).join('')}
                        </ul>
                        <p style="font-size:12px;color:#64748b;margin-top:8px;">
                          ${documents.filter(d => d.status === 'ready').length} of ${documents.length} documents ready
                        </p>
                      ` : '<p style="color:#94a3b8;font-size:13px;">No documents tracked yet.</p>'}

                      <div class="footer">
                        Application progress: ${app.overall_progress}% complete
                        ${app.grant_application?.consultant ? ` | Consultant: ${app.grant_application.consultant.name}` : ''}
                      </div>
                    </body></html>`)

                    printWindow.document.close()
                    setTimeout(() => printWindow.print(), 500)
                  }}
                  className="btn-primary text-sm inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                  </svg>
                  Print / Save as PDF
                </button>
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
