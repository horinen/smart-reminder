# AI 学习与记忆系统调研

为 smart-reminder 设计 AI 学习、记忆系统，让 AI 能够：
1. 理解用户日程表达的语义
2. 学习用户提醒时机偏好
3. 根据反馈自我迭代优化
4. 主动提供智能服务

## 调研清单
- [x] 主流 AI Agent 记忆系统设计（短期/长期/工作记忆）
- [x] 记忆存储方案对比（向量数据库 vs 结构化存储 vs 混合方案）
- [x] 记忆检索与召回策略

### 2. 用户偏好学习
- [x] 从用户行为中提取偏好的方法
- [x] 偏好表示与存储格式
- [x] 偏好更新与遗忘机制

### 3. 时序模式识别
- [x] 从日程数据中识别时间规律
- [x] 周期性事件检测
- [x] 异常检测与模式修正
### 4. 反馈学习闭环
- [x] 显式反馈 vs 隐式反馈收集
- [x] 强化学习在提醒系统中的应用
- [x] 在线学习 vs 批量学习
### 5. 相关产品/论文
- [x] 类似产品的记忆系统实现
- [x] 学术论文：Personal Assistant AI Memory
- [x] 开源项目参考

---

## 核心发现

### 1. AI Agent 记忆架构

#### 三种记忆类型

| 类型 | 作用 | 持续时间 | 示例 |
|------|------|----------|------|
| **短期记忆 (STM)** | 当前会话上下文 | 会话期间 | 对话历史、工作状态 |
| **工作记忆** | 临时计算和推理 | 任务执行中 | 工具输出、中间结果 |
| **长期记忆 (LTM)** | 持久化知识 | 永久 | 用户偏好、历史经验 |

#### 长期记忆的三种子类型

| 子类型 | 作用 | 存储形式 |
|--------|------|----------|
| **情景记忆** | 特定事件和经历 | 事件日志、案例库 |
| **语义记忆** | 事实和概念知识 | 知识图谱、规则库 |
| **程序记忆** | 技能和行为模式 | 工作流定义、策略库 |

**关键洞察**：
- 短期记忆像 RAM，会话结束即消失
- 长期记忆需要外部存储层（数据库/向量库）
- 三种子类型协同工作：情景提供经验，语义提供知识，程序提供能力

### 2. 用户偏好学习

#### 记忆表示方法

| 方法 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **Simple Notes** | 简单易更新 | 信息孤立、缺乏关联 | 快速记录临时事实 |
| **Enhanced Notes** | 保留上下文 | 冗余、更新复杂 | 需要完整语义的场景 |
| **JSON Cards** | 结构化、易查询 | 刚性、更新复杂 | 消歧、关键信息 |
| **知识图谱** | 关系表达强 | 语义损失、推理弱 | 复杂关系网络 |

**推荐方案**：混合使用 Simple Notes + JSON Cards
- Simple Notes 用于快速记录
- JSON Cards 用于关键消歧信息（包含元数据）

#### 从失败中学习

**核心洞察**（ReasoningBank 研究）：
- 失败经验包含**预防性知识**："避免这样做"
- 成功与失败对比能发现**关键分界点**
- 结合两者形成更完整的推理知识

**示例**：
```
成功经验："点击'男装'找到商品"
失败经验："不要在首页直接搜索，搜索框对复杂查询支持差"
```

### 3. 时序模式识别

#### 知识提炼方法

**不能直接存储原始数据**，必须投入计算资源进行：
1. **统计摘要**：将 100 个案例压缩为统计信息（如"90% 黑猫, 10% 白猫"）
2. **规则提取**：从孤立案例中提炼明确规则

#### 存储方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| **层级结构** | 职责清晰、粒度可控 | 文件稍多 |
| **单独文件** | 集中管理 | 与业务数据分离 |
| **分散存储** | 数据就近 | 职责混淆 |

**推荐**：层级结构
```
data/
├── projects.json
├── schedules.json
├── reminders.json
└── ai/
    ├── user-preferences.json
    ├── time-patterns.json
    └── effectiveness.json
```

### 4. 反馈学习闭环

#### 显式 vs 隐式反馈

| 类型 | 示例 | 可靠性 |
|------|------|--------|
| **显式** | 用户说"不要这个时间提醒我" | 高 |
| **隐式** | 用户响应时间、忽略提醒 | 需推断 |

**建议**：两者结合
- 显式反馈直接更新偏好
- 隐式反馈用于统计分析

#### 强化学习应用

**适用场景**：优化提醒时机
- 状态：时间窗口、用户状态
- 动作：现在/稍后/不提醒
- 奖励：用户响应速度、满意度

**简化方案**（MVP 阶段）：
- 规则 + 统计优化
- 先用简单规则，收集数据
- 后期引入强化学习

### 5. 产品/论文参考

#### 学术研究

| 来源 | 关键贡献 |
|------|----------|
| **NESA (CIKM 2018)** | 日程理解 + 偏好学习 |
| **ReasoningBank (UCLA 2025)** | 从失败中学习推理策略 |
| **CoALA (Princeton)** | Agent 记忆架构分类 |

#### 开源项目

| 项目 | 特点 |
|------|------|
| **Mem0** | 通用记忆层，支持多类型记忆 |
| **GraphRAG** | 图结构知识索引 |
| **RAPTOR** | 树状层次索引 |

#### 产品案例

| 产品 | 记忆策略 | 借鉴点 |
|------|----------|--------|
| **ChatGPT** | 预计算摘要 + 被动记忆 | 轻量级摘要设计 |
| **Claude** | 按需检索 + 隐式更新 | 选择性检索机制 |

---

## smart-reminder 方案建议

### 许忆架构

```
短期记忆（会话内）
    └── 对话历史（滑动窗口）
    └── 工作状态（当前任务）
    
长期记忆
    ├── 情景记忆
    │   ├── schedules.json（日程事件）
    │   └── reminders.json（提醒记录）
    ├── 语义记忆
    │   ├── projects.json（项目知识）
    │   └── user-preferences.json（用户偏好）
    └── 程序记忆
        ├── time-patterns.json（时间规律）
        └── effectiveness.json（效果统计）
```

### 数据模型设计

#### schedules.json（增强版）

```json
{
  "events": [
    {
      "id": "evt-xxx",
      "raw": "下周三有空",
      "parsed": {
        "startTime": "2026-03-25T14:00:00Z",
        "endTime": "2026-03-25T18:00:00Z",
        "type": "free",
        "confidence": 0.8
      },
      "feedback": {
        "actualStartTime": null,
        "userCorrection": null
      },
      "context": "周三下午通常空闲",
      "createdAt": "2026-03-19T10:00:00Z"
    }
  ],
  "patterns": [
    {
      "day_of_week": "Wednesday",
      "slots": ["14:00-16:00", "20:00-22:00"],
      "preference": "high",
      "confidence": 0.85,
      "note": "用户偏好周三下午"
    }
  ]
}
```

#### user-preferences.json

```json
{
  "reminder_timing": {
    "preferred": "20:00-22:00",
    "avoid_after": "21:00",
    "note": "工作日晚饭后"
  },
  "reminder_frequency": {
    "min_hours": 24,
    "max_hours": 72,
    "note": "每1-3天提醒一次"
  },
  "response_style": {
    "prefer_detailed": false,
    "max_length": {
      "simple": 100,
      "detailed": 200
    }
  },
  "learning_from_failures": true
}
```

#### effectiveness.json

```json
{
  "total_sent": 50,
  "timing_feedback": {
    "good": 35,
    "bad": 15
  },
  "best_time_slots": [
    { "weekday": 3, "hour": 20, "success_rate": 0.75 },
    { "weekday": 6, "hour": 14, "success_rate": 0.80 }
  ],
  "insights": [
    "用户倾向于工作日20点提醒",
    "周末14-16点效果最好"
  ]
}
```

### 实现路线图

#### 迭代1：MVP（记忆基础）
- [x] 单会话记忆（对话历史）
- [ ] 多会话记忆（JSON 文件持久化）
- [ ] 简单规则提醒（时间窗口判断）
- [ ] 显式反馈收集（用户确认）

#### 迭代2：学习优化
- [ ] 从历史数据提取时间模式
- [ ] 基于反馈优化提醒时机
- [ ] 隐式反馈分析（响应时间）

#### 迭代3：主动服务
- [ ] 智能预测用户空闲时间
- [ ] 个性化提醒内容
- [ ] 异常检测和策略调整

### 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 日程存储 | JSON + raw 保留 | 保留语义 + 结构化查询 |
| 偏好存储 | JSON Cards | 支持消歧和元数据 |
| 模式提取 | 后台定期分析 | 避免实时计算开销 |
| 反馈收集 | 显式 + 隐式 | 显式可靠，隐式丰富 |
| 评估方式 | LLM-as-judge | 自动化评估记忆质量 |

### 技术选型建议

| 组件 | 推荐 | 备选 |
|------|------|------|
| 记忆管理 | 自建（JSON 文件） | Mem0（如需向量检索） |
| 知识提炼 | LLM 批处理 | 规则引擎 |
| 评估系统 | LLM-as-judge + Rubric | 人工评估 |

---

## 参考资源

### 学术论文
- [NESA: Learning User Preferences and Understanding Calendar Contexts](https://arxiv.org/abs/1809.01316) (CIKM 2018)
- [ReasoningBank](https://arxiv.org/abs/2501.01885) (UCLA 2025)
- [CoALA: Cognitive Architectures for Language Agents](https://arxiv.org/abs/2401.08400) (Princeton)

### 开源项目
- [Mem0](https://github.com/mem0ai/mem0) - Universal memory layer for AI Agents
- [GraphRAG](https://github.com/microsoft/graphrag) - Microsoft Research
- [RAPTOR](https://github.com/parasail-ai/raptor) - Tree-based indexing

### 技术博客
- [从记忆到认知：AI Agent 如何实现真正的个性化服务](https://01.me/2025/10/user-memory-for-ai-agent/) - Bojie Li
- [Short-Term vs Long-Term Memory in AI](https://mem0.ai/blog/short-term-vs-long-term-memory-in-ai) - Mem0
- [The 3 Types of Long-term Memory AI Agents Need](https://machinelearningmastery.com/beyond-short-term-memory-the-3-types-of-long-term-memory-ai-agents-need/) - Machine Learning Mastery

---

## 下一步行动

1. [ ] 评估是否需要集成 Mem0（或继续使用 JSON 文件）
2. [ ] 实现增强的数据模型（添加 raw、feedback、patterns 字段）
3. [ ] 构建记忆管理工具（添加/检索/更新）
4. [ ] 实现反馈收集机制
5. [ ] 设计评估 Rubric
6. [ ] 迭代开发：MVP → 学习优化 → 主动服务
