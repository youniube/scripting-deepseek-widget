# DeepSeek 用量

这是运行在 iPhone **Scripting** 里的 DeepSeek 开放平台余额和用量小组件。

| 尺寸 | 平台用量模式 | API Key 余额模式 |
| --- | --- | --- |
| 小号 | 账户余额、本月费用 | 账户余额、余额状态、更新时间 |
| 中号 | 账户余额、本月费用、Tokens、请求数、缓存命中率、主要模型用量和费用 | 账户余额、余额状态、更新时间 |
| 大号 | 月度指标采用两行布局，显示最多四个模型 | 账户余额、余额状态、更新时间 |

管理页显示平台返回的全部模型，以及分币种费用。界面按用量排序模型，并保留平台的原始模型名称作为管理页标签。

## 安装或更新

1. 在 iPhone 的 Safari 打开 [一键远程安装](https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2Fyouniube%2Fscripting-deepseek-widget%2Ftree%2Fmain%2Fscripts%2FDeepSeek%2520%25E7%2594%25A8%25E9%2587%258F%22%5D)，在 Scripting 中确认导入。
2. 如果已经安装，打开原脚本的设置，在「远程资源」中填入 [GitHub 脚本目录](https://github.com/youniube/scripting-deepseek-widget/tree/main/scripts/DeepSeek%20%E7%94%A8%E9%87%8F) 的地址，再在 App 内检查更新。
3. 运行 **DeepSeek 用量**，完成下方一项配置，再把 Scripting 小组件添加到主屏幕并选中此项目。Parameter 留空自动选择币种，也可填 `CNY` 或 `USD` 固定币种。固定币种时月费用同样按该币种显示。

## 配置数据来源

**月度用量**需要你自己的开放平台网页登录凭据 `userToken`。在电脑浏览器登录 [DeepSeek 开放平台用量页](https://platform.deepseek.com/usage)，打开开发者工具的 Application（应用）→ Local Storage（本地存储），在 `https://platform.deepseek.com` 下找到 `userToken`，复制它的值。在 iPhone 的 Scripting 项目中，把值粘贴到「开放平台登录凭据」下的安全输入框，然后点「验证并启用平台用量」。请只在本机的这个输入框填入凭据。

**余额模式**使用 [DeepSeek API Key](https://platform.deepseek.com/api_keys)。要只查看余额，可以在管理页的「API Key」处保存。配置平台凭据后，小组件显示该平台账户的余额与用量。清除本机平台凭据后会回到已配置的 API Key 余额模式。

两种凭据分别保存于本机 Keychain，平台凭据只发往 `platform.deepseek.com`，API Key 只发往公开余额接口。平台登录失效时，从网页重新登录并在管理页更新凭据。

## 数据说明

- 月度统计采用北京时间。Tokens 为输入加输出，缓存命中率以输入 Tokens 为分母。费用使用平台返回的计费金额，不同币种分别展示，缺失字段显示短横线。
- 开放平台用量来自网页使用的未公开接口。接口数据可能延迟，也可能随网页版本变化。只有同一账期的历史缓存会用于月度用量字段。
- 桌面刷新由 iOS 调度，管理页也可手动刷新。iPhone 重启后先解锁一次，脚本才能读取本机凭据。

[公开余额 API](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/) · [DeepSeek 官方鲸鱼标识](https://github.com/deepseek-ai/awesome-deepseek-integration/blob/main/docs/_logo%20svg/ICON.svg) · [Scripting 小组件指南](https://scriptingapp.github.io/guide/Widget/Widget%20Quick%20Start)
