# Smart Reminder AI 记忆系统设计

基于 OpenClaw 的智能提醒系统 AI 记忆层设计方案。

## 设计目标

1. 保留用户日程表达的原始语义
2. 收集反馈数据，形成学习闭环
3. 利用 OpenClaw 内置记忆系统
4. 渐进式实现，MVP 优先

---

## 现状分析

### 当前架构

```
workspace-pm/
├── data/
│   ├── projects.json      # 项目数据
│   └── schedules.json     # 日程数据（仅有结构化字段）
├── skills/project-manager/
│   └── scripts/
│       ├── update-project.mjs
│       ├── update-schedule.mjs
│       └── show-progress.mjs
└── AGENTS.md

~/.openclaw/memory/
└── pm.sqlite              # OpenClaw 内置长期记忆
```

### 当前问题

| 问题 | 影响 |
|------|------|
| `schedules.json` 只存结构化数据 | 丢失用户原始语义（如"下周三有空"） |
| 无反馈机制 | AI 无法学习提醒效果 |
| 未利用 OpenClaw 记忆 | 重复造轮子 |

---

## 设计方案

### 核心原则

1. **复用 OpenClaw 记忆**：利用 `pm.sqlite` 存储对话历史和 AI 提取的知识
2. **增强数据模型**：在 JSON 文件中保留原始语义和反馈数据
3. **渐进式实现**：MVP → 学习优化 → 主动服务

### 数据模型设计

#### schedules.json（增强版）

```json
{
  "events": [
    {
      "id": "evt-xxx",
      "raw": "下周三有空",
      "parsed": {
        "title": "空闲时间",
        "startTime": "2026-03-25T14:00:00Z",
        "endTime": "2026-03-25T18:00:00Z",
        "type": "free",
        "confidence": 0.8
      },
      "feedback": {
        "actualStartTime": null,
        "userCorrection": null,
        "source": null
      },
      "createdAt": "2026-03-19T10:00:00Z"
    }
  ],
  "patterns": [
    {
      "id": "pat-xxx",
      "type": "time_preference",
      "rule": {
        "dayOfWeek": [3],
        "timeSlots": ["14:00-18:00"],
        "preference": "high"
      },
      "confidence": 0.85,
      "source": "learned_from_events",
      "createdAt": "2026-03-19T10:00:00Z",
      "updatedAt": "2026-03-19T10:00:00Z"
    }
  ]
}
```

**字段说明**：

| 字段 | 用途 |
|------|------|
| `raw` | 用户原始表达，保留语义 |
| `parsed.confidence` | AI 理解的置信度 |
| `feedback` | 用户反馈，用于学习 |
| `patterns` | 从历史数据提取的时间规律 |

#### reminders.json（新增）

```json
{
  "reminders": [
    {
      "id": "rm-xxx",
      "projectId": "proj-xxx",
      "scheduledTime": "2026-03-19T20:00:00Z",
      "sentAt": "2026-03-19T20:00:00Z",
      "message": "智能提醒系统项目已经2天没更新了，需要继续吗？",
      "feedback": {
        "type": null,
        "respondedAt": null,
        "responseTime": null,
        "userComment": null
      },
      "context": {
        "projectStatus": "active",
        "lastUpdateTime": "2026-03-17T10:00:00Z",
        "timeWindow": "weekday_evening"
      },
      "createdAt": "2026-03-19T20:00:00Z"
    }
  ],
  "stats": {
    "totalSent": 0,
    "timingFeedback": {
      "good": 0,
      "bad": 0,
      "noResponse": 0
    },
    "bestTimeSlots": []
  }
}
```

**feedback.type 取值**：
- `positive`: 用户积极回应
- `negative`: 用户表示不满
- `neutral`: 用户回应但无情感倾向
- `ignored`: 用户未响应

#### user-preferences.json（新增）

```json
{
  "reminderTiming": {
    "preferred": {
      "weekday": ["20:00-22:00"],
      "weekend": ["14:00-18:00"]
    },
    "avoid": {
      "after": "21:30",
      "before": "09:00"
    },
    "note": "从用户反馈中学习"
  },
  "reminderFrequency": {
    "minIntervalHours": 24,
    "maxIntervalHours": 72
  },
  "responseStyle": {
    "preferDetailed": false,
    "maxLength": 100
  },
  "learnedPatterns": [
    {
      "pattern": "周三下午通常空闲",
      "confidence": 0.85,
      "source": "event_feedback",
      "createdAt": "2026-03-19T10:00:00Z"
    }
  ],
  "updatedAt": "2026-03-19T10:00:00Z"
}
```

---

## 记忆架构

### 三层记忆结构

```
┌─────────────────────────────────────────────────────┐
│                  OpenClaw 记忆层                      │
│  pm.sqlite - 对话历史、AI 提取的知识                   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                 结构化数据层                          │
│  projects.json / schedules.json / reminders.json    │
│  保留原始语义 + 反馈数据 + 提取的模式                   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  用户偏好层                           │
│  user-preferences.json                              │
│  从反馈中学习的偏好设置                               │
└─────────────────────────────────────────────────────┘
```

### 记忆流向

```
用户输入 "下周三有空"
    │
    ▼
OpenClaw 理解 → 提取语义 → 存入 pm.sqlite
    │
    ▼
update-schedule.mjs → 保存 raw + parsed 到 schedules.json
    │
    ▼
用户反馈（"实际是下午3点"）
    │
    ▼
record-feedback.mjs → 更新 feedback 字段
    │
    ▼
后台分析 → 提取模式 → 更新 patterns + user-preferences.json
```

---

## 脚本改造

### 1. update-schedule.mjs（改造）

**新增参数**：

```bash
--raw "下周三有空"              # 保留原始表达
--confidence 0.8               # AI 理解置信度
--actual-start "2026-03-25T15:00:00Z"  # 用户反馈的实际时间
--correction "实际是下午3点"    # 用户纠正
```

**示例**：

```bash
# 新增日程（带原始语义）
node update-schedule.mjs --action add \
  --raw "下周三有空" \
  --title "空闲时间" \
  --start "2026-03-25T14:00:00Z" \
  --end "2026-03-25T18:00:00Z" \
  --type free \
  --confidence 0.8

# 记录用户反馈
node update-schedule.mjs --action feedback \
  --id evt-xxx \
  --actual-start "2026-03-25T15:00:00Z" \
  --correction "实际是下午3点开始"
```

### 2. record-feedback.mjs（新增）

记录提醒效果反馈：

```bash
# 记录提醒效果
node record-feedback.mjs \
  --reminder-id rm-xxx \
  --type positive \
  --response-time 300 \
  --comment "这个时间提醒很合适"
```

### 3. analyze-patterns.mjs（新增）

从历史数据中提取模式：

```bash
# 分析时间模式（后台定时执行）
node analyze-patterns.mjs

# 输出示例
# 发现模式: 周三下午通常空闲 (置信度 0.85)
# 发现模式: 工作日20点提醒效果最好 (成功率 0.75)
```

### 4. show-learnings.mjs（新增）

展示 AI 学习成果：

```bash
node show-learnings.mjs

# 输出
## 📊 AI 学习成果

### 时间偏好
- ✅ 周三下午通常空闲 (置信度 85%)
- ✅ 周末上午适合提醒 (置信度 80%)

### 提醒效果
- ✅ 工作日 20:00 提醒成功率 75%
- ⚠️ 周末 16:00 后提醒效果较差
```

---

## SKILL.md 改造

在 `project-manager/SKILL.md` 中新增指令：

```markdown
### 4. 反馈收集

用户可以对日程和提醒提供反馈：

```
实际是下午3点开始    # 纠正日程时间
这个时间提醒很好      # 正面反馈
别在这个时间提醒我    # 负面反馈
查看学习成果          # 展示 AI 学到的内容
```

### 5. AI 学习

系统会自动从反馈中学习：
- 提取时间偏好模式
- 优化提醒时机
- 个性化提醒内容
```

---

## AGENTS.md 改造

新增反馈处理和学习指令：

```markdown
## 反馈处理

当用户提供反馈时：

1. **日程纠正**：调用 `update-schedule.mjs --action feedback`
2. **提醒效果**：调用 `record-feedback.mjs`
3. **查看学习成果**：调用 `show-learnings.mjs`

## 学习机制

系统通过以下方式学习：

1. **显式反馈**：用户直接表达偏好
2. **隐式反馈**：分析响应时间、忽略率
3. **模式提取**：后台分析历史数据

学习结果存储在：
- `schedules.json` 的 `patterns` 字段
- `user-preferences.json`
```

---

## 实现路线

### 阶段 1：MVP（数据模型增强）

**目标**：保留原始语义，收集反馈

**任务**：
- [ ] 改造 `schedules.json` 数据模型
- [ ] 改造 `update-schedule.mjs` 支持 `--raw` 和 `--confidence`
- [ ] 新增 `reminders.json`
- [ ] 新增 `record-feedback.mjs`
- [ ] 更新 SKILL.md 和 AGENTS.md

**预期效果**：
- 日程保留原始语义
- 可记录用户反馈
- 提醒效果可追踪

### 阶段 2：学习优化

**目标**：从反馈中学习

**任务**：
- [ ] 新增 `user-preferences.json`
- [ ] 新增 `analyze-patterns.mjs`
- [ ] 新增 `show-learnings.mjs`
- [ ] 实现后台模式提取逻辑

**预期效果**：
- 自动提取时间偏好
- 优化提醒时机
- 可视化学习成果

### 阶段 3：主动服务

**目标**：智能预测和主动提醒

**任务**：
- [ ] 实现智能提醒时机预测
- [ ] 实现个性化提醒内容生成
- [ ] 实现异常检测（如长时间未更新）

**预期效果**：
- AI 主动选择最佳提醒时机
- 提醒内容个性化
- 识别拖延模式

---

## 评估指标

### 记忆质量

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 原始语义保留率 | 100% | 所有日程都有 `raw` 字段 |
| 反馈收集率 | > 50% | 有反馈的日程占比 |
| 模式提取准确率 | > 80% | 人工验证提取的模式 |

### 提醒效果

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 响应率 | > 70% | 用户响应的提醒占比 |
| 平均响应时间 | < 30min | 从发送到响应的时间 |
| 正面反馈率 | > 60% | 正面反馈占比 |

---

## 与 OpenClaw 内置记忆的协作

### OpenClaw 记忆负责

- 对话历史存储
- AI 自主提取的知识
- 跨会话上下文

### JSON 文件负责

- 结构化业务数据
- 反馈数据
- 提取的模式和偏好

### 协作方式

```
用户对话 → OpenClaw 理解 → 调用脚本 → JSON 存储
                ↓
         OpenClaw 记忆 → 辅助理解用户意图
                ↓
         后台分析 → 提取模式 → JSON 存储
```

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 数据模型复杂化 | 渐进式改造，保持向后兼容 |
| 用户不愿提供反馈 | 隐式反馈优先，显式反馈简化 |
| 模式提取不准 | 人工验证 + 置信度阈值 |
| OpenClaw 记忆与 JSON 数据不一致 | 明确职责边界，定期同步 |

---

## 总结

本设计方案：

1. **复用 OpenClaw 内置记忆**，不重复造轮子
2. **增强数据模型**，保留原始语义和反馈数据
3. **渐进式实现**，MVP 优先，逐步增强
4. **评估驱动**，明确指标，持续优化

核心改动：
- `schedules.json` 增加 `raw`、`feedback`、`patterns`
- 新增 `reminders.json`、`user-preferences.json`
- 改造 1 个脚本，新增 3 个脚本
- 更新 SKILL.md 和 AGENTS.md

预期收益：
- AI 可以从用户反馈中学习
- 提醒时机逐步优化
- 用户体验持续提升
