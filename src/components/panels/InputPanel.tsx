import { FileImage, ImageUp, X } from 'lucide-react'
import type React from 'react'
import { ParameterField } from '../ParameterField'
import type { InputMode } from '../../lib/authoring'
import type { Language } from '../../lib/i18n'
import type { ParameterHelpCopy } from '../../lib/parameterHelp'
import type { translations } from '../../lib/i18n'

type InputPanelProps = {
  language: Language
  t: typeof translations.en
  help: { inputMode: ParameterHelpCopy }
  inputMode: InputMode
  sourceName: string
  gainMapName: string
  canClear: boolean
  onInputModeChange: (mode: InputMode) => void
  onImageFile: (file: File | null, target: 'source' | 'gain-map') => void
  onDrop: (event: React.DragEvent<HTMLLabelElement>) => void
  onClearWorkspace: () => void
}

export function InputPanel({
  language,
  t,
  help,
  inputMode,
  sourceName,
  gainMapName,
  canClear,
  onInputModeChange,
  onImageFile,
  onDrop,
  onClearWorkspace,
}: InputPanelProps) {
  return (
    <>
      <ParameterField language={language} label={t.inputMode} help={help.inputMode} className="mode-switch-field">
        {(describedById) => (
          <div className="mode-switch" aria-label={t.inputMode}>
            <button
              className={inputMode === 'single-image-enhance' ? 'active' : undefined}
              type="button"
              aria-describedby={describedById}
              onClick={() => onInputModeChange('single-image-enhance')}
            >
              {t.singleImageEnhance}
            </button>
            <button
              className={inputMode === 'base-plus-gain-map' ? 'active' : undefined}
              type="button"
              aria-describedby={describedById}
              onClick={() => onInputModeChange('base-plus-gain-map')}
            >
              {t.basePlusGainMap}
            </button>
          </div>
        )}
      </ParameterField>

      <div className="drop-stack">
        <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <ImageUp aria-hidden="true" />
          <span>{sourceName || (inputMode === 'base-plus-gain-map' ? t.chooseBaseImage : t.chooseImage)}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            onClick={(event) => {
              event.currentTarget.value = ''
            }}
            onChange={(event) => onImageFile(event.target.files?.[0] ?? null, 'source')}
          />
        </label>
        {inputMode === 'base-plus-gain-map' && (
          <label className="drop-zone secondary-drop" onDragOver={(event) => event.preventDefault()}>
            <FileImage aria-hidden="true" />
            <span>{gainMapName || t.chooseGainMapImage}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              onClick={(event) => {
                event.currentTarget.value = ''
              }}
              onChange={(event) => onImageFile(event.target.files?.[0] ?? null, 'gain-map')}
            />
          </label>
        )}
      </div>

      {canClear && (
        <button className="secondary-action" type="button" onClick={onClearWorkspace}>
          <X aria-hidden="true" />
          {t.clearWorkspace}
        </button>
      )}
    </>
  )
}
