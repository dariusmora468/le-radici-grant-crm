'use client'

import { VERIFICATION_STATUS_CONFIG } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface VerificationBadgeProps {
  status: string | null
  confidence: number | null
  lastVerifiedAt: string | null
  size?: 'sm' | 'md' | 'lg'
  showConfidence?: boolean
  showAge?: boolean
}

function getVerificationAge(lastVerifiedAt: string | null): string | null {
  if (!lastVerifiedAt) return null
  const diff = Date.now() - new Date(lastVerifiedAt).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function VerificationBadge({
  status,
  confidence,
  lastVerifiedAt,
  size = 'sm',
  showConfidence = false,
  showAge = false,
}: VerificationBadgeProps) {
  const config = VERIFICATION_STATUS_CONFIG[status || 'unverified'] || VERIFICATION_STATUS_CONFIG.unverified
  const age = getVerificationAge(lastVerifiedAt)

  if (size === 'lg') {
    return (
      <div className={cn('rounded-xl p-4 border', config.bgColor)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{config.icon}</span>
            <span className={cn('text-sm font-semibold', config.color)}>{config.label}</span>
          </div>
          {confidence !== null && confidence > 0 && (
            <span className={cn('text-lg font-bold', config.color)}>{confidence}%</span>
          )}
        </div>
        {(confidence !== null && confidence > 0) && (
          <div className="w-full h-2 rounded-full bg-white/60 overflow-hidden mb-2">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                confidence >= 70 ? 'bg-emerald-400' :
                confidence >= 40 ? 'bg-amber-400' : 'bg-rose-400'
              )}
              style={{ width: `${confidence}%` }}
            />
          </div>
        )}
        {age && (
          <p className="text-[10px] text-slate-400">Last checked {age}</p>
        )}
      </div>
    )
  }

  if (size === 'md') {
    return (
      <div className="flex items-center gap-2">
        <span className={cn(
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border',
          config.bgColor, config.color
        )}>
          <span className="text-[10px]">{config.icon}</span>
          {config.label}
          {showConfidence && confidence !== null && confidence > 0 && (
            <span className="font-bold ml-0.5">{confidence}%</span>
          )}
        </span>
        {showAge && age && (
          <span className="text-[10px] text-slate-400">{age}</span>
        )}
      </div>
    )
  }

  // size === 'sm'
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md border',
      config.bgColor, config.color
    )} title={`${config.label}${confidence ? ` (${confidence}%)` : ''}${age ? ` - ${age}` : ''}`}>
      {config.icon}
      {showConfidence && confidence !== null && confidence > 0 && (
        <span className="font-bold">{confidence}%</span>
      )}
    </span>
  )
}
