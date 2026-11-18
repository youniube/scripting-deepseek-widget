import { Button, Dialog, HStack, Link, List, Navigation, NavigationStack, ProgressView, Script, Section, SecureField, Spacer, Text, VStack, Widget, useEffect, useState } from "scripting"
import { BalanceView, KEYS_URL, displayedCurrency, mark, stamp, widgetAmount } from "./balance"
import { PlatformView, currentPlatform, loadPlatform, removePlatformToken, savePlatformToken } from "./platform"
import { currentBalance, loadBalance, removeKey, saveKey } from "./service"
import { Money, costText, hitRate, modelDetails, periodOf } from "./usage"

const widgetPreviews = [
  { family: "systemSmall", label: "小号" },
  { family: "systemMedium", label: "中号" },
  { family: "systemLarge", label: "大号" },
] as const

function readLocal(read: () => BalanceView): BalanceView {
  try {
    return read()
  } catch {
    return { configured: false, issue: { message: "本机配置无法读取，请确认设备已解锁", retryAt: 0 } }
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return <HStack spacing={12}>
    <Text>{label}</Text><Spacer /><Text monospacedDigit lineLimit={2}>{value}</Text>
  </HStack>
}

function formatCosts(value?: Money): string {
  return (["CNY", "USD"] as const).filter(code => value?.[code] != null)
    .map(code => costText(value, code)).join(" / ") || "—"
}

function PlatformDetails({ view }: { view: PlatformView }) {
  const counts = view.amount?.total
  const models = modelDetails(view.amount, view.cost)
  return <>
    <Section header={<Text>本月用量 · {periodOf().month}</Text>}
      footer={<Text>按北京时间统计。</Text>}>
      <Detail label="月费用" value={formatCosts(view.cost?.total)} />
      <Detail label="Tokens" value={counts?.tokens.toLocaleString("en-US") ?? "—"} />
      <Detail label="请求" value={counts?.requests.toLocaleString("en-US") ?? "—"} />
      <Detail label="缓存命中率" value={hitRate(counts)} />
    </Section>
    {models.length > 0 ? <Section header={<Text>模型明细</Text>}>
      {models.map(row => <VStack key={row.model} alignment="leading" spacing={4}>
        <Text fontWeight="semibold">{row.model}</Text>
        <Detail label="Tokens" value={row.tokens?.toLocaleString("en-US") ?? "—"} />
        <Detail label="费用" value={formatCosts(row.cost)} />
      </VStack>)}
    </Section> : null}
  </>
}

function Main({ initial, initialPlatform }: { initial: BalanceView; initialPlatform: PlatformView }) {
  const dismiss = Navigation.useDismiss()
  const [balance, setBalance] = useState(initial)
  const [platform, setPlatform] = useState(initialPlatform)
  const [key, setKey] = useState("")
  const [token, setToken] = useState("")
  const [working, setWorking] = useState<string | null>(null)
  const view = platform.configured ? platform : balance
  const latest = view.latest
  const primaryCurrency = displayedCurrency(latest)
  const primary = latest?.balances.find(item => item.currency === primaryCurrency)

  async function update(action: () => Promise<void>, label: string, reload = false) {
    if (working) return
    setWorking(label)
    try {
      await action()
      if (reload) Widget.reloadAll()
    } catch (error) {
      await Dialog.alert({ title: "操作未完成", message: error instanceof Error ? error.message : "请稍后重试" })
    } finally { setWorking(null) }
  }

  async function refresh(force = false) {
    if (platform.configured) setPlatform(await loadPlatform(force))
    else setBalance(await loadBalance(force))
  }

  useEffect(() => {
    if (view.configured) void update(() => refresh(), "正在查询 DeepSeek")
  }, [])

  function save() {
    return update(async () => {
      setBalance(await saveKey(key))
      setKey("")
    }, "正在验证 API Key", true)
  }

  async function remove() {
    if (!await Dialog.confirm({
      title: "清除本机 API Key？",
      message: "本机保存的 API Key 和对应余额缓存会一并清除。",
      confirmLabel: "清除",
      cancelLabel: "取消",
    })) return
    return update(async () => {
      setBalance(removeKey())
      setKey("")
    }, "正在清除 API Key", true)
  }

  function saveToken() {
    return update(async () => {
      setPlatform(await savePlatformToken(token))
      setToken("")
    }, "正在验证开放平台凭据", true)
  }

  async function removeToken() {
    if (!await Dialog.confirm({
      title: "清除本机平台登录凭据？",
      message: "本机保存的 userToken 和该账号的余额及用量缓存会一并清除。",
      confirmLabel: "清除",
      cancelLabel: "取消",
    })) return
    return update(async () => {
      setPlatform(removePlatformToken())
      setToken("")
      setBalance(await loadBalance())
    }, "正在清除平台登录凭据", true)
  }

  function balanceText(raw: string, code: Parameters<typeof mark>[0]): string {
    return mark(code) + (platform.configured ? widgetAmount(raw) : raw)
  }

  return <NavigationStack>
    <List navigationTitle="DeepSeek 用量" listStyle="insetGrouped"
      toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}>
      <Section header={<Text>{platform.configured ? "开放平台账户" : "API 账户余额"}</Text>}
        footer={<Text>更新时间使用北京时间。</Text>}>
        {latest ? <>
          {!platform.configured ? <Detail label="账户状态" value={latest.available ? "余额可用" : "余额不可用"} /> : null}
          {primary ? <Detail label="可用总余额" value={balanceText(primary.total, primary.currency)} /> : null}
          <Detail label="余额更新于" value={stamp(latest.at)} />
          {latest.balances.length === 0 ? <Text foregroundStyle="secondaryLabel">接口未返回余额明细。</Text> : null}
        </> : <Text foregroundStyle="secondaryLabel">
          {view.configured ? "等待余额数据" : "配置开放平台 userToken，或添加 API Key 查看余额。"}
        </Text>}
        {view.issue ? <Text font="caption" foregroundStyle="secondaryLabel">{view.issue.message}
          {latest ? " · 可能显示缓存" : ""}{view.issue.retryAt > Date.now() ? ` · ${stamp(view.issue.retryAt)} 后可重试` : ""}
        </Text> : null}
        {working ? <HStack spacing={8}><ProgressView /><Text>{working}</Text></HStack> : null}
        <Button title={platform.configured ? "刷新余额与用量" : "刷新余额"} systemImage="arrow.clockwise" disabled={!view.configured || !!working}
          action={() => update(() => refresh(true), "正在查询 DeepSeek", true)} />
      </Section>
      {platform.configured ? <PlatformDetails view={platform} /> : null}
      <Section header={<Text>开放平台登录凭据</Text>}
        footer={<Text>启用后，小组件显示该平台账号的余额与本月用量。userToken 保存在本机 Keychain。</Text>}>
        <SecureField title="userToken" value={token} onChanged={setToken}
          prompt={platform.configured ? "已配置 · 可粘贴新凭据" : "粘贴开放平台登录 userToken"} />
        <Button title={platform.configured ? "验证并更新平台凭据" : "验证并启用平台用量"}
          disabled={!token.trim() || !!working} action={saveToken} />
        {platform.configured ? <Button title="清除本机平台登录凭据" role="destructive" disabled={!!working} action={removeToken} /> : null}
        {initialPlatform.issue && !platform.configured ? <Text font="caption">{initialPlatform.issue.message}</Text> : null}
      </Section>
      <Section header={<Text>API Key</Text>} footer={<Text>API Key 用于余额模式，凭据保存在本机 Keychain。</Text>}>
        <SecureField title="API Key" value={key} onChanged={setKey}
          prompt={balance.configured ? "已配置 · 可粘贴新 Key" : "粘贴 DeepSeek API Key"} />
        <Button title={balance.configured ? "验证并更新" : "验证并保存"} disabled={!key.trim() || !!working} action={save} />
        <Link url={KEYS_URL}>前往 DeepSeek 管理 API Key</Link>
        {balance.configured ? <Button title="清除本机 API Key" role="destructive" disabled={!!working} action={remove} /> : null}
      </Section>
      <Section header={<Text>小组件预览</Text>}>
        {widgetPreviews.map(item => <Button key={item.family} title={item.label}
          action={() => Widget.preview({ family: item.family })} />)}
      </Section>
    </List>
  </NavigationStack>
}

async function run() {
  try {
    await Navigation.present({ element: <Main initial={readLocal(currentBalance)} initialPlatform={readLocal(currentPlatform)} /> })
  } finally { Script.exit() }
}

void run()
