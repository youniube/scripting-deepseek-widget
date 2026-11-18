import { fetch } from "scripting"
import { Issue, REFRESH_INTERVAL, Snapshot, USAGE_URL, retryAfter } from "./balance"
import { MonthlyAmount, MonthlyCost, object, parseMonthlyAmount, parseMonthlyCost, parsePlatformBalance, periodOf } from "./usage"

const ORIGIN = "https://platform.deepseek.com"
const KEY = "deepseek-usage.v1.platform-token"
const PREFIX = "deepseek-usage.v1.platform-cache."
const access = { synchronizable: false, accessibility: "first_unlock_this_device" } as const

export interface PlatformView {
  configured: boolean
  latest?: Snapshot
  issue?: Issue
  checkedAt?: number
  dataAt?: number
  amount?: MonthlyAmount
  cost?: MonthlyCost
}

type Cache = Omit<PlatformView, "configured">
type Period = ReturnType<typeof periodOf>
interface Login { id: string; token: string }

class PlatformError extends Error {
  constructor(message: string, readonly retryAt: number, readonly routeMissing = false) { super(message) }
}

function login(): Login | undefined {
  const raw = Keychain.get(KEY, access)
  if (!raw) return undefined
  try {
    const value = object(JSON.parse(raw))
    if (typeof value.id === "string" && typeof value.token === "string") return { id: value.id, token: value.token }
  } catch { /* Do not expose a stored credential in a parser error. */ }
  throw new Error("本机平台登录凭据无法读取")
}

function readCache(id: string): Cache {
  const data = { ...Storage.get<Cache>(PREFIX + id) }
  const month = periodOf().month
  if (data.amount?.month !== month) delete data.amount
  if (data.cost?.month !== month) delete data.cost
  return data
}

function writeCache(id: string, value: Cache) {
  if (!Storage.set(PREFIX + id, value)) throw new Error("平台用量缓存写入失败")
}

export function currentPlatform(): PlatformView {
  const saved = login()
  return saved ? { configured: true, ...readCache(saved.id) } : { configured: false }
}

async function request(path: string, token: string): Promise<unknown> {
  let response
  try {
    response = await fetch(ORIGIN + path, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json", "x-client-platform": "web", Referer: USAGE_URL },
      timeout: 10,
      handleRedirect: async () => null,
    })
  } catch {
    throw new PlatformError("开放平台网络异常或请求超时", Date.now() + 5 * 60_000)
  }

  const now = Date.now()
  if (response.status === 401 || (response.status >= 300 && response.status < 400)) throw expired(now)
  if (response.status === 403) throw new PlatformError("开放平台拒绝访问（403），请检查登录凭据", now + REFRESH_INTERVAL)
  if (response.status === 429) throw new PlatformError("开放平台请求受限（429）", retryAfter(response.headers.get("retry-after"), now))
  if (!response.ok) {
    throw new PlatformError(`开放平台请求失败（HTTP ${response.status}）`, now + 5 * 60_000,
      response.status === 404 || response.status === 410)
  }

  let body: unknown
  try { body = await response.json() } catch { throw new Error("开放平台未返回可读的数据") }
  const envelope = object(body)
  if (String(envelope.code) === "40003") throw expired(now)
  if (String(envelope.code) !== "0") throw new Error("开放平台未完成数据查询")
  const data = object(envelope.data)
  if (String(data.biz_code) === "40003") throw expired(now)
  if (data.biz_code != null && String(data.biz_code) !== "0") throw new Error("开放平台未返回用量数据")
  return data.biz_data ?? data
}

function expired(now: number) {
  return new PlatformError("开放平台 userToken 失效，请重新登录后更新", now + REFRESH_INTERVAL)
}

async function monthly<T>(kind: "amount" | "cost", token: string, period: Period,
  parse: (data: unknown, period: Period, legacy?: boolean) => T): Promise<T> {
  try {
    return parse(await request(`/api/v0/usage/by_api_key/${kind}?${period.query}`, token), period)
  } catch (error) {
    if (!(error instanceof PlatformError && error.routeMissing)) throw error
    const data = await request(`/api/v0/usage/${kind}?${period.legacyQuery}`, token)
    return parse(data, period, true)
  }
}

function issueFor(errors: unknown[], now: number): Issue | undefined {
  if (!errors.length) return undefined
  const primary = errors.find(error => error instanceof Error && error.message.includes("userToken")) ?? errors[0]
  return {
    message: primary instanceof Error ? primary.message : "开放平台查询失败",
    retryAt: Math.max(...errors.map(error => error instanceof PlatformError ? error.retryAt : now + 5 * 60_000)),
  }
}

async function query(token: string): Promise<Cache> {
  const period = periodOf()
  const [wallet, amount, cost] = await Promise.allSettled([
    request("/api/v0/users/get_user_summary", token).then(data => parsePlatformBalance(data)),
    monthly("amount", token, period, parseMonthlyAmount),
    monthly("cost", token, period, parseMonthlyCost),
  ])
  const now = Date.now()
  const errors = [wallet, amount, cost].filter(result => result.status === "rejected").map(result => result.reason)
  const issue = issueFor(errors, now)
  const result: Cache = { checkedAt: now }
  if (issue) result.issue = issue
  if (wallet.status === "fulfilled") result.latest = wallet.value
  if (periodOf(now).month === period.month) {
    if (amount.status === "fulfilled") result.amount = amount.value
    if (cost.status === "fulfilled") result.cost = cost.value
  }
  if (result.latest || result.amount || result.cost) result.dataAt = now
  return result
}

export async function savePlatformToken(input: string): Promise<PlatformView> {
  const token = input.trim()
  if (!token || /\s/.test(token)) throw new Error("请填写完整的单行开放平台 userToken")
  if (token.startsWith("sk-")) throw new Error("这里需要网页登录的 userToken，请从开放平台网页获取")
  const previous = login()
  const result = await query(token)
  if (!result.latest && !result.amount && !result.cost) throw new Error(result.issue?.message ?? "开放平台暂未返回数据")
  if (login()?.id !== previous?.id) throw new Error("平台登录凭据已变更，请重新打开设置")

  if (previous?.token === token) {
    const data = { ...readCache(previous.id), issue: undefined, ...result }
    writeCache(previous.id, data)
    return { configured: true, ...data }
  }

  const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
  writeCache(id, result)
  if (!Keychain.set(KEY, JSON.stringify({ id, token }), access)) {
    Storage.remove(PREFIX + id)
    throw new Error("平台登录凭据写入失败，请解锁后重试")
  }
  if (previous) Storage.remove(PREFIX + previous.id)
  return { configured: true, ...result }
}

export function removePlatformToken(): PlatformView {
  const saved = login()
  if (!saved) return { configured: false }
  if (!Keychain.remove(KEY, access)) throw new Error("本机平台登录凭据清除失败")
  Storage.remove(PREFIX + saved.id)
  return { configured: false }
}

const inFlight = new Map<string, Promise<PlatformView>>()

async function refresh(saved: Login): Promise<PlatformView> {
  const fetched = await query(saved.token)
  if (login()?.id !== saved.id) return currentPlatform()
  const data = { ...readCache(saved.id), issue: undefined, ...fetched }
  try { writeCache(saved.id, data) } catch {
    data.issue = fetched.issue ?? { message: "本次用量未能缓存", retryAt: Date.now() + 5 * 60_000 }
  }
  return { configured: true, ...data }
}

export async function loadPlatform(force = false): Promise<PlatformView> {
  const saved = login()
  if (!saved) return { configured: false }
  const pending = inFlight.get(saved.id)
  if (pending) return pending

  const data = readCache(saved.id)
  const now = Date.now()
  const age = now - (data.checkedAt ?? 0)
  if ((data.issue && now < data.issue.retryAt) ||
      (data.amount && data.cost && !data.issue && age >= 0 && age < (force ? 15_000 : REFRESH_INTERVAL))) {
    return { configured: true, ...data }
  }

  const task = refresh(saved)
  inFlight.set(saved.id, task)
  try { return await task } finally { inFlight.delete(saved.id) }
}

export function nextPlatformRefresh(view: PlatformView, now = Date.now()): Date {
  const next = view.issue?.retryAt ?? (view.checkedAt ?? now) + REFRESH_INTERVAL
  const rollover = periodOf(now).end * 1000
  return new Date(Math.max(now + 60_000, Math.min(next, rollover)))
}
