import { useCallback, useState } from 'react'
import './App.css'
import type { AppStatus, Dataset } from './types'
import { FileParseError, loadSampleFile, parseFile } from './lib/parseFile'
import { Header } from './components/Header'
import { UploadZone } from './components/UploadZone'
import { Workspace } from './components/Workspace'

const GENERIC_ERROR = 'Something went wrong while reading that file. Please try a different file.'

export default function App() {
  const [status, setStatus] = useState<AppStatus>('idle')
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Parse a File and keep it around — the experimental PDF/OCR path may need to
  // re-open the original file to rasterize pages for OCR.
  const runParse = useCallback(async (load: () => Promise<File>) => {
    setStatus('parsing')
    setError(null)
    try {
      const file = await load()
      setSourceFile(file)
      const result = await parseFile(file)
      setDataset(result)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof FileParseError ? err.message : GENERIC_ERROR)
      setStatus('error')
    }
  }, [])

  const handleFile = useCallback(
    (file: File) => {
      void runParse(() => Promise.resolve(file))
    },
    [runParse],
  )

  const handleSample = useCallback(
    (file?: string) => {
      void runParse(() => loadSampleFile(file))
    },
    [runParse],
  )

  const handleReset = useCallback(() => {
    setDataset(null)
    setSourceFile(null)
    setStatus('idle')
    setError(null)
  }, [])

  const hasData = status === 'ready' && dataset !== null

  return (
    <div className="app">
      <Header hasData={hasData} onReset={handleReset} />
      <main className="app-main">
        {status === 'ready' && dataset ? (
          <Workspace key={dataset.parsedAt} dataset={dataset} sourceFile={sourceFile} />
        ) : (
          <UploadZone
            onFile={handleFile}
            onSample={handleSample}
            error={error}
            busy={status === 'parsing'}
          />
        )}
      </main>
      <footer className="app-footer">
        <span>The Publisher — a static, client-side prototype.</span>
        <span className="muted">Your data never leaves your browser.</span>
      </footer>
    </div>
  )
}
