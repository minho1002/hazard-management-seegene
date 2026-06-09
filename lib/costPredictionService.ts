import type { Defect } from './store'

export interface CostPredictionInput {
  categoryId: number | null
  severity: string
  causeCategory?: string | null
  rootCause?: string | null
  locationText?: string | null
}

export interface SimilarCase {
  id: number
  title: string
  totalCost: number
  severity: string
  causeCategory: string | null | undefined
  score: number
}

export interface CostPrediction {
  estimatedCostMin: number
  estimatedCostAvg: number
  estimatedCostMax: number
  confidence: '낮음' | '중간' | '높음'
  similarCount: number
  similarCases: SimilarCase[]
  basedOn: 'history' | 'baseline' | 'combined'
}

// ── Rule-based baseline: categoryId × severity → [min, avg, max] ────────────
const BASELINE: Record<number, Record<string, [number, number, number]>> = {
  1: { low: [100000, 400000, 1200000], medium: [300000, 900000, 2500000], high: [500000, 1500000, 4000000], critical: [1000000, 3000000, 8000000] },
  2: { low: [200000, 600000, 1500000], medium: [500000, 1500000, 4000000], high: [800000, 2500000, 7000000], critical: [1500000, 4500000, 12000000] },
  3: { low: [100000, 300000, 800000], medium: [200000, 700000, 2000000], high: [400000, 1200000, 3500000], critical: [800000, 2500000, 6000000] },
  4: { low: [50000, 200000, 600000], medium: [150000, 500000, 1500000], high: [300000, 1000000, 3000000], critical: [600000, 2000000, 5000000] },
}
const FALLBACK: [number, number, number] = [200000, 800000, 2500000]

function getBaseline(categoryId: number | null, severity: string): [number, number, number] {
  if (!categoryId) return FALLBACK
  return BASELINE[categoryId]?.[severity] ?? FALLBACK
}

// ── Percentile helper (input must be sorted ascending) ───────────────────────
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo))
}

function round10k(n: number): number {
  return Math.round(n / 10000) * 10000
}

// ── Similarity scoring ────────────────────────────────────────────────────────
function score(defect: Defect, input: CostPredictionInput): number {
  let s = 0
  if (defect.severity === input.severity) s += 3
  if (input.causeCategory && defect.causeCategory &&
      defect.causeCategory === input.causeCategory) s += 4
  if (input.rootCause && defect.rootCause) {
    const a = defect.rootCause, b = input.rootCause!
    if (a.includes(b) || b.includes(a)) s += 3
  }
  if (input.locationText && defect.locationText) {
    const words = input.locationText.split(/\s+/).filter(w => w.length > 1)
    const dl = defect.locationText.toLowerCase()
    if (words.some(w => dl.includes(w.toLowerCase()))) s += 2
  }
  return s
}

// ── Core prediction function ─────────────────────────────────────────────────
export function predictCost(defects: Defect[], input: CostPredictionInput): CostPrediction {
  const [bMin, bAvg, bMax] = getBaseline(input.categoryId, input.severity)

  if (!input.categoryId) {
    return { estimatedCostMin: bMin, estimatedCostAvg: bAvg, estimatedCostMax: bMax, confidence: '낮음', similarCount: 0, similarCases: [], basedOn: 'baseline' }
  }

  const candidates = defects
    .filter(d => d.categoryId === input.categoryId && d.totalCost > 0)
    .map(d => ({ defect: d, score: score(d, input) }))
    .sort((a, b) => b.score - a.score || b.defect.totalCost - a.defect.totalCost)
    .slice(0, 10)

  if (candidates.length === 0) {
    return { estimatedCostMin: bMin, estimatedCostAvg: bAvg, estimatedCostMax: bMax, confidence: '낮음', similarCount: 0, similarCases: [], basedOn: 'baseline' }
  }

  const costs = candidates.map(c => c.defect.totalCost).sort((a, b) => a - b)
  const hMin = percentile(costs, 10)
  const hAvg = Math.round(costs.reduce((s, v) => s + v, 0) / costs.length)
  const hMax = percentile(costs, 90)

  let estimatedCostMin: number, estimatedCostAvg: number, estimatedCostMax: number
  let basedOn: CostPrediction['basedOn']

  if (candidates.length >= 3) {
    estimatedCostMin = round10k(hMin)
    estimatedCostAvg = round10k(hAvg)
    estimatedCostMax = round10k(hMax)
    basedOn = 'history'
  } else {
    estimatedCostMin = round10k(hMin * 0.5 + bMin * 0.5)
    estimatedCostAvg = round10k(hAvg * 0.5 + bAvg * 0.5)
    estimatedCostMax = round10k(hMax * 0.5 + bMax * 0.5)
    basedOn = 'combined'
  }

  const confidence: CostPrediction['confidence'] =
    candidates.length >= 5 ? '높음' :
    candidates.length >= 2 ? '중간' : '낮음'

  const similarCases: SimilarCase[] = candidates.slice(0, 5).map(c => ({
    id: c.defect.id,
    title: c.defect.title,
    totalCost: c.defect.totalCost,
    severity: c.defect.severity,
    causeCategory: c.defect.causeCategory,
    score: c.score,
  }))

  return { estimatedCostMin, estimatedCostAvg, estimatedCostMax, confidence, similarCount: candidates.length, similarCases, basedOn }
}

// ── Entry Point (추후 ML 모델로 교체 가능) ────────────────────────────────────
export function estimateCost(defects: Defect[], input: CostPredictionInput): CostPrediction {
  return predictCost(defects, input)
}
