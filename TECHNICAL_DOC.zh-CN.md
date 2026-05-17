# Reference Additions Stats / 文献添加统计 插件技术文档（Zotero 7/8/9）

本文档面向插件维护者与发布者，说明当前实现、数据流、配置方式、发布上架流程，以及如何标注开发者名称。

## 1. 插件定位与能力

- 插件英文名称：`Reference Additions Stats`
- 插件中文名称：`文献添加统计`
- 兼容范围：Zotero 7、8、9.0.x（`manifest.json` 里通过 `applications.zotero` 控制）
- 主功能：
  - 通过 `Tools -> Reference Additions Stats`（英文环境）或 `工具 -> 文献添加统计`（中文环境）打开独立 `文献添加统计` 标签页
  - 按 `dateAdded` 做月度统计（柱状图）
  - 按 `dateAdded` 做日级/月级统计（打卡热力图）
  - 集合过滤（含子集合）
  - 时间段过滤（热力图：近 6 月、近一年、近三年、全部；柱状图：近一年、近三年、全部）
  - 界面文案通过 Fluent 资源跟随 Zotero 语言设置自动切换中文/英文

## 2. 当前目录与文件角色

- `manifest.json`
  - 插件元信息、兼容版本、图标、更新清单地址
- `bootstrap.js`
  - 插件生命周期、UI 注入、SQL 查询、聚合、图表渲染
- `locale/`
  - `zh-CN` 与 `en-US` 的 Fluent 本地化资源
- `prefs.js`
  - 默认偏好值（默认时间段、默认视图）
- `icon.svg`
  - 插件图标
- `README.md`
  - 用户级说明

## 3. 核心架构

### 3.1 生命周期

入口在 `bootstrap.js`：

- `startup()`：注册窗口监听，向现有窗口注入 UI
- `shutdown()`：移除注入元素，清理状态
- `install()/uninstall()`：保留钩子

### 3.2 窗口入口与独立标签页

- 检测 Zotero 主窗口 URI：`chrome://zotero/content/zoteroPane.xhtml`
- 只向 `Tools` 菜单注入统计菜单项（英文环境：`Reference Additions Stats`；中文环境：`文献添加统计`），不再改动左侧集合树
- 点击菜单后通过 `Zotero_Tabs.add({ type: "monthly-stats", title: "文献添加统计" })` 打开独立统计标签页
- 重复点击菜单会聚焦已有统计页并刷新数据
- Zotero 会把 `monthly-stats` 解析为 content type `monthly`，插件在 `monthly` 下注册最小 tab hooks：`focusFirst`、`refocus`、`undoClose`、`restoreState`

### 3.3 数据来源与查询

统计基于 Zotero 数据库内部字段，不依赖界面中英文显示名：

- 时间字段：`items.dateAdded`
- 过滤删除项：`deletedItems`
- 类型排除：根据 `itemTypeID` 映射为 `attachment/note/annotation` 后过滤
- 集合过滤：`collectionItems` + 子集合递归

关键点：
- 月度序列：`YYYY-MM`
- 日度序列：`YYYY-MM-DD`
- 均补齐为连续时间轴，避免图表断裂

## 4. 统计与可视化逻辑

### 4.1 柱状图

- 月粒度统计
- 支持近一年、近三年、全部
- 概览卡片：总数、月均、峰值
- 已修复柱子与日期标签对齐（柱状图标签按柱中心计算）

### 4.2 打卡热力图

- 布局：近 6 个月使用 GitHub 式按周排列（左侧星期、底部月份）；近一年、近三年、全部保持 `月为行、日为列(1-31)`
- 每格代表“某天新增文献数”
- 悬停提示：`YYYY-MM-DD: N 篇`
- 点击格子：设置“日焦点”并在头部显示；可一键清除
- 颜色分段（固定阈值，避免极值压扁）：
  - `0`
  - `1-5`
  - `6-11`
  - `12-19`
  - `20-29`
  - `30+`
- 规则：`>=30` 一律使用最深绿色

## 5. 偏好与配置

`prefs.js`：

- `extensions.monthly-stats.defaultRange`
- `extensions.monthly-stats.defaultView`

运行时会在 UI 变更时写回偏好（例如切换视图/时间段）。

## 6. 调试与排障

统计页只保留主图表和汇总卡片。调试时可打开 Zotero Error Console，或在 `bootstrap.js` 中查看 `buildPanelPayload()` 返回的 `debug` 字段：

- `rawRows`：SQL 返回候选行数
- `parsedRows`：成功解析 `dateAdded` 的行数
- `invalidDateRows` / `filteredTypeRows`：无效日期与已排除类型
- `error`：DB 或逻辑异常会限制在统计页状态文案中展示

建议调试顺序：

1. 看统计页标题下方是否显示读取失败
2. 检查集合过滤是否选中了空集合
3. 在 Error Console 中确认 `debug` 字段是否异常

## 7. 打包与发布（基础）

在项目根目录执行：

```bash
zip -r reference-additions-stats-x.y.z.xpi manifest.json bootstrap.js prefs.js README.md icon.svg locale
shasum -a 256 reference-additions-stats-x.y.z.xpi
```

本地安装：

- Zotero -> `Tools` -> `Plugins`
- 齿轮 -> `Install Plugin From File...`

## 8. 自动更新发布（推荐）

### 8.1 `manifest.json` 的更新入口

`applications.zotero.update_url` 指向你托管的 `updates.json`。

### 8.2 `updates.json` 最小示例

```json
{
  "addons": {
    "reference-additions-stats@konstellation.local": {
      "updates": [
        {
          "version": "0.3.2",
          "update_link": "https://your-domain.example/download/reference-additions-stats-0.3.2.xpi",
          "update_hash": "sha256:REPLACE_WITH_REAL_SHA256",
          "applications": {
            "zotero": {
              "strict_min_version": "6.999",
              "strict_max_version": "9.0.*"
            }
          }
        }
      ]
    }
  }
}
```

发布时每次要同步更新：

- `manifest.json` 中 `version`
- 可下载的 `.xpi`
- `updates.json` 中 `version/update_link/update_hash`

## 9. 如何“上架”这个插件

Zotero 插件生态没有一个强制的“官方应用商店审核流程”，常见做法是：

1. 你自己托管发布（GitHub Releases / 自有站点）
2. 提供稳定下载链接 + `updates.json`
3. 在社区渠道曝光（GitHub README、论坛）
4. 请求加入 Zotero 插件文档页的列表（社区维护，不保证收录时效）

可执行路径（建议）：

1. 建 GitHub 仓库，上传源码
2. 每次 release 上传 `.xpi` 与 `updates.json`
3. `manifest.json` 的 `update_url` 指向稳定地址
4. 在 Zotero 论坛发帖介绍插件
5. 在论坛线程“request plugins be added to the plugins page”按分类提交你的插件信息（名称、链接、简介）

## 10. 如何标注你的开发者名字

至少做这三处：

1. `manifest.json` 的 `author`
2. 插件列表/发布页的文案：`by 你的名字`
3. 仓库 README 顶部作者信息

建议再加两处：

4. `homepage_url` 指向你的主页或仓库
5. `applications.zotero.id` 使用你的域名命名空间（如 `plugin-name@yourdomain.com`）

### 10.1 直接修改示例

```json
{
  "name": "Reference Additions Stats / 文献添加统计",
  "author": "Your Name",
  "homepage_url": "https://github.com/yourname/your-plugin",
  "applications": {
    "zotero": {
      "id": "monthly-stats@yourdomain.com"
    }
  }
}
```

注意：

- 一旦公开发布，`id` 最好不要再改。改 `id` 会被 Zotero 视为“另一个插件”。
- 如果你想显式在 UI 里显示开发者名，也可以在统计面板标题下增加一行固定文本（例如“Developed by …”）。

## 11. 发布前检查清单

- [ ] 手动安装可成功
- [ ] `Tools -> Plugins` 可见插件信息与图标
- [ ] `Tools -> Reference Additions Stats` / `工具 -> 文献添加统计` 可打开独立 `文献添加统计` 标签页
- [ ] 左侧集合树不会被替换或隐藏
- [ ] 两种视图都可切换
- [ ] 热力图 `30+` 为最深绿色
- [ ] `updates.json` 与 `.xpi` 版本一致
- [ ] SHA256 与 `update_hash` 一致
- [ ] `author/homepage_url/id` 已按你的身份信息设置

## 12. 参考链接（上架与开发）

- Zotero 7 开发文档：<https://www.zotero.org/support/dev/zotero_7_for_developers>
- Zotero 8 开发文档：<https://www.zotero.org/support/dev/zotero_8_for_developers>
- 插件开发环境搭建：<https://www.zotero.org/support/dev/client_coding/plugin_development>
- Zotero 插件列表页（社区维护）：<https://www.zotero.org/support/plugins>
- 请求将插件加入列表的论坛线程：<https://forums.zotero.org/discussion/108602/requesting-plugins-be-added-to-the-plugins-page>

---

如需，我可以下一步直接帮你：
- 把 `author`、`homepage_url`、`id` 改成你的真实开发者信息
- 生成你可直接上线用的 `updates.json`（填入当前 `.xpi` 的真实哈希）
- 给你一份 GitHub Releases 的标准发布模板。
