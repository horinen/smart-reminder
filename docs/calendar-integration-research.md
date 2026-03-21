# 日历系统集成方案调研

> 讨论时间：2026-03-21
> 决策：优先实现飞书日历方案，后续扩展

## 背景

Smart Reminder 项目需要集成日程管理系统，实现：
- 电脑和手机都能方便管理日历
- 双向同步（读取用户日程 + 写入提醒到日历）
- AI 智能感知用户空闲时间

---

## 方案调研

### 一、自托管方案

#### 1.1 FluidCalendar（最完整）

**项目地址**：https://github.com/dotnetfactory/fluid-calendar

| 特性 | 支持情况 |
|------|----------|
| Google Calendar | ✅ |
| Outlook Calendar | ✅ |
| CalDAV | ✅ 已实现 |
| 智能任务调度 | ✅ AI 自动排程 |
| 多日历同步 | ✅ |
| 自托管 | ✅ Docker 部署 |
| Web UI | ✅ 现代界面 |

**优点**：功能最完整，Motion 的开源替代品
**缺点**：项目活跃开发中，可能有 bug

---

#### 1.2 CalDAV + Radicale（最轻量）

```
用户手机/电脑日历 ←→ Radicale (CalDAV Server) ←→ caldav-mcp ←→ OpenClaw Agent
```

**相关项目**：
- Radicale: https://github.com/Kozea/Radicale
- caldav-mcp: https://github.com/madbonez/caldav-mcp 或 https://github.com/dominik1001/caldav-mcp

**优点**：
- 完全自托管，数据在自己手里
- 可对接任何 CalDAV 客户端（Apple 日历、Google 日历、DAVx5 等）
- 多客户端同步

**缺点**：
- 需要额外部署服务
- 需要在手机/电脑上配置 CalDAV 账户

---

### 二、云日历 API 方案

#### 2.1 直接对接云日历

| 服务 | 费用 | 多端同步 | 集成难度 |
|------|------|----------|----------|
| **飞书日历 API** | 免费 | iOS/Android/Web | 需租户管理员权限 |
| **Google Calendar API** | 免费 | 全平台 | OAuth 配置 |
| **Apple iCloud Calendar** | 免费 | iOS/macOS/Web | CalDAV 或第三方 |
| **Microsoft Outlook** | 免费 | 全平台 | Azure AD 注册 |

#### 2.2 统一日历 API 服务

| 服务 | 支持平台 | 费用 | 特点 |
|------|----------|------|------|
| **Nylas** | Google/Outlook/Exchange/iCloud | $10/月起 | 最成熟 |
| **Cronofy** | Google/Outlook/Apple/Exchange | 按量计费 | 调度优化 |
| **Unipile** | Google/Outlook/iCloud | €5.5/账户/月 | 更便宜 |

---

### 三、AI 日历助手服务

| 服务 | 特点 | API |
|------|------|-----|
| **Dola AI** | WhatsApp/Telegram/iMessage 管理日历 | 无公开 API |
| **TickTick** | 任务+日历+习惯 | ✅ 有 API |
| **Notion Calendar** | Notion 生态 | 部分 API |

---

## 决策：飞书日历优先

### 选择理由

1. **与现有系统一致**：Smart Reminder 已通过飞书渠道运行
2. **用户体验**：无需安装额外 App，飞书即可查看日历
3. **开发效率**：复用现有飞书认证体系

### 实施计划

#### 阶段一：飞书日历读取

```
1. 申请 API 权限
   - calendar:calendar:readonly（读取日历）
   - calendar:calendar（写入日历）

2. 新增脚本
   workspace-pm/skills/project-manager/scripts/
   ├── feishu-calendar-auth.mjs    # OAuth 授权
   ├── feishu-calendar-read.mjs    # 读取日程
   └── feishu-calendar-sync.mjs    # 同步到 schedules.json

3. 定时同步
   - 每 15 分钟同步一次飞书日历到本地
```

#### 阶段二：飞书日历写入

```
1. 新增脚本
   └── feishu-calendar-write.mjs   # 写入提醒事件

2. 功能
   - Agent 生成的提醒 → 写入飞书日历
   - 用户在飞书日历中查看/编辑提醒
```

#### 阶段三：智能感知

```
1. 增强定时任务2（智能核心）
   - 读取飞书日历 → 判断用户空闲时段
   - 避开重要日程 → 不在开会时打扰
   - 推荐最佳提醒时间

2. 数据结构扩展（schedules.json）
   {
     "id": "evt-xxx",
     "title": "周会",
     "start": "2026-03-21T14:00:00",
     "end": "2026-03-21T16:00:00",
     "type": "important",
     "source": "feishu",        // 新增：来源标识
     "priority": "high"         // 新增：优先级
   }
```

---

## 后续扩展

完成飞书方案后，可按需扩展：

| 优先级 | 方案 | 场景 |
|--------|------|------|
| P1 | 飞书日历 | 当前优先 |
| P2 | CalDAV + Radicale | 完全自托管需求 |
| P3 | Google Calendar API | 多日历源支持 |
| P4 | Nylas 统一 API | 商业化/多平台 |

---

## 参考资料

- [飞书开放平台 - 日历 API](https://open.feishu.cn/document/ukTMukTMukTMuYTM1UjMzNjM2MjM)
- [FluidCalendar GitHub](https://github.com/dotnetfactory/fluid-calendar)
- [CalDAV RFC 4791](https://datatracker.ietf.org/doc/html/rfc4791)
- [Nylas Calendar API](https://www.nylas.com/products/calendar-api/)
