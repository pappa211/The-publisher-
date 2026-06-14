import type { FinancialStatementKind } from '../types'

export interface ConceptRule {
  concept: string
  label: string
  statementKind: FinancialStatementKind
  patterns: RegExp[]
  priority: number
}

export const CONCEPT_RULES: ConceptRule[] = [
  {
    concept: 'revenue',
    label: 'Revenue',
    statementKind: 'income_statement',
    patterns: [/^revenue$/i, /\bsales\b/i, /\bdriftsinntekter\b/i, /revenue from contracts/i],
    priority: 100,
  },
  {
    concept: 'cost_of_sales',
    label: 'Cost of sales',
    statementKind: 'income_statement',
    patterns: [/cost of sales/i, /cost of goods sold/i, /varekost/i],
    priority: 75,
  },
  {
    concept: 'gross_profit',
    label: 'Gross profit',
    statementKind: 'income_statement',
    patterns: [/gross profit/i, /bruttoresultat/i],
    priority: 85,
  },
  {
    concept: 'ebitda',
    label: 'EBITDA',
    statementKind: 'income_statement',
    patterns: [/\bebitda\b/i],
    priority: 82,
  },
  {
    concept: 'operating_profit',
    label: 'Operating profit / EBIT',
    statementKind: 'income_statement',
    patterns: [/operating profit/i, /operating income/i, /\bebit\b/i, /\bdriftsresultat\b/i],
    priority: 90,
  },
  {
    concept: 'profit_before_tax',
    label: 'Profit before tax',
    statementKind: 'income_statement',
    patterns: [/profit before tax/i, /income before tax/i, /resultat.*før skatt/i],
    priority: 88,
  },
  {
    concept: 'income_tax',
    label: 'Income tax expense',
    statementKind: 'income_statement',
    patterns: [/income tax/i, /tax expense/i, /\bskatt\b/i],
    priority: 70,
  },
  {
    concept: 'net_income',
    label: 'Profit for the year / net income',
    statementKind: 'income_statement',
    patterns: [/profit for the (?:year|period)/i, /\bnet income\b/i, /^profit\s*\(loss\)$/i, /\bårsresultat\b/i],
    priority: 95,
  },
  {
    concept: 'total_comprehensive_income',
    label: 'Total comprehensive income',
    statementKind: 'income_statement',
    patterns: [/total comprehensive income/i],
    priority: 78,
  },
  {
    concept: 'non_current_assets',
    label: 'Non-current assets',
    statementKind: 'balance_sheet',
    patterns: [/non-current assets/i, /non current assets/i, /\banleggsmidler\b/i],
    priority: 75,
  },
  {
    concept: 'current_assets',
    label: 'Current assets',
    statementKind: 'balance_sheet',
    patterns: [/current assets/i, /\bomløpsmidler\b/i],
    priority: 75,
  },
  {
    concept: 'cash_and_cash_equivalents',
    label: 'Cash and cash equivalents',
    statementKind: 'balance_sheet',
    patterns: [/cash and cash equivalents/i, /^cash$/i, /kontanter.*bank/i, /bankinnskudd/i],
    priority: 90,
  },
  {
    concept: 'trade_receivables',
    label: 'Trade receivables',
    statementKind: 'balance_sheet',
    patterns: [/trade receivables/i, /accounts receivable/i, /kundefordringer/i],
    priority: 65,
  },
  {
    concept: 'inventories',
    label: 'Inventories',
    statementKind: 'balance_sheet',
    patterns: [/inventor/i, /varelager/i],
    priority: 65,
  },
  {
    concept: 'total_assets',
    label: 'Total assets',
    statementKind: 'balance_sheet',
    patterns: [/^total assets$/i, /\bsum eiendeler\b/i],
    priority: 100,
  },
  {
    concept: 'total_equity',
    label: 'Total equity',
    statementKind: 'balance_sheet',
    patterns: [/^total equity$/i, /\bsum egenkapital\b/i],
    priority: 95,
  },
  {
    concept: 'total_liabilities',
    label: 'Total liabilities',
    statementKind: 'balance_sheet',
    patterns: [/^total liabilities$/i, /\bsum gjeld\b/i],
    priority: 95,
  },
  {
    concept: 'total_equity_and_liabilities',
    label: 'Total equity and liabilities',
    statementKind: 'balance_sheet',
    patterns: [/total equity and liabilities/i, /total liabilities and equity/i, /sum egenkapital.*gjeld/i],
    priority: 100,
  },
  {
    concept: 'share_capital',
    label: 'Share capital',
    statementKind: 'balance_sheet',
    patterns: [/share capital/i, /issued capital/i, /aksjekapital/i],
    priority: 60,
  },
  {
    concept: 'retained_earnings',
    label: 'Retained earnings',
    statementKind: 'balance_sheet',
    patterns: [/retained earnings/i, /annen egenkapital/i],
    priority: 60,
  },
  {
    concept: 'current_liabilities',
    label: 'Current liabilities',
    statementKind: 'balance_sheet',
    patterns: [/current liabilities/i, /kortsiktig gjeld/i],
    priority: 70,
  },
  {
    concept: 'non_current_liabilities',
    label: 'Non-current liabilities',
    statementKind: 'balance_sheet',
    patterns: [/non-current liabilities/i, /non current liabilities/i, /langsiktig gjeld/i],
    priority: 70,
  },
  {
    concept: 'trade_payables',
    label: 'Trade payables',
    statementKind: 'balance_sheet',
    patterns: [/trade payables/i, /accounts payable/i, /leverandørgjeld/i],
    priority: 62,
  },
  {
    concept: 'borrowings',
    label: 'Borrowings',
    statementKind: 'balance_sheet',
    patterns: [/borrowings/i, /interest-bearing debt/i, /long term debt/i, /loans/i, /\blån\b/i],
    priority: 62,
  },
  {
    concept: 'operating_cash_flow',
    label: 'Operating cash flow',
    statementKind: 'cash_flow',
    patterns: [/net cash.*operating activities/i, /cash.*from.*operating/i, /operating cash flow/i],
    priority: 95,
  },
  {
    concept: 'investing_cash_flow',
    label: 'Investing cash flow',
    statementKind: 'cash_flow',
    patterns: [/net cash.*investing activities/i, /cash.*from.*investing/i, /investing cash flow/i],
    priority: 85,
  },
  {
    concept: 'financing_cash_flow',
    label: 'Financing cash flow',
    statementKind: 'cash_flow',
    patterns: [/net cash.*financing activities/i, /cash.*from.*financing/i, /financing cash flow/i],
    priority: 85,
  },
  {
    concept: 'net_increase_cash',
    label: 'Net increase in cash',
    statementKind: 'cash_flow',
    patterns: [/net increase.*cash/i, /increase.*decrease.*cash/i],
    priority: 80,
  },
  {
    concept: 'cash_beginning',
    label: 'Cash at beginning of period',
    statementKind: 'cash_flow',
    patterns: [/cash.*beginning/i, /cash.*start/i],
    priority: 70,
  },
  {
    concept: 'cash_end',
    label: 'Cash at end of period',
    statementKind: 'cash_flow',
    patterns: [/cash.*end/i, /cash.*closing/i],
    priority: 88,
  },
]

const STATEMENT_HEADING_RULES: { kind: FinancialStatementKind; patterns: RegExp[] }[] = [
  {
    kind: 'income_statement',
    patterns: [
      /consolidated income statement/i,
      /income statement/i,
      /statement of profit or loss/i,
      /profit and loss account/i,
      /statement of comprehensive income/i,
      /resultatregnskap/i,
    ],
  },
  {
    kind: 'balance_sheet',
    patterns: [
      /balance sheet/i,
      /statement of financial position/i,
      /statement of financial condition/i,
      /\bbalanse\b/i,
    ],
  },
  {
    kind: 'cash_flow',
    patterns: [
      /cash flow statement/i,
      /statement of cash flows/i,
      /kontantstrømoppstilling/i,
      /kontantstromoppstilling/i,
    ],
  },
  {
    kind: 'notes',
    patterns: [/notes? to the/i, /^notes?$/i, /accounting policies/i, /note \d+/i],
  },
]

export function statementKindFromHeading(text: string): FinancialStatementKind {
  for (const rule of STATEMENT_HEADING_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.kind
  }
  return 'unknown'
}

export function classifyConcept(label: string): ConceptRule | undefined {
  return CONCEPT_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(label)))
    .sort((a, b) => b.priority - a.priority)[0]
}

export function statementKindFromLabel(label: string): FinancialStatementKind {
  const concept = classifyConcept(label)
  if (concept) return concept.statementKind

  if (/revenue|sales|profit|loss|income|expense|cost|tax|ebit|resultat/i.test(label)) {
    return 'income_statement'
  }
  if (/assets?|liabilit|equity|inventory|receivable|payable|borrowings?|cash|gjeld|eiendeler|egenkapital/i.test(label)) {
    return 'balance_sheet'
  }
  if (/cash flow|operating activities|investing activities|financing activities|kontantstrøm/i.test(label)) {
    return 'cash_flow'
  }
  return 'unknown'
}

export function statementTitle(kind: FinancialStatementKind): string {
  switch (kind) {
    case 'income_statement':
      return 'Income Statement'
    case 'balance_sheet':
      return 'Balance Sheet'
    case 'cash_flow':
      return 'Cash Flow Statement'
    case 'notes':
      return 'Notes deferred'
    case 'unknown':
      return 'Unclassified / Review Needed'
  }
}

export function canonicalLabel(concept: string): string {
  return CONCEPT_RULES.find((rule) => rule.concept === concept)?.label ?? concept
}

