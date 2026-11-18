export type Currency = "CNY" | "USD"

export interface Balance {
  currency: Currency
  total: string
  granted: string
  toppedUp: string
}

export interface Snapshot {
  at: number
  available: boolean
  balances: Balance[]
}

export interface Issue {
  message: string
  retryAt: number
}

export const USAGE_URL = "https://platform.deepseek.com/usage"
export const REFRESH_INTERVAL = 30 * 60 * 1000
const BEIJING_OFFSET = 8 * 60 * 60 * 1000

export function currencyParameter(parameter: string | null | undefined): Currency | undefined {
  const value = parameter?.trim().toUpperCase()
  if (!value) return undefined
  if (value === "CNY" || value === "USD") return value
  throw new Error("小组件参数请留空，或填 CNY / USD")
}

export function displayedCurrency(snapshot: Snapshot | undefined, selection?: Currency): Currency | undefined {
  if (selection) return selection
  const balances = snapshot?.balances ?? []
  const active = balances.filter(balance => Number(balance.total) !== 0)
  const choices = active.length ? active : balances
  return choices.find(balance => balance.currency === "CNY")?.currency ?? choices[0]?.currency
}

export function mark(currency: Currency): string {
  return currency === "CNY" ? "¥" : "$"
}

export function widgetAmount(raw: string, compact = false): string {
  const value = Number(raw)
  const absolute = Math.abs(value)
  if (absolute >= 1e12) return value.toExponential(1)
  if (absolute >= (compact ? 1000 : 100_000)) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)
  }
  if (absolute > 0 && absolute < 0.0001) return value < 0 ? ">−0.0001" : "<0.0001"
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: absolute < 1 ? 4 : 2 })
}

export function stamp(at: number, short = false): string {
  const iso = new Date(at + BEIJING_OFFSET).toISOString()
  return short ? iso.slice(11, 16) : iso.slice(5, 10) + " " + iso.slice(11, 16)
}

export function retryAfter(header: string | null, now: number): number {
  if (!header) return now + 5 * 60 * 1000
  const value = header.trim()
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now
  if (!Number.isFinite(delay)) return now + 5 * 60 * 1000
  return now + Math.min(24 * 60 * 60 * 1000, Math.max(60_000, delay))
}
