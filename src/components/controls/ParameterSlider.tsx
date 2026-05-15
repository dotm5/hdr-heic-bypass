import React from 'react'
import { ParameterField } from '../ParameterField'
import type { Language } from '../../lib/i18n'
import type { ParameterHelpCopy } from '../../lib/parameterHelp'

type ParameterSliderProps = {
  language: Language
  label: string
  help: ParameterHelpCopy
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}

export function ParameterSlider({
  language,
  label,
  help,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: ParameterSliderProps) {
  const id = React.useId()
  return (
    <ParameterField language={language} id={id} label={label} value={format(value)} help={help} className="slider-row">
      {(describedById) => (
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-describedby={describedById}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
    </ParameterField>
  )
}
