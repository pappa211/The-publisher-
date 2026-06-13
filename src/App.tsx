import { useCallback, useState } from 'react'
import './App.css'
import type { AppStatus, Dataset } from './types'
import { CsvParseError, loadSampleDataset, parseCsvFile } from './lib/parseCsv'
import { Header } from './components/Header'
import { UploadZone } from './components/UploadZone'
import { Workspace } from './components/Workspace'

const GENERIC_ERROR = 'Something went wrong while reading that file. Please try a different CSV.'

export default function App() {
  const [status, setStatus] = useState<AppStatus>('idle')
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runParse = useCallback(async (work: () => Promise<Dataset>) => {
    setStatus('parsing')
    setError(null)
    try {
      const result = await work()
      setDataset(result)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof CsvParseError ? err.message : GENERIC_ERROR)
      setStatus('error')
    }
  }, [])

  const handleFile = useCallback(
    (file: File) => {
      void runParse(() => parseCsvFile(file))
    },
    [runParse],
  )

  const handleSample = useCallback(() => {
    void runParse(() => loadSampleDataset())
  }, [runParse])

  const handleReset = useCallback(() => {
    setDataset(null)
    setStatus('idle')
    setError(null)
  }, [])

  const hasData = status === 'ready' && dataset !== null

  return (
    <div className="app">
      <Header hasData={hasData} onReset={handleReset} />
      <main className="app-main">
        {status === 'ready' && dataset ? (
          <Workspace dataset={dataset} />
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
