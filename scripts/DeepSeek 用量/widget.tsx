import { Widget } from "scripting"
import { BalanceView, Currency, currencyParameter, nextRefresh } from "./balance"
import { PlatformView, loadPlatform, nextPlatformRefresh } from "./platform"
import { loadBalance } from "./service"
import { DeepSeekWidget } from "./views"

async function run() {
  const family = Widget.family
  const supported = family === "systemSmall" || family === "systemMedium" || family === "systemLarge"
  let selection: Currency | undefined
  let platform: PlatformView | undefined
  let view: BalanceView
  try {
    if (!supported) throw new Error("请选择小号、中号或大号桌面组件")
    selection = currencyParameter(Widget.parameter)
    platform = await loadPlatform()
    view = platform.configured ? platform : await loadBalance()
  } catch (error) {
    view = { configured: false, issue: {
      message: error instanceof Error ? error.message : "数据读取失败",
      retryAt: Date.now() + 30 * 60_000,
    } }
  }

  const now = Date.now()
  const small = family === "systemSmall"
  const date = platform?.configured ? nextPlatformRefresh(platform, now) : nextRefresh(view, now)
  Widget.present(<DeepSeekWidget view={view} platform={platform} selection={selection} family={family}
    width={Widget.displaySize?.width || (small ? 158 : 338)} now={now} />, { policy: "after", date })
}

void run()
