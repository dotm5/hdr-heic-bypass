import React from 'react'
import { ParameterField } from '../ParameterField'
import type { Language } from '../../lib/i18n'
import type { ParameterHelpCopy } from '../../lib/parameterHelp'

type ParameterSelectProps = {
  language: Language
  label: string
  help: ParameterHelpCopy
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
}

export function ParameterSelect({ language, label, help, value, options, onChange }: ParameterSelectProps) {
  const id = React.useId()
  return (
    <ParameterField language={language} id={id} label={label} help={help} className="select-row">
      {(describedById) => (
        <select id={id} value={value} aria-describedby={describedById} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </ParameterField>
  )
}
