import { HStack, Image, RoundedRectangle, Script, Spacer, Text, VStack, ZStack } from "scripting"
import { Balance, Currency, REFRESH_INTERVAL, displayedCurrency, mark, stamp, widgetAmount } from "./balance"
import { PlatformView } from "./platform"
import { compactTokens, costText, hitRate, modelDetails, modelLabel, periodOf } from "./usage"

function gradient(from: string, to: string) {
  return {
    gradient: [{ color: from, location: 0 }, { color: to, location: 1 }],
    startPoint: { x: 0.05, y: 0 },
    endPoint: { x: 0.95, y: 1 },
  }
}

const color = {
  background: { light: gradient("#F0F5FF", "#CBDCFF"), dark: gradient("#243B96", "#101E4B") },
  primary: { light: "#15254D", dark: "#FFFFFF" },
  secondary: { light: "#455A86", dark: "#D4DFFF" },
  accent: { light: "#2447B7", dark: "#D1DFFF" },
  violet: { light: "#6E3BB4", dark: "#DBC0FF" },
  success: { light: "#14624F", dark: "#A4F2D2" },
  warning: { light: "#8B4A16", dark: "#FFDB9F" },
  panel: { light: "rgba(255,255,255,0.48)", dark: "rgba(190,210,255,0.12)" },
  subtle: { light: "rgba(43,79,170,0.09)", dark: "rgba(190,210,255,0.16)" },
  rule: { light: "#A9BDE7", dark: "rgba(216,228,255,0.32)" },
  logo: { light: "#E9EEFF", dark: "#E3EBFF" },
}

function surface(style: typeof color.panel, cornerRadius: number) {
  return { style, shape: { type: "rect" as const, cornerRadius } }
}

function Rule({ width }: { width: number }) {
  return <RoundedRectangle cornerRadius={0} fill={color.rule}
    frame={{ width, height: 1 }} />
}

function Header({ period, detail, alert = false, compact = false }: {
  period?: string; detail?: string; alert?: boolean; compact?: boolean
}) {
  const size = compact ? 22 : 27
  return <HStack spacing={8} frame={{ height: size }}>
    <ZStack>
      <RoundedRectangle cornerRadius={8} fill={color.logo} frame={{ width: size, height: size }} />
      <Image filePath={`${Script.directory}/deepseek-logo.png`} resizable scaleToFit
        widgetAccentedRenderingMode="fullColor" frame={{ width: compact ? 17 : 21, height: compact ? 13 : 16 }} />
    </ZStack>
    <Text font={compact ? 14 : 15} fontWeight="bold" lineLimit={1}
      foregroundStyle={color.primary}>DeepSeek</Text>
    <Spacer />
    {detail ? <Text font={9} foregroundStyle={alert ? color.warning : color.secondary}
      lineLimit={1} minScaleFactor={0.8} monospacedDigit>{detail}</Text> : null}
    {period ? <Text font={10} fontWeight="semibold" kerning={0.65} lineLimit={1}
      foregroundStyle={color.accent} padding={{ horizontal: 8, vertical: 3 }} background={surface(color.subtle, 7)}>{period}</Text> : null}
  </HStack>
}

function Amount({ balance, label, width }: {
  balance?: Balance; label?: string; width: number
}) {
  const value = balance ? widgetAmount(balance.total) : "—"
  const valueWidth = width - (balance ? 21 : 0)
  const font = Math.min(35, Math.max(21, Math.floor(valueWidth / (value.length * 0.61))))
  return <VStack alignment="leading" spacing={1} frame={{ width, alignment: "leading" }}>
    {label ? <Text font={12} fontWeight="medium" foregroundStyle={color.secondary} lineLimit={1}
      frame={{ width, height: 16, alignment: "leading" }}>{label}</Text> : null}
    <HStack alignment="firstTextBaseline" spacing={5} frame={{ width, height: 38, alignment: "leading" }}>
      {balance ? <Text font={15} fontWeight="semibold" foregroundStyle={color.accent}
        frame={{ width: 16, alignment: "leading" }}>{mark(balance.currency)}</Text> : null}
      <Text font={font} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.85}
        foregroundStyle={color.primary} fixedSize={{ horizontal: false, vertical: true }}
        frame={{ width: valueWidth, alignment: "leading" }}>{value}</Text>
    </HStack>
  </VStack>
}

function Metric({ title, value, tone, width, compact = false }: { title: string; value: string; tone: typeof color.accent; width: number; compact?: boolean }) {
  const inset = compact ? 5 : 7
  return <VStack alignment="leading" spacing={1} padding={{ horizontal: inset, vertical: compact ? 3 : 6 }}
    background={surface(color.panel, 9)}>
    <Text font={compact ? 9 : 10} foregroundStyle={color.secondary} lineLimit={1}
      frame={{ width: width - inset * 2, height: 11, alignment: "leading" }}>{title}</Text>
    <Text font={compact ? 12 : 15} fontWeight="bold" monospacedDigit minScaleFactor={0.72} lineLimit={1}
      foregroundStyle={tone} frame={{ width: width - inset * 2, height: compact ? 14 : 17, alignment: "leading" }}>{value}</Text>
  </VStack>
}

function ModelRow({ rows, currency, width, compact }: {
  rows: ReturnType<typeof modelDetails>; currency?: Currency; width: number; compact: boolean
}) {
  const gap = compact ? 10 : 13
  const leftWidth = Math.floor((width - gap) / 2)
  return <HStack alignment="top" spacing={gap} frame={{ width, alignment: "leading" }}>
    {rows.map((row, i) => {
      const cell = i === 0 ? leftWidth : width - gap - leftWidth
      return <VStack key={row.model} alignment="leading" spacing={1} frame={{ width: cell }}>
        <Text font={compact ? 9 : 11} foregroundStyle={color.secondary} lineLimit={1} minScaleFactor={0.85}
          frame={{ width: cell, height: compact ? 11 : 14, alignment: "leading" }}>{modelLabel(row.model)}</Text>
        <Text font={compact ? 11 : 13} fontWeight="semibold" monospacedDigit minScaleFactor={0.78} lineLimit={1}
          frame={{ width: cell, height: compact ? 12 : 16, alignment: "leading" }}>
          {compactTokens(row.tokens)} · {costText(row.cost, currency, compact ? 2 : 4)}
        </Text>
      </VStack>
    })}
  </HStack>
}

export function DeepSeekWidget({ platform, selection, family, width, now }: {
  platform: PlatformView; selection?: Currency; family: string; width: number; now: number
}) {
  const small = family === "systemSmall"
  const large = family === "systemLarge"
  const inset = large ? 16 : 12
  const content = Math.floor(width) - inset * 2
  const currency = displayedCurrency(platform.latest, selection)
  const balance = platform.latest?.balances.find(item => item.currency === currency)
  const amount = platform.amount?.total
  const costs = platform.cost?.total
  const costCurrency = selection ?? (currency && costs?.[currency] != null ? currency : costs?.CNY != null ? "CNY" : "USD")
  const used = modelDetails(platform.amount, platform.cost)
  const sectionSpacing = small ? 2 : large ? (used.length > 2 ? 10 : 15) : 6
  const when = periodOf(now).month
  const managementURL = Script.createRunURLScheme(Script.name)
  const hasData = !!(platform.latest || platform.amount || platform.cost)
  const status = platform.issue
    ? (hasData ? (platform.checkedAt === platform.dataAt ? "部分数据未更新" : "缓存 · 更新失败") : "平台读取失败")
    : now - (platform.dataAt ?? platform.checkedAt ?? now) > REFRESH_INTERVAL * 2 ? "平台缓存" : undefined
  const updated = platform.dataAt ?? platform.latest?.at
  const hour = updated != null ? stamp(updated, !large || !!status) : ""
  const headerDetail = [status, hour].filter(Boolean).join(" · ")
  const placeholder = platform.issue?.message ??
    (platform.configured ? "等待开放平台数据" : "请先运行脚本，配置开放平台登录凭据")
  const tiles = [
    { title: "月费用", value: costText(costs, costCurrency, 4), tone: color.accent },
    { title: "Tokens", value: compactTokens(amount?.tokens), tone: color.success },
    { title: "请求", value: amount ? amount.requests.toLocaleString("en-US") : "—", tone: color.warning },
    { title: "缓存命中", value: hitRate(amount), tone: color.violet },
  ]
  const gap = large ? 9 : 5
  const columns = large ? 2 : 4
  const tileWidth = Math.floor((content - (columns - 1) * gap) / columns)
  const tileRows = large ? [tiles.slice(0, 2), tiles.slice(2)] : [tiles]
  const walletText = balance ? mark(balance.currency) + widgetAmount(balance.total) : "—"
  const walletLabel = !balance && currency ? `暂无 ${currency} 余额` : undefined
  const walletWidth = large ? content - 26 : content
  const balanceRow = <HStack spacing={5} frame={{ width: walletWidth, height: large ? 50 : 27 }}>
    <Text font={large ? 34 : 24} fontWeight="bold" fontDesign="rounded" monospacedDigit lineLimit={1} minScaleFactor={0.75}
      frame={{ width: walletLabel ? Math.floor(walletWidth * 0.62) : walletWidth, alignment: "leading" }}>{walletText}</Text>
    {walletLabel ? <>
      <Spacer />
      <Text font={large ? 11 : 10} foregroundStyle={color.secondary} lineLimit={1}>{walletLabel}</Text>
    </> : null}
  </HStack>
  return <VStack spacing={0} widgetBackground={color.background} foregroundStyle={color.primary}
    widgetURL={managementURL} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
    <VStack alignment="leading" spacing={sectionSpacing}
      padding={{ horizontal: inset, vertical: small ? 12 : large ? 14 : 8 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Header period={small ? undefined : when} compact={!small && !large}
        detail={!small && hasData ? headerDetail : undefined} alert={!!status} />
      {!hasData ? <>
        <Spacer />
        <Text font={13} foregroundStyle={color.primary} lineLimit={2}>{placeholder}</Text>
        <Spacer />
      </> : small ? <>
        <Spacer />
        <Amount balance={balance} label={walletLabel} width={content} />
        <Rule width={content} />
        <HStack spacing={3} frame={{ width: content, height: 16 }}>
          <Text font={10} foregroundStyle={color.secondary}>月费用</Text>
          <Spacer />
          <Text font={12} fontWeight="semibold" foregroundStyle={color.primary} lineLimit={1} minScaleFactor={0.75}>
            {costText(costs, costCurrency, 4)}
          </Text>
        </HStack>
        <Text font={9} foregroundStyle={status ? color.warning : color.secondary} lineLimit={1}>{status ?? hour}</Text>
      </> : <>
        {large ? <VStack spacing={0} padding={{ horizontal: 13 }} background={surface(color.panel, 13)}>{balanceRow}</VStack> : balanceRow}
        <VStack alignment="leading" spacing={8}>
          {tileRows.map((row, rowIndex) => <HStack key={rowIndex} spacing={gap}>
            {row.map((tile, i) => <Metric key={tile.title} title={tile.title} value={tile.value} tone={tile.tone}
              width={i === columns - 1 ? content - (tileWidth + gap) * i : tileWidth} compact={!large} />)}
          </HStack>)}
        </VStack>
        {used.length ? <VStack alignment="leading" spacing={large ? 7 : 0}>
          <ModelRow rows={used.slice(0, 2)} width={content} currency={costCurrency} compact={!large} />
          {large && used.length > 2 ? <ModelRow rows={used.slice(2, 4)} width={content} currency={costCurrency} compact={false} /> : null}
        </VStack> : <Text font={10} foregroundStyle={color.secondary} lineLimit={1}>
          {platform.amount ? "本月暂无模型用量" : "模型明细待更新"}
        </Text>}
        {large && used.length <= 2 ? <Spacer /> : null}
      </>}
    </VStack>
  </VStack>
}
