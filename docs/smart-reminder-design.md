# 智能提醒系统设计方案

## 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         定时任务 (Cron)                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  每小时整点 → Isolated Session (pm agent)                     │   │
│  │                                                               │   │
│  │  1. 读取 data/schedules.json（日程规则）                      │   │
│  │  2. 读取 data/pending-feedback.json（待确认列表）             │   │
│  │  3. 判断：当前时间窗口 + 今天是否已提醒 + 是否已确认           │   │
│  │  4. 如需提醒 → 输出消息 + 写入 pending-feedback.json          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│                   Announce → 飞书推送                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         用户反馈处理                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  用户回复 → 主会话 / pm agent                                 │   │
│  │                                                               │   │
│  │  1. 分析用户消息语义（"做了" / "完成了" / "没有"）            │   │
│  │  2. 读取 pending-feedback.json                               │   │
│  │  3. 匹配最近的 pending 项                                     │   │
│  │  4. 更新状态 + 记录回复时间                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 完整流程

### 阶段 1：定时检查（每小时）

```
Cron 触发 → Isolated Session
    │
    ├─ 读取 schedules.json（提醒规则）
    ├─ 读取 pending-feedback.json（当前待确认项）
    │
    ├─ 对每条规则判断：
    │   ├─ 当前时间是否在窗口内？
    │   ├─ 今天是否已发送过？
    │   └─ 是否已有待确认项未超时？
    │
    ├─ 如需发送：
    │   ├─ 生成提醒消息
    │   ├─ 写入 pending-feedback.json（状态：pending）
    │   └─ 输出消息 → Announce 推送
    │
    └─ 清理过期项（>24小时未回复 → expired）
```

### 阶段 2：用户反馈（任意时间）

```
用户回复 → 主会话 pm agent
    │
    ├─ 分析语义：
    │   ├─ "做了" / "完成了" → confirmed
    │   ├─ "没有" / "跳过" → skipped
    │   └─ 模糊回复 → 追问确认
    │
    ├─ 读取 pending-feedback.json
    ├─ 匹配最近的 pending 项
    ├─ 更新状态 + 记录回复时间
    │
    └─ 回复用户：
        ├─ confirmed → "收到，已记录"
        └─ skipped → "好的，稍后再提醒"
```

---

## Cron 配置说明

### 配置命令

```bash
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron add \
  --name "项目进度提醒" \
  --cron "0 * * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --agent pm \
  --message "检查提醒规则，判断是否需要发送提醒。读取 data/schedules.json 和 data/pending-feedback.json，对每条规则判断当前时间窗口、是否已提醒、是否已确认。如需发送则生成消息并写入 pending-feedback.json。" \
  --announce \
  --channel feishu \
  --to "ou_用户open_id" \
  --light-context
```

### JSON 配置模板

```json
{
  "name": "项目进度提醒",
  "schedule": {
    "kind": "cron",
    "expr": "0 * * * *",
    "tz": "Asia/Shanghai"
  },
  "sessionTarget": "isolated",
  "agentId": "pm",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "检查提醒规则，判断是否需要发送提醒...",
    "lightContext": true
  },
  "delivery": {
    "mode": "announce",
    "channel": "feishu",
    "to": "ou_用户open_id",
    "bestEffort": true
  }
}
```

### 配置字段说明

| 字段 | 值 | 说明 |
|------|-----|------|
| `schedule.kind` | `"cron"` | 定时任务类型 |
| `schedule.expr` | `"0 * * * *"` | Cron 表达式（每小时整点） |
| `schedule.tz` | `"Asia/Shanghai"` | 时区 |
| `sessionTarget` | `"isolated"` | 隔离会话，每次全新 |
| `agentId` | `"pm"` | 指定执行的 Agent |
| `wakeMode` | `"now"` | 立即执行 |
| `payload.kind` | `"agentTurn"` | Agent 执行类型 |
| `payload.message` | 检查指令 | 发送给 Agent 的任务描述 |
| `payload.lightContext` | `true` | 轻量上下文 |
| `delivery.mode` | `"announce"` | 自动发送到指定通道 |
| `delivery.channel` | `"feishu"` | 发送到飞书 |
| `delivery.to` | `"ou_xxx"` | 用户 open_id |
| `delivery.bestEffort` | `true` | 发送失败不阻塞任务 |

---

