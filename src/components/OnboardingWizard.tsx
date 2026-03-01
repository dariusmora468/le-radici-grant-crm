'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface OnboardingProps {
  projectName: string
  profileComplete: boolean
  grantCount: number
  pipelineCount: number
  onDismiss: () => void
}

const STEPS = [
  {
    number: 1,
    title: 'Set Up Your Profile',
    description: 'Tell us about your project, entity, location, and team so we can find the best grants for you.',
    href: '/project',
    cta: 'Complete Profile',
    icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    checkField: 'profile',
  },
  {
    number: 2,
    title: 'Discover Grants',
    description: 'AI will search EU, national, and regional databases to find funding that matches your project.',
    href: '/grants',
    cta: 'Find Grants',
    icon: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
    checkField: 'grants',
  },
  {
    number: 3,
    title: 'Build Your Pipeline',
    description: 'Add the most promising grants to your pipeline and prioritize which to apply for first.',
    href: '/pipeline',
    cta: 'View Pipeline',
    icon: 'M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z',
    checkField: 'pipeline',
  },
  {
    number: 4,
    title: 'Start Applying',
    description: 'Use AI to generate application narratives, budget plans, and document checklists for each grant.',
    href: '/grants',
    cta: 'Start an Application',
    icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
    checkField: 'apply',
  },
]

export default function OnboardingWizard({ projectName, profileComplete, grantCount, pipelineCount, onDismiss }: OnboardingProps) {
  function isStepComplete(checkField: string): boolean {
    if (checkField === 'profile') return profileComplete
    if (checkField === 'grants') return grantCount > 0
    if (checkField === 'pipeline') return pipelineCount > 0
    return false
  }

  function getCurrentStep(): number {
    if (!profileComplete) return 0
    if (grantCount === 0) return 1
    if (pipelineCount === 0) return 2
    return 3
  }

  const currentStep = getCurrentStep()
  const completedSteps = STEPS.filter(s => isStepComplete(s.checkField)).length

  return (
    <div className="max-w-3xl mx-auto">
      {/* Welcome header */}
      <div className="text-center mb-10">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(124,58,237,0.12) 100%)',
            border: '1px solid rgba(59,130,246,0.15)',
          }}
        >
          <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
          Welcome to GrantFlow
        </h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Let's find funding for {projectName || 'your project'}. Follow these four steps to discover grants, build your pipeline, and start applying.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500">{completedSteps} of 4 steps complete</span>
          {completedSteps >= 3 && (
            <button onClick={onDismiss} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Go to Dashboard →
            </button>
          )}
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(completedSteps / 4) * 100}%`,
              background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
            }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const complete = isStepComplete(step.checkField)
          const isCurrent = i === currentStep
          const isLocked = i > currentStep && !complete

          return (
            <div
              key={step.number}
              className={cn(
                'rounded-2xl p-5 transition-all duration-300',
                isCurrent && 'ring-2 ring-blue-300 ring-opacity-60',
              )}
              style={{
                background: complete
                  ? 'rgba(16, 185, 129, 0.04)'
                  : isCurrent
                    ? 'rgba(255, 255, 255, 0.8)'
                    : 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: complete
                  ? '1px solid rgba(16, 185, 129, 0.2)'
                  : '1px solid rgba(255, 255, 255, 0.4)',
                boxShadow: isCurrent
                  ? '0 4px 16px rgba(0, 0, 0, 0.06)'
                  : '0 2px 8px rgba(0, 0, 0, 0.03)',
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              <div className="flex items-start gap-4">
                {/* Step number / check */}
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold',
                  complete
                    ? 'bg-emerald-100 text-emerald-600'
                    : isCurrent
                      ? 'text-white'
                      : 'bg-slate-100 text-slate-400'
                )}
                  style={!complete && isCurrent ? {
                    background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
                  } : undefined}
                >
                  {complete ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={cn(
                      'text-sm font-semibold',
                      complete ? 'text-emerald-700' : 'text-slate-800'
                    )}>
                      {step.title}
                    </h3>
                    {complete && (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Done</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{step.description}</p>
                </div>

                {/* CTA */}
                <div className="shrink-0">
                  {complete ? (
                    <Link href={step.href} className="btn-ghost text-xs text-emerald-600">
                      Review
                    </Link>
                  ) : isCurrent ? (
                    <Link
                      href={step.href}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}
                    >
                      {step.cta}
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-300 font-medium">Locked</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Skip link */}
      <div className="text-center mt-6">
        <button onClick={onDismiss} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          Skip setup and go to dashboard
        </button>
      </div>
    </div>
  )
}
