export interface SearchCondition {
  keyword: string | null
  category: string | null
  location: string | null
  rootCause: string | null
  dateRange: { start: Date | null; end: Date | null }
  sortBy: 'recurrenceCount' | 'totalCost' | 'createdAt' | null
}

const CATEGORY_RULES: [string[], string][] = [
  [['누수', '물샘', '방수', '배관 누수'], '누수'],
  [['전기', '차단기', '분전반', '누전', '배선', '케이블'], '전기'],
  [['hvac', '공조', '냉방', '난방', '에어컨', '환기', '덕트', '냉매', '팬코일'], 'HVAC'],
  [['균열', '크랙', '금이', '파손'], '균열'],
]

const LOCATION_PATTERNS: RegExp[] = [
  /지하\s*\d+층/,
  /\d+층/,
  /rf층|옥탑층/,
  /(전기실|기계실|주차장|로비|화장실|계단실|복도|회의실|사무실|창고|옥상|탕비실|탈의실|검사실|채혈실)/,
]

const CAUSE_RULES: [string[], string][] = [
  [['부식', '삭음', '녹슬', '노후', '낡은', '오래'], '설비 노후'],
  [['시공', '부실', '공사 불량', '잘못'], '시공하자'],
  [['막힘', '배수 불량', '역류', '막혀'], '유지관리 미흡'],
  [['방수층'], '방수층 결함'],
  [['침하', '구조 균열'], '구조적 결함'],
  [['누전', '합선', '과부하', '절연'], '전기 결함'],
]

const KEYWORD_PATTERNS: RegExp[] = [
  /배관|파이프|조인트|쪼인트/,
  /천장/,
  /외벽|내벽|벽체/,
  /창호|창문|유리/,
  /엘리베이터|승강기/,
  /소방|스프링클러|소화/,
  /펌프|밸브|급수|온수|냉수|급탕/,
]

export function parseNaturalQuery(text: string): SearchCondition {
  const t = text.trim()
  const lower = t.toLowerCase()

  const result: SearchCondition = {
    keyword: null,
    category: null,
    location: null,
    rootCause: null,
    dateRange: { start: null, end: null },
    sortBy: null,
  }

  if (!t) return result

  // ─ Date range ─
  const now = new Date()
  if (/지난\s*달|저번\s*달/.test(lower)) {
    result.dateRange = {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    }
  } else if (/이번\s*달|이\s*달/.test(lower)) {
    result.dateRange = {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  } else if (/올해|이번\s*년|이번\s*해/.test(lower)) {
    result.dateRange = {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    }
  } else if (/지난\s*주|저번\s*주/.test(lower)) {
    const dow = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) - 7)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    result.dateRange = { start: monday, end: sunday }
  } else if (/이번\s*주/.test(lower)) {
    const dow = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    result.dateRange = { start: monday, end: sunday }
  } else {
    const recentMatch = lower.match(/최근\s*(\d+)\s*일/)
    if (recentMatch) {
      const days = parseInt(recentMatch[1])
      const start = new Date(now)
      start.setDate(now.getDate() - days)
      start.setHours(0, 0, 0, 0)
      result.dateRange = { start, end: now }
    }
  }

  // ─ Sort ─
  if (/많이\s*발생|재발|빈도|자주/.test(lower)) {
    result.sortBy = 'recurrenceCount'
  } else if (/비용|금액|많이\s*사용|돈|예산/.test(lower)) {
    result.sortBy = 'totalCost'
  } else if (/최신|최근\s*등록|날짜순/.test(lower)) {
    result.sortBy = 'createdAt'
  }

  // ─ Category ─
  for (const [kws, cat] of CATEGORY_RULES) {
    if (kws.some(kw => lower.includes(kw))) { result.category = cat; break }
  }

  // ─ Location ─
  for (const pat of LOCATION_PATTERNS) {
    const m = lower.match(pat)
    if (m) { result.location = m[0]; break }
  }

  // ─ Root cause ─
  for (const [kws, cause] of CAUSE_RULES) {
    if (kws.some(kw => lower.includes(kw))) { result.rootCause = cause; break }
  }

  // ─ Keyword: facility/component terms not captured by other rules ─
  for (const pat of KEYWORD_PATTERNS) {
    const m = t.match(pat)
    if (m) { result.keyword = m[0]; break }
  }

  return result
}

export function hasConditions(c: SearchCondition): boolean {
  return !!(
    c.keyword || c.category || c.location || c.rootCause ||
    c.dateRange.start || c.dateRange.end || c.sortBy
  )
}

export const SORT_BY_LABELS: Record<string, string> = {
  recurrenceCount: '재발 빈도순',
  totalCost: '비용 높은순',
  createdAt: '최신 등록순',
}

export function fmtDateRange(dr: SearchCondition['dateRange']): string {
  if (!dr.start && !dr.end) return ''
  const fmt = (d: Date) => d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
  if (dr.start && dr.end) return `${fmt(dr.start)} ~ ${fmt(dr.end)}`
  if (dr.start) return `${fmt(dr.start)} ~`
  return `~ ${fmt(dr.end!)}`
}

// ── Entry Point (추후 LLM으로 교체 가능) ──────────────────────────────────────
export function analyzeSearchQuery(text: string): SearchCondition {
  return parseNaturalQuery(text)
  // LLM 전환 시: return await llmParseQuery(text)
}
