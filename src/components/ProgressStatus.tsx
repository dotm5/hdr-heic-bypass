import React from 'react'

type ProgressStatusProps = {
  active: boolean
  label: string
  startedAt: number
  estimatedMs: number
  completeLabel: string
}

export function ProgressStatus({ active, label, startedAt, estimatedMs, completeLabel }: ProgressStatusProps) {
  const [now, setNow] = React.useState(() => performance.now())

  React.useEffect(() => {
    if (!active) return
    const handle = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(handle)
  }, [active])

  if (!active) return null

  const elapsed = Math.max(0, now - startedAt)
  const progress = Math.min(0.96, estimatedMs > 0 ? elapsed / estimatedMs : 0.1)
  const remainingMs = Math.max(0, estimatedMs - elapsed)

  return (
    <div className="progress-status" role="status" aria-live="polite">
      <div className="progress-meta">
        <span>{label}</span>
        <span>{remainingMs > 500 ? `${Math.ceil(remainingMs / 1000)}s` : completeLabel}</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  )
}
