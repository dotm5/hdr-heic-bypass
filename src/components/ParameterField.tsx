import { Info } from 'lucide-react'
import React from 'react'
import { createPortal } from 'react-dom'
import type { Language } from '../lib/i18n'
import { clamp } from '../lib/math'
import type { ParameterHelpCopy } from '../lib/parameterHelp'

type ParameterFieldProps = {
  language: Language
  id?: string
  label: string
  value?: React.ReactNode
  help: ParameterHelpCopy
  className?: string
  children: (describedById?: string) => React.ReactNode
}

export function ParameterField({ language, id, label, value, help, className, children }: ParameterFieldProps) {
  const {
    anchorRef,
    buttonRef,
    tooltipRef,
    isOpen,
    buttonProps,
    tooltipId,
    tooltipNode,
    handleMouseEnter,
    handleMouseLeave,
    handleFocusCapture,
    handleBlurCapture,
  } = useFloatingParameterHelp({ language, help })

  return (
    <div
      ref={anchorRef}
      className={className ? `parameter-field ${className}` : 'parameter-field'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      <div className="parameter-field-head">
        {id ? (
          <label className="parameter-field-label" htmlFor={id}>
            {label}
          </label>
        ) : (
          <span className="parameter-field-label">{label}</span>
        )}
        <div className="parameter-field-meta">
          {value !== undefined && <strong>{value}</strong>}
          <button
            ref={buttonRef}
            className="parameter-help-button"
            type="button"
            aria-label={language === 'zh' ? `显示 ${help.title} 帮助` : `Show help for ${help.title}`}
            aria-controls={tooltipId}
            aria-expanded={isOpen}
            aria-describedby={isOpen ? tooltipId : undefined}
            {...buttonProps}
          >
            <Info aria-hidden="true" />
          </button>
        </div>
      </div>
      {children(isOpen ? tooltipId : undefined)}
      {tooltipNode &&
        createPortal(
          <div ref={tooltipRef} className="parameter-help-popover" style={tooltipNode.style} role="tooltip" id={tooltipId}>
            <h4>{help.title}</h4>
            <p>{help.summary}</p>
            <p>
              <span>{language === 'zh' ? '影响：' : 'Effect:'}</span> {help.effect}
            </p>
            {help.recommended && (
              <p>
                <span>{language === 'zh' ? '推荐：' : 'Recommended:'}</span> {help.recommended}
              </p>
            )}
            {help.warning && (
              <p className="warning">
                <span>{language === 'zh' ? '注意：' : 'Warning:'}</span> {help.warning}
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

type FloatingHelpArgs = {
  language: Language
  help: ParameterHelpCopy
}

function useFloatingParameterHelp({ language, help }: FloatingHelpArgs) {
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const tooltipRef = React.useRef<HTMLDivElement>(null)
  const id = React.useId()
  const tooltipId = `parameter-help-${id.replace(/:/g, '')}`
  const [hovered, setHovered] = React.useState(false)
  const [focusedWithin, setFocusedWithin] = React.useState(false)
  const [pinned, setPinned] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)
  const [style, setStyle] = React.useState<React.CSSProperties>({})

  const isOpen = (hovered || pinned || focusedWithin) && !dismissed

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current
    const tooltip = tooltipRef.current
    if (!anchor || !tooltip) return

    const anchorRect = anchor.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const gap = 12
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const canPlaceRight = viewportWidth - anchorRect.right >= tooltipRect.width + gap
    const canPlaceBelow = viewportHeight - anchorRect.bottom >= tooltipRect.height + gap
    const canPlaceAbove = anchorRect.top >= tooltipRect.height + gap

    let top: number
    let left: number

    if (canPlaceRight) {
      top = clamp(anchorRect.top, gap, viewportHeight - tooltipRect.height - gap)
      left = Math.min(anchorRect.right + gap, viewportWidth - tooltipRect.width - gap)
    } else if (canPlaceBelow || !canPlaceAbove) {
      top = anchorRect.bottom + gap
      left = clamp(anchorRect.left, gap, viewportWidth - tooltipRect.width - gap)
    } else {
      top = anchorRect.top - tooltipRect.height - gap
      left = clamp(anchorRect.left, gap, viewportWidth - tooltipRect.width - gap)
    }

    setStyle({
      position: 'fixed',
      top: `${Math.max(gap, top)}px`,
      left: `${Math.max(gap, left)}px`,
    })
  }, [])

  React.useLayoutEffect(() => {
    if (!isOpen) return
    updatePosition()
  }, [isOpen, updatePosition, help.summary, help.effect, help.recommended, help.warning, language])

  React.useEffect(() => {
    if (!isOpen) return

    const handleClose = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const anchor = anchorRef.current
      const tooltip = tooltipRef.current
      if (anchor?.contains(target) || tooltip?.contains(target)) return
      setPinned(false)
      setDismissed(true)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPinned(false)
      setDismissed(true)
    }

    const handleWindowChange = () => updatePosition()

    window.addEventListener('pointerdown', handleClose, true)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleWindowChange)
    window.addEventListener('scroll', handleWindowChange, true)

    return () => {
      window.removeEventListener('pointerdown', handleClose, true)
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleWindowChange)
      window.removeEventListener('scroll', handleWindowChange, true)
    }
  }, [isOpen, updatePosition])

  const handleMouseEnter = () => {
    setHovered(true)
    setDismissed(false)
  }

  const handleMouseLeave = () => {
    setHovered(false)
    if (!focusedWithin && !pinned) {
      setDismissed(false)
    }
  }

  const handleFocusCapture = () => {
    setFocusedWithin(true)
    setDismissed(false)
  }

  const handleBlurCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget && event.currentTarget.contains(relatedTarget as Node)) return
    setFocusedWithin(false)
    if (!hovered && !pinned) {
      setDismissed(false)
    }
  }

  const togglePinned = () => {
    setPinned((current) => {
      const next = !current
      setDismissed(!next)
      return next
    })
  }

  const buttonProps = {
    onClick: togglePinned,
    onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
    },
  }

  return {
    anchorRef,
    buttonRef,
    tooltipRef,
    tooltipId,
    isOpen,
    buttonProps,
    tooltipNode: isOpen ? { style } : null,
    handleMouseEnter,
    handleMouseLeave,
    handleFocusCapture,
    handleBlurCapture,
  }
}
