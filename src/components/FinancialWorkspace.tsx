import type { FinancialDocument, PdfOcrProgress } from '../types'
import { FinancialChecksPanel } from './FinancialChecksPanel'
import { FinancialDocumentOverview } from './FinancialDocumentOverview'
import { FinancialKeyFigures } from './FinancialKeyFigures'
import { FinancialStatementTabs } from './FinancialStatementTabs'
import { ExtractionTracePanel } from './ExtractionTracePanel'

interface FinancialWorkspaceProps {
  document: FinancialDocument
  onRunOcr?: () => void
  ocrBusy?: boolean
  ocrProgress?: PdfOcrProgress | null
}

export function FinancialWorkspace({
  document,
  onRunOcr,
  ocrBusy,
  ocrProgress,
}: FinancialWorkspaceProps) {
  return (
    <div className="financial-workspace">
      <FinancialDocumentOverview
        document={document}
        onRunOcr={onRunOcr}
        ocrBusy={ocrBusy}
        ocrProgress={ocrProgress}
      />
      <FinancialKeyFigures document={document} />
      <FinancialStatementTabs document={document} />
      <FinancialChecksPanel checks={document.checks} />
      <ExtractionTracePanel document={document} />
    </div>
  )
}

