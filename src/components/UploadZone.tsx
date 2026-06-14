import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import { FILE_INPUT_ACCEPT, SAMPLE_DATASETS, SUPPORTED_FORMATS_LABEL } from '../lib/parseFile'

interface UploadZoneProps {
  onFile: (file: File) => void
  onSample: (file?: string) => void
  error: string | null
  busy: boolean
}

function UploadIcon() {
  return (
    <svg className="dropzone__icon" viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
      <path
        d="M24 30V12m0 0l-7 7m7-7l7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 30v4a4 4 0 004 4h20a4 4 0 004-4v-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The pre-upload empty state: drag-and-drop / browse plus sample files. */
export function UploadZone({ onFile, onSample, error, busy }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const openPicker = () => inputRef.current?.click()

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openPicker()
    }
  }

  return (
    <section className="upload">
      <div className="upload__intro">
        <h1 className="upload__headline">Reconstruct annual accounts in your browser</h1>
        <p className="upload__sub">
          Drop in a PDF, annual report, trial balance, CSV, spreadsheet, XML or XBRL file. The
          Publisher extracts statements locally and turns them into an analyst-style financial page.
        </p>
      </div>

      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}${error ? ' dropzone--error' : ''}${
          busy ? ' dropzone--busy' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Upload an annual account, financial statement, PDF, spreadsheet, XML or XBRL file"
      >
        <input
          ref={inputRef}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          className="dropzone__input"
          onChange={handleChange}
        />
        {busy ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <p className="dropzone__title">Reading your file…</p>
            <p className="dropzone__hint">Parsing and profiling locally</p>
          </>
        ) : (
          <>
            <UploadIcon />
            <p className="dropzone__title">Drop your financial file here</p>
            <p className="dropzone__hint">
              or <span className="dropzone__link">browse your files</span>
            </p>
            <p className="dropzone__formats">{SUPPORTED_FORMATS_LABEL}</p>
          </>
        )}
      </div>

      {error && (
        <p className="upload__error" role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}

      <div className="upload__sample">
        <span className="muted">No file handy? Try a financial sample:</span>
        <div className="upload__sample-grid">
          {SAMPLE_DATASETS.map((sample) => (
            <button
              key={sample.id}
              className="sample-chip"
              onClick={() => onSample(sample.file)}
              disabled={busy}
              title={sample.description}
            >
              <span className="sample-chip__label">{sample.label}</span>
              <span className="sample-chip__desc">{sample.description}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="upload__features">
        <li>
          <span className="upload__feature-icon">🔒</span>
          <div>
            <strong>Stays private</strong>
            <p>Files are read on your device — never sent to a server.</p>
          </div>
        </li>
        <li>
          <span className="upload__feature-icon">📊</span>
          <div>
            <strong>Auto-profiled</strong>
            <p>Periods, statement sections and key figures, detected for you.</p>
          </div>
        </li>
        <li>
          <span className="upload__feature-icon">🔎</span>
          <div>
            <strong>Explorable</strong>
            <p>Review statements, checks and raw extraction trace in one workspace.</p>
          </div>
        </li>
      </ul>
    </section>
  )
}
