import type { FinancialDocument, PdfOcrProgress } from '../types'
import { FinancialDocumentOverview } from './FinancialDocumentOverview'
import { FinancialKeyFigures } from './FinancialKeyFigures'
import { FinancialStatementTabs } from './FinancialStatementTabs'
import { FinancialChecksPanel } from './FinancialChecksPanel'
import { ExtractionTracePanel } from './ExtractionTracePanel'
import { PdfOcrProgressPanel } from './PdfOcrProgress'

export function FinancialWorkspace({
  document,
  onRunOcr,
  ocrBusy = false,
  ocrProgress = null,
}: {
  document: FinancialDocument
  onRunOcr?: () => void
  ocrBusy?: boolean
  ocrProgress?: PdfOcrProgress | null
}) {
  return (
    <div className="financial-workspace">
      <FinancialDocumentOverview document={document} onRunOcr={onRunOcr} ocrBusy={ocrBusy} />
      <PdfOcrProgressPanel progress={ocrProgress} />
      <FinancialKeyFigures document={document} />
      <FinancialStatementTabs document={document} />
      <FinancialChecksPanel checks={document.checks} />
      <ExtractionTracePanel document={document} />
    </div>
  )
}
