import { fetch } from "scripting"
import { BalanceView, Issue, REFRESH_INTERVAL, Snapshot, parseSnapshot, retryAfter } from "./balance"

const ENDPOINT = "https://api.deepseek.com/user/balance"
const KEYCHAIN_KEY = "deepseek-usage.v1.credentials"
const CACHE_PREFIX = "deepseek-usage.v1.cache."
const keychainOptions = { synchronizable: false, accessibility: "first_unlock_this_device" } as const

interface Credential { id: string; key: string }
interface Cache { latest?: Snapshot; issue?: Issue }

class BalanceError extends Error {
  constructor(message: string, readonly retryAt: number) { super(message) }
}

function credential(): Credential | undefined {
  const value = Keychain.get(KEYCHAIN_KEY, keychainOptions)
  if (!value) return undefined
  let item: Partial<Credential>
  try { item = JSON.parse(value) as Partial<Credential> } catch { throw new Error("本机 API Key 配置无法读取") }
  if (typeof item?.id !== "string" || typeof item?.key !== "string") throw new Error("本机 API Key 配置无法读取")
  return { id: item.id, key: item.key }
}

function cache(id: string): Cache {
  const stored = Storage.get<Cache & { history?: Snapshot[] }>(CACHE_PREFIX + id)
  if (!stored) return {}
  // 1.0.0 stored a newest-first history. Read its latest balance until the next refresh.
  const { history, ...result } = stored
  if (!result.latest && history?.[0]) result.latest = history[0]
  return result
}

function writeCache(id: string, data: Cache): void {
  if (!Storage.set(CACHE_PREFIX + id, data)) throw new Error("余额缓存写入失败")
}

export function currentBalance(): BalanceView {
  const saved = credential()
  return saved ? { configured: true, ...cache(saved.id) } : { configured: false }
}

async function queryBalance(key: string): Promise<Snapshot> {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: "GET",
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      timeout: 10,
      handleRedirect: async () => null,
    })
  } catch {
    throw new BalanceError("网络异常或请求超时", Date.now() + 5 * 60_000)
  }

  if (!response.ok) {
    const now = Date.now()
    switch (response.status) {
      case 401: throw new BalanceError("API Key 无效，请更新", now + REFRESH_INTERVAL)
      case 403: throw new BalanceError("DeepSeek 拒绝访问（403）", now + REFRESH_INTERVAL)
      case 429: throw new BalanceError("DeepSeek 请求限流", retryAfter(response.headers.get("retry-after"), now))
      default: throw new BalanceError(`DeepSeek 查询失败（HTTP ${response.status}）`, now + 5 * 60_000)
    }
  }

  let body: unknown
  try { body = await response.json() } catch { throw new Error("DeepSeek 返回的内容无法读取") }
  return parseSnapshot(body)
}

export async function saveKey(input: string): Promise<BalanceView> {
  const key = input.trim()
  if (!key || /\s/.test(key)) throw new Error("请填写完整的单行 API Key")
  const previous = credential()
  const snapshot = await queryBalance(key)
  if (credential()?.id !== previous?.id) throw new Error("API Key 已变更，请重新打开设置")

  if (previous?.key === key) {
    writeCache(previous.id, { latest: snapshot })
    return currentBalance()
  }

  // 先写入新缓存，再切换 Keychain 中的凭据。失败时旧凭据和余额仍可继续使用。
  const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
  writeCache(id, { latest: snapshot })
  if (!Keychain.set(KEYCHAIN_KEY, JSON.stringify({ id, key }), keychainOptions)) {
    Storage.remove(CACHE_PREFIX + id)
    throw new Error("Keychain 写入失败，请解锁后重试")
  }
  if (previous) Storage.remove(CACHE_PREFIX + previous.id)
  return currentBalance()
}

export function removeKey(): BalanceView {
  const saved = credential()
  if (saved && !Keychain.remove(KEYCHAIN_KEY, keychainOptions)) throw new Error("Keychain 清除失败")
  if (saved) Storage.remove(CACHE_PREFIX + saved.id)
  return currentBalance()
}

const inFlight = new Map<string, Promise<BalanceView>>()

async function refresh(saved: Credential, started: number): Promise<BalanceView> {
  let snapshot: Snapshot
  try {
    snapshot = await queryBalance(saved.key)
  } catch (error) {
    if (credential()?.id !== saved.id) return currentBalance()
    const previous = cache(saved.id)
    if ((previous.latest?.at ?? 0) >= started) return { configured: true, ...previous }
    const issue = {
      message: error instanceof Error ? error.message : "余额查询失败",
      retryAt: error instanceof BalanceError ? error.retryAt : Date.now() + 5 * 60_000,
    }
    // 缓存本身不可写时，仍然把旧数据与当前错误交给界面。
    const result = { ...previous, issue }
    try { writeCache(saved.id, result) } catch { /* 当前执行仍可使用 result。 */ }
    return { configured: true, ...result }
  }

  if (credential()?.id !== saved.id) return currentBalance()
  const previous = cache(saved.id)
  if (previous.latest && previous.latest.at > snapshot.at) return { configured: true, ...previous }
  const result = { latest: snapshot }
  try {
    writeCache(saved.id, result)
    return { configured: true, ...result }
  } catch {
    return { configured: true, ...result, issue: { message: "本次余额未能缓存", retryAt: Date.now() + 5 * 60_000 } }
  }
}

export async function loadBalance(force = false): Promise<BalanceView> {
  const saved = credential()
  if (!saved) return { configured: false }
  const pending = inFlight.get(saved.id)
  if (pending) return pending

  const previous = cache(saved.id)
  const now = Date.now()
  if (previous.issue && previous.issue.retryAt > now) return { configured: true, ...previous }
  const maxAge = force ? 15_000 : REFRESH_INTERVAL
  const latest = previous.latest
  if (!previous.issue && latest && now >= latest.at && now - latest.at < maxAge) {
    return { configured: true, ...previous }
  }

  const task = refresh(saved, now)
  inFlight.set(saved.id, task)
  try { return await task } finally { inFlight.delete(saved.id) }
}
