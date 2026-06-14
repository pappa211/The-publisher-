/**
 * Client-side XML and XBRL parsing.
 *
 * Financial XML comes in a few different shapes:
 * - XBRL instance / Inline XBRL files contain reported facts with periods,
 *   units and values.
 * - XBRL linkbases describe taxonomy relationships such as calculation trees,
 *   labels and presentation structures, but usually contain no reported
 *   amounts.
 * - Generic XML can still be made inspectable by flattening elements.
 */
import type { Dataset, ParseIssue, WorkbookSheetMeta } from '../types'
import { buildDataset, FileParseError, type RawTable } from './dataset'
import { buildFinancialAnalysis, FINANCIAL_FIELDS } from './financialAnalysis'
import { parseNumber } from './inferTypes'

const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const MAX_GENERIC_XML_ROWS = 5000

const LINKBASE_FIELDS = [
  'Linkbase',
  'Role',
  'Relationship',
  'From Concept',
  'To Concept',
  'Label',
  'Weight',
  'Order',
  'Arcrole',
  'Preferred Label',
  'Language',
  'From Href',
  'To Href',
]

const GENERIC_XML_FIELDS = ['Path', 'Element', 'Text', 'Attributes', 'Depth', 'Child Count']

interface XbrlContext {
  id: string
  period: string
  entity: string
  dimensions: string[]
}

interface LinkbaseSpec {
  linkName: string
  arcName: string
  label: string
}

const RELATIONSHIP_LINKBASES: LinkbaseSpec[] = [
  { linkName: 'calculationLink', arcName: 'calculationArc', label: 'Calculation' },
  { linkName: 'presentationLink', arcName: 'presentationArc', label: 'Presentation' },
  { linkName: 'definitionLink', arcName: 'definitionArc', label: 'Definition' },
  { linkName: 'referenceLink', arcName: 'referenceArc', label: 'Reference' },
]

/** Parse an XML, XBRL or Inline XBRL File into a profiled Dataset. */
export async function parseXmlFile(file: File): Promise<Dataset> {
  const text = await file.text()
  const doc = parseXmlDocument(text)
  const table = extractXmlTable(doc, file.name)
  return buildDataset({ fileName: file.name, fileSize: file.size }, table)
}

function parseXmlDocument(text: string): XMLDocument {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const parserErrors = doc.getElementsByTagName('parsererror')
  if (parserErrors.length > 0 || doc.documentElement.localName === 'parsererror') {
    throw new FileParseError('That XML file could not be read. Check that it is well-formed XML.')
  }
  return doc
}

function extractXmlTable(doc: XMLDocument, fileName: string): RawTable {
  const factElements = findXbrlFactElements(doc)
  if (factElements.length > 0) {
    return extractXbrlFacts(doc, factElements, fileName)
  }

  const linkbase = extractXbrlLinkbase(doc)
  if (linkbase.records.length > 0) return linkbase

  return extractGenericXml(doc)
}

function elements(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('*'))
}

function localName(el: Element): string {
  return el.localName || stripPrefix(el.tagName)
}

function stripPrefix(value: string): string {
  const index = value.indexOf(':')
  return index >= 0 ? value.slice(index + 1) : value
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? ''
}

function xlinkAttr(el: Element, name: string): string {
  return (
    el.getAttributeNS(XLINK_NS, name) ??
    el.getAttribute(`xlink:${name}`) ??
    el.getAttribute(name) ??
    ''
  )
}

function xmlAttr(el: Element, name: string): string {
  return el.getAttributeNS(XML_NS, name) ?? el.getAttribute(`xml:${name}`) ?? ''
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function truncate(value: string, max = 240): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`
}

function descendants(el: Element, name: string): Element[] {
  return elements(el).filter((child) => localName(child) === name)
}

function descendantText(el: Element, name: string): string {
  return normalizeText(descendants(el, name)[0]?.textContent)
}

function directText(el: Element): string {
  return normalizeText(
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
      .map((node) => node.textContent ?? '')
      .join(' '),
  )
}

function conceptId(value: string): string {
  if (!value) return ''
  const afterHash = value.includes('#') ? value.slice(value.lastIndexOf('#') + 1) : value
  return afterHash.split('/').pop() ?? afterHash
}

function conceptLocalName(value: string): string {
  let core = stripPrefix(conceptId(value))
  const taxonomyPrefix = core.match(/^(?:ifrs-full|us-gaap|dei|srt|ecd|esef_cor|salmar)_(.+)$/i)
  if (taxonomyPrefix) core = taxonomyPrefix[1]
  return core
}

function humanizeConcept(value: string): string {
  return conceptLocalName(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function shortUri(value: string): string {
  if (!value) return ''
  const last = value.split(/[\/#]/).filter(Boolean).pop() ?? value
  return humanizeConcept(last) || last
}

function roleLabel(role: string): string {
  return shortUri(role) || role
}

function buildContextMap(doc: XMLDocument): Map<string, XbrlContext> {
  const contexts = new Map<string, XbrlContext>()

  for (const context of elements(doc).filter((el) => localName(el) === 'context')) {
    const id = attr(context, 'id')
    if (!id) continue

    const startDate = descendantText(context, 'startDate')
    const endDate = descendantText(context, 'endDate')
    const instant = descendantText(context, 'instant')
    const period = periodLabel(startDate, endDate, instant)
    const entity = descendantText(context, 'identifier')
    const dimensions = descendants(context, 'explicitMember').map((member) => {
      const dimension = attr(member, 'dimension')
      const value = normalizeText(member.textContent)
      return dimension ? `${humanizeConcept(dimension)}: ${humanizeConcept(value)}` : humanizeConcept(value)
    })

    contexts.set(id, { id, period, entity, dimensions })
  }

  return contexts
}

function periodLabel(startDate: string, endDate: string, instant: string): string {
  if (startDate && endDate) {
    const startYear = yearFromDate(startDate)
    const endYear = yearFromDate(endDate)
    if (endYear && startYear && startYear === endYear) return `FY ${endYear}`
    return `${startDate} to ${endDate}`
  }
  if (instant) {
    const year = yearFromDate(instant)
    return year ? `As of ${year}` : instant
  }
  return 'Unspecified period'
}

function yearFromDate(value: string): string | null {
  const match = value.match(/\b((?:19|20)\d{2})\b/)
  return match ? match[1] : null
}

function buildUnitMap(doc: XMLDocument): Map<string, string> {
  const units = new Map<string, string>()

  for (const unit of elements(doc).filter((el) => localName(el) === 'unit')) {
    const id = attr(unit, 'id')
    if (!id) continue
    const measures = descendants(unit, 'measure').map((measure) => normalizeText(measure.textContent))
    if (measures.length === 0) continue
    const hasDivide = descendants(unit, 'divide').length > 0
    units.set(id, hasDivide && measures.length >= 2
      ? `${measures[0]} / ${measures.slice(1).join(' x ')}`
      : measures.join(' x '))
  }

  return units
}

function findXbrlFactElements(doc: XMLDocument): Element[] {
  return elements(doc).filter((el) => {
    const name = localName(el)
    if (name === 'nonFraction' || name === 'nonNumeric') return true
    return Boolean(attr(el, 'contextRef')) && !['context', 'unit'].includes(name)
  })
}

function extractXbrlFacts(doc: XMLDocument, factElements: Element[], fileName: string): RawTable {
  const contexts = buildContextMap(doc)
  const units = buildUnitMap(doc)
  const records = factElements.map((fact, index) => {
    const isInline = localName(fact) === 'nonFraction' || localName(fact) === 'nonNumeric'
    const concept = isInline ? attr(fact, 'name') : fact.tagName
    const contextId = attr(fact, 'contextRef')
    const context = contexts.get(contextId)
    const unitId = attr(fact, 'unitRef')
    const rawValue = normalizeText(fact.textContent)
    const amount = numericFactValue(rawValue, attr(fact, 'scale'), attr(fact, 'sign'))
    const noteParts = [
      contextId ? `context ${contextId}` : '',
      attr(fact, 'decimals') ? `decimals ${attr(fact, 'decimals')}` : '',
      attr(fact, 'scale') ? `scale ${attr(fact, 'scale')}` : '',
      context?.dimensions.length ? context.dimensions.join('; ') : '',
      amount === null && rawValue ? `value: ${truncate(rawValue, 160)}` : '',
    ].filter(Boolean)

    return {
      Sheet: fileName,
      Statement: statementTypeFromConcept(concept),
      Section: context?.dimensions.join('; ') || context?.entity || '',
      'Line Item': humanizeConcept(concept) || concept || `Fact ${index + 1}`,
      Metric: concept || 'Fact',
      Period: context?.period ?? 'Unspecified period',
      Amount: amount ?? '',
      Unit: units.get(unitId) ?? unitId,
      Note: noteParts.join(' | '),
      'Source Row': `${isInline ? 'Inline fact' : 'Fact'} ${index + 1}`,
    }
  })

  const source: WorkbookSheetMeta = {
    name: fileName,
    rowCount: records.length,
    columnCount: FINANCIAL_FIELDS.length,
    importedRows: records.length,
    kind: 'financial-table',
    statementType: 'XBRL facts',
  }
  const financialAnalysis = buildFinancialAnalysis(records, [source])
  const numericFacts = records.filter((record) => record.Amount !== '').length
  const issues: ParseIssue[] = [
    {
      message: financialAnalysis
        ? `Detected XBRL facts and normalized ${numericFacts.toLocaleString()} numeric financial amounts.`
        : `Parsed ${records.length.toLocaleString()} XBRL facts. Financial analysis appears when enough numeric facts, periods and units are present.`,
    },
  ]

  return {
    fields: FINANCIAL_FIELDS,
    records,
    issues,
    financialAnalysis,
  }
}

function numericFactValue(rawValue: string, scaleText: string, sign: string): number | null {
  const parsed = parseNumber(rawValue)
  if (parsed === null) return null
  const scale = scaleText === '' ? 0 : Number(scaleText)
  const scaled = Number.isFinite(scale) ? parsed * 10 ** scale : parsed
  return sign.trim() === '-' ? -Math.abs(scaled) : scaled
}

function statementTypeFromConcept(concept: string): string {
  const text = `${concept} ${humanizeConcept(concept)}`.toLowerCase()
  if (/cash\s*flows?|cashflows?|operating\s+activities|investing\s+activities|financing\s+activities/.test(text)) {
    return 'Cash flow statement'
  }
  if (/comprehensive\s+income/.test(text)) return 'Comprehensive income statement'
  if (/assets?|liabilit|equity|inventory|receivable|payable|debt|current|noncurrent/.test(text)) {
    return 'Balance sheet'
  }
  if (/revenue|profit|loss|income|expense|cost|sales|ebit|tax/.test(text)) {
    return 'Income statement'
  }
  if (/share|dividend|treasury/.test(text)) return 'Equity statement'
  return 'XBRL fact'
}

function extractXbrlLinkbase(doc: XMLDocument): RawTable {
  const records: Record<string, unknown>[] = []

  for (const spec of RELATIONSHIP_LINKBASES) {
    for (const link of elements(doc).filter((el) => localName(el) === spec.linkName)) {
      const locs = locatorMap(link)
      const role = roleLabel(xlinkAttr(link, 'role'))
      for (const arc of Array.from(link.children).filter((child) => localName(child) === spec.arcName)) {
        const fromHref = locs.get(xlinkAttr(arc, 'from')) ?? ''
        const toHref = locs.get(xlinkAttr(arc, 'to')) ?? ''
        records.push({
          Linkbase: spec.label,
          Role: role,
          Relationship: shortUri(xlinkAttr(arc, 'arcrole')) || spec.label,
          'From Concept': humanizeConcept(fromHref),
          'To Concept': humanizeConcept(toHref),
          Label: '',
          Weight: attr(arc, 'weight'),
          Order: attr(arc, 'order'),
          Arcrole: xlinkAttr(arc, 'arcrole'),
          'Preferred Label': shortUri(xlinkAttr(arc, 'preferredLabel')),
          Language: '',
          'From Href': fromHref,
          'To Href': toHref,
        })
      }
    }
  }

  records.push(...extractLabelLinkbaseRows(doc))

  return {
    fields: LINKBASE_FIELDS,
    records,
    issues: records.length > 0
      ? [{
        message: 'Parsed XBRL linkbase relationships. This XML describes taxonomy structure, labels or calculations; it does not contain reported fact values.',
      }]
      : [],
  }
}

function locatorMap(link: Element): Map<string, string> {
  const locs = new Map<string, string>()
  for (const loc of Array.from(link.children).filter((child) => localName(child) === 'loc')) {
    const label = xlinkAttr(loc, 'label')
    const href = xlinkAttr(loc, 'href')
    if (label && href) locs.set(label, href)
  }
  return locs
}

function resourceMap(link: Element, resourceName: string): Map<string, Element[]> {
  const resources = new Map<string, Element[]>()
  for (const resource of Array.from(link.children).filter((child) => localName(child) === resourceName)) {
    const label = xlinkAttr(resource, 'label')
    if (!label) continue
    const existing = resources.get(label) ?? []
    existing.push(resource)
    resources.set(label, existing)
  }
  return resources
}

function extractLabelLinkbaseRows(doc: XMLDocument): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []

  for (const link of elements(doc).filter((el) => localName(el) === 'labelLink')) {
    const locs = locatorMap(link)
    const labels = resourceMap(link, 'label')
    const role = roleLabel(xlinkAttr(link, 'role'))

    for (const arc of Array.from(link.children).filter((child) => localName(child) === 'labelArc')) {
      const fromHref = locs.get(xlinkAttr(arc, 'from')) ?? ''
      const resources = labels.get(xlinkAttr(arc, 'to')) ?? []
      for (const label of resources) {
        rows.push({
          Linkbase: 'Label',
          Role: role,
          Relationship: shortUri(xlinkAttr(arc, 'arcrole')) || 'Concept label',
          'From Concept': humanizeConcept(fromHref),
          'To Concept': '',
          Label: truncate(normalizeText(label.textContent), 360),
          Weight: '',
          Order: attr(arc, 'order'),
          Arcrole: xlinkAttr(arc, 'arcrole'),
          'Preferred Label': shortUri(xlinkAttr(label, 'role')),
          Language: xmlAttr(label, 'lang'),
          'From Href': fromHref,
          'To Href': '',
        })
      }
    }
  }

  return rows
}

function extractGenericXml(doc: XMLDocument): RawTable {
  const records: Record<string, unknown>[] = []

  function visit(el: Element, path: string, depth: number) {
    if (records.length >= MAX_GENERIC_XML_ROWS) return
    const name = localName(el)
    const nextPath = `${path}/${name}`
    records.push({
      Path: nextPath,
      Element: name,
      Text: truncate(directText(el), 500),
      Attributes: attributesText(el),
      Depth: depth,
      'Child Count': el.children.length,
    })
    for (const child of Array.from(el.children)) {
      visit(child, nextPath, depth + 1)
      if (records.length >= MAX_GENERIC_XML_ROWS) return
    }
  }

  visit(doc.documentElement, '', 0)
  const issues: ParseIssue[] = [
    { message: `Flattened ${records.length.toLocaleString()} XML elements into an inspectable table.` },
  ]
  if (records.length >= MAX_GENERIC_XML_ROWS) {
    issues.push({ message: `Stopped after ${MAX_GENERIC_XML_ROWS.toLocaleString()} XML elements to keep the browser responsive.` })
  }

  return {
    fields: GENERIC_XML_FIELDS,
    records,
    issues,
  }
}

function attributesText(el: Element): string {
  return Array.from(el.attributes)
    .map((attribute) => `${attribute.name}="${truncate(attribute.value, 160)}"`)
    .join(' ')
}
