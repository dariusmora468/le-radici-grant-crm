'use client'

import { useState, useEffect } from 'react'

const STAGES = [
  { pct: 5, msg: 'Connecting to AI engine...', duration: 1500 },
  { pct: 15, msg: 'Reading your project profile...', duration: 2000 },
  { pct: 30, msg: 'Analyzing grant requirements...', duration: 3000 },
  { pct: 50, msg: 'Matching eligibility criteria...', duration: 4000 },
  { pct: 65, msg: 'Evaluating financial fit...', duration: 4000 },
  { pct: 78, msg: 'Building action plan...', duration: 4000 },
  { pct: 88, msg: 'Identifying blockers and documents...', duration: 4000 },
  { pct: 94, msg: 'Finalizing strategy...', duration: 5000 },
]

export default function AIProgressBar({ label }: { label?: string }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    if (stageIndex >= STAGES.length - 1) return
    const timer = setTimeout(() => {
      setStageIndex(prev => Math.min(prev + 1, STAGES.length - 1))
    }, STAGES[stageIndex].duration)
    return () => clearTimeout(timer)
  }, [stageIndex])

  const stage = STAGES[stageIndex]

  return (
    <div className="w-full max-w-md mx-auto py-6">
      {label && (
        <p className="text-sm font-medium text-slate-700 text-center mb-4">{label}</p>
      )}

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${stage.pct}%`,
            background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
          }}
        />
      </div>

      {/* Stage message */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500 transition-all duration-300">{stage.msg}</span>
        </div>
        <span className="text-xs font-medium text-slate-400">{stage.pct}%</span>
      </div>
    </div>
  )
}
