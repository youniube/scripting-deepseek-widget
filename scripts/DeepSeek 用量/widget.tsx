import { Widget } from "scripting"
import { Currency, REFRESH_INTERVAL, currencyParameter } from "./balance"
import { PlatformView, loadPlatform, nextPlatformRefresh } from "./platform"
import { DeepSeekWidget } from "./views"

async function run() {
  const family = Widget.family
  const supported = family === "systemSmall" || family === "systemMedium" || family === "systemLarge"
  let selection: Currency | undefined
  let platform: PlatformView
  try {
    if (!supported) throw new Error("请选择小号、中号或大号桌面组件")
    selection = currencyParameter(Widget.parameter)
    platform = await loadPlatform()
  } catch (error) {
    platform = { configured: false, issue: {
      message: error instanceof Error ? error.message : "数据读取失败",
      retryAt: Date.now() + REFRESH_INTERVAL,
    } }
  }

  const now = Date.now()
  const small = family === "systemSmall"
  const date = nextPlatformRefresh(platform, now)
  Widget.present(<DeepSeekWidget platform={platform} selection={selection} family={family}
    width={Widget.displaySize?.width || (small ? 158 : 338)} now={now} />, { policy: "after", date })
}

void run()
