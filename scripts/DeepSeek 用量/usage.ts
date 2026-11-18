import { Balance, Currency, Snapshot, mark } from "./balance"

const TZ = 8 * 60 * 60
type ObjectMap = Record<string, unknown>
export type Money = Partial<Record<Currency, number>>

export interface UsageCount {
  tokens: number
  requests: number
  hits: number
  misses: number
  hasCacheBreakdown: boolean
}

export interface MonthlyAmount {
  month: string
  total: UsageCount
  models: Record<string, UsageCount>
}

export interface MonthlyCost {
  month: string
  total: Money
  models: Record<string, Money>
}

function invalid(): never {
  throw new Error("开放平台返回的数据格式有变化")
}

export function object(value: unknown): ObjectMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid()
  return value as ObjectMap
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) return invalid()
  return value
}

function number(value: unknown): number {
  if (typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) value = Number(value)
  if (typeof value !== "number" || !Number.isFinite(value)) return invalid()
  return value
}

function count(value: unknown): number {
  const result = number(value)
  if (!Number.isSafeInteger(result) || result < 0) return invalid()
  return result
}

function currency(value: unknown): Currency {
  if (value !== "CNY" && value !== "USD") return invalid()
  return value
}

function modelName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid()
  return value
}

export function periodOf(at = Date.now()) {
  const local = new Date(at + TZ * 1000)
  const year = local.getUTCFullYear()
  const monthNumber = local.getUTCMonth() + 1
  const month = `${year}.${String(monthNumber).padStart(2, "0")}`
  const start = Date.UTC(year, monthNumber - 1, 1) / 1000 - TZ
  const end = Date.UTC(year, monthNumber, 1) / 1000 - TZ
  return { month, start, end, query: `start=${start}&end=${end}&tz=${TZ}`, legacyQuery: `month=${monthNumber}&year=${year}` }
}

type Period = ReturnType<typeof periodOf>

export function parsePlatformBalance(payload: unknown, at = Date.now()): Snapshot {
  const root = object(payload)
  const wallets = new Map<Currency, { toppedUp: number; granted: number }>()
  for (const [field, component] of [["normal_wallets", "toppedUp"], ["bonus_wallets", "granted"]] as const) {
    const rows = field === "bonus_wallets" && root[field] == null ? [] : list(root[field])
    for (const item of rows) {
      const row = object(item)
      const code = currency(row.currency)
      const wallet = wallets.get(code) ?? { toppedUp: 0, granted: 0 }
      wallet[component] += number(row.balance)
      wallets.set(code, wallet)
    }
  }
  const balances: Balance[] = Array.from(wallets, ([code, wallet]) => ({
    currency: code,
    total: String(wallet.toppedUp + wallet.granted),
    toppedUp: String(wallet.toppedUp),
    granted: String(wallet.granted),
  }))
  return { at, balances, available: balances.some(balance => Number(balance.total) > 0) }
}

function withinPeriod(bucket: ObjectMap, period: Period): boolean {
  const time = count(bucket.time)
  return time >= period.start && time < period.end
}

function emptyCount(): UsageCount {
  return { tokens: 0, requests: 0, hits: 0, misses: 0, hasCacheBreakdown: false }
}

function sumCount(target: UsageCount, source: UsageCount) {
  target.tokens = count(target.tokens + source.tokens)
  target.requests = count(target.requests + source.requests)
  target.hits = count(target.hits + source.hits)
  target.misses = count(target.misses + source.misses)
  target.hasCacheBreakdown ||= source.hasCacheBreakdown
}

function parseCount(row: ObjectMap): UsageCount & { input: number } {
  const hits = count(row.PROMPT_CACHE_HIT_TOKEN ?? 0)
  const misses = count(row.PROMPT_CACHE_MISS_TOKEN ?? 0)
  const output = count(row.RESPONSE_TOKEN ?? 0)
  const input = row.PROMPT_TOKEN == null ? hits + misses : count(row.PROMPT_TOKEN)
  return {
    input, hits, misses,
    tokens: count(input + output),
    requests: count(row.REQUEST ?? 0),
    hasCacheBreakdown: (row.PROMPT_CACHE_HIT_TOKEN != null || row.PROMPT_CACHE_MISS_TOKEN != null) && input === hits + misses,
  }
}

function legacyUsage(rows: unknown): ObjectMap {
  const result: ObjectMap = Object.create(null)
  for (const item of list(rows)) {
    const entry = object(item)
    if (typeof entry.type !== "string") return invalid()
    result[entry.type] = entry.amount
  }
  return result
}

export function parseMonthlyAmount(payload: unknown, period: Period, legacy = false): MonthlyAmount {
  const models = new Map<string, UsageCount>()
  const total = emptyCount()
  let covered = true
  function add(model: string, row: UsageCount & { input: number }) {
    const aggregate = models.get(model) ?? emptyCount()
    sumCount(aggregate, row)
    sumCount(total, row)
    if (row.input > 0 && !row.hasCacheBreakdown) covered = false
    models.set(model, aggregate)
  }

  if (legacy) {
    for (const item of list(Array.isArray(payload) ? payload : object(payload).total)) {
      const row = object(item)
      add(modelName(row.model), parseCount(legacyUsage(row.usage)))
    }
  } else {
    for (const item of list(object(payload).series)) {
      const series = object(item)
      const model = modelName(series.model)
      for (const entry of list(series.buckets)) {
        const bucket = object(entry)
        if (withinPeriod(bucket, period)) add(model, parseCount(object(bucket.usage)))
      }
    }
  }
  total.hasCacheBreakdown &&= covered
  return { month: period.month, total, models: Object.fromEntries(models) }
}

export function parseMonthlyCost(payload: unknown, period: Period, legacy = false): MonthlyCost {
  const total: Money = {}
  const models = new Map<string, Money>()
  function add(model: string, code: Currency, value: number) {
    const aggregate = models.get(model) ?? {}
    aggregate[code] = (aggregate[code] ?? 0) + value
    total[code] = (total[code] ?? 0) + value
    models.set(model, aggregate)
  }

  if (legacy) {
    for (const item of list(Array.isArray(payload) ? payload : [payload])) {
      const group = object(item)
      const code = currency(group.currency ?? "CNY")
      for (const entry of list(group.total)) {
        const row = object(entry)
        const usage = legacyUsage(row.usage)
        const cost = Object.entries(usage).reduce((sum, [type, value]) =>
          type === "REQUEST" || type === "PROMPT_TOKEN" ? sum : sum + number(value), 0)
        add(modelName(row.model), code, cost)
      }
      total[code] ??= 0
    }
  } else {
    for (const item of list(object(payload).data)) {
      const group = object(item)
      const code = currency(group.currency)
      total[code] ??= 0
      for (const entry of list(group.series)) {
        const series = object(entry)
        const model = modelName(series.model)
        for (const value of list(series.buckets)) {
          const bucket = object(value)
          if (withinPeriod(bucket, period)) add(model, code, number(bucket.cost))
        }
      }
    }
  }
  return { month: period.month, total, models: Object.fromEntries(models) }
}

export function hitRate(counts?: UsageCount): string {
  if (!counts?.hasCacheBreakdown || !(counts.hits + counts.misses)) return "—"
  return (counts.hits * 100 / (counts.hits + counts.misses)).toFixed(1) + "%"
}

export function compactTokens(value?: number): string {
  if (value == null) return "—"
  if (value >= 100_000_000) return (value / 100_000_000).toFixed(1) + "亿"
  if (value >= 10_000) return (value / 10_000).toFixed(1) + "万"
  return value.toLocaleString("en-US")
}

export function costText(money?: Money, preferred?: Currency, digits = 4): string {
  const code = preferred ?? (money?.CNY != null ? "CNY" : "USD")
  const value = money?.[code]
  if (value == null) return "—"
  const limit = 10 ** -digits
  if (value > 0 && value < limit) return "<" + mark(code) + limit.toFixed(digits)
  return mark(code) + value.toFixed(digits)
}

export function modelDetails(amount?: MonthlyAmount, cost?: MonthlyCost) {
  const names = new Set([...Object.keys(amount?.models ?? {}), ...Object.keys(cost?.models ?? {})])
  return Array.from(names, model => ({
    model,
    tokens: amount?.models[model]?.tokens,
    cost: cost?.models[model]
  })).sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0) || a.model.localeCompare(b.model))
}

export function modelLabel(model: string): string {
  switch (model) {
    case "deepseek-v4-flash": return "V4 Flash"
    case "deepseek-v4-pro": return "V4 Pro"
    case "deepseek-flash":
    case "deepseek-v4.1-flash": return "V4.1 Flash"
    default: return model
  }
}
