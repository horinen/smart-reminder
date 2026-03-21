# Smart Reminder - 智能日程管理助手

基于 [OpenClaw](https://github.com/anomaly/openclaw) 的智能日程管理 Agent，防止个人项目半途而废。

## 核心特性

- **主动智能提醒** - AI 分析用户状态，自动判断最佳时机推送提醒
- **项目进度跟踪** - 记录和管理多个项目状态
- **日程感知** - 根据用户日程智能安排提醒时间
- **反馈学习** - 根据用户反馈持续优化提醒策略
- **可靠性发送** - 纯脚本发送提醒，不经过 AI 判断

## 设计理念

```
传统提醒                     本系统
─────────                   ─────────
用户: "提醒我..."     →      系统主动生成提醒
固定时间触发          →      智能判断时机
无反馈机制            →      持续学习优化
```

**核心目标**：防止个人项目半途而废

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│              定时任务 1 (每 15 分钟) - 纯脚本                  │
│        读取提醒数据 → 确定性判断 → 飞书 API 发送               │
│                    （不经过 AI，确保可靠性）                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       用户对话                               │
│     更新项目状态 / 记录日程 / 反馈提醒效果                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 定时任务 2 (每天 2 次) - Agent                │
│    分析数据 → 生成新提醒 → 调整提醒参数 (AI 智能)              │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
smart-reminder/
├── workspace-pm/                    # OpenClaw workspace
│   ├── AGENTS.md                    # Agent 配置
│   ├── data/                        # 数据存储
│   │   ├── projects.json            # 项目信息
│   │   ├── schedules.json           # 用户日程
│   │   ├── pending-reminders.json   # 一次性提醒
│   │   ├── recurring-reminders.json # 可重复提醒
│   │   ├── reminder-history.json    # 提醒历史 + 反馈
│   │   └── send-log.json            # 发送日志
│   └── skills/
│       └── project-manager/         # 核心技能
│           ├── SKILL.md             # 技能定义
│           ├── cron-config.md       # 定时任务配置
│           └── scripts/             # 操作脚本
│               ├── send-reminders.mjs  # 发送提醒（纯脚本）
│               ├── add-project.mjs
│               ├── add-schedule.mjs
│               ├── add-pending-reminder.mjs
│               └── ...
└── docs/                            # 设计文档
    ├── system-architecture-v2.md    # 系统架构
    ├── smart-reminder-design.md     # 提醒设计
    ├── pure-script-reminder.md      # 纯脚本方案
    └── ...
```

## 快速开始

### 前置要求

- [OpenClaw](https://github.com/anomaly/openclaw) 已部署运行
- Node.js 18+

### 安装

1. 将 `workspace-pm` 目录放入 OpenClaw 的 workspaces 目录

2. 配置定时任务：

```bash
# 发送提醒（宿主机 cron，每 15 分钟）
(echo "# Smart Reminder"; echo "*/15 * * * * docker exec openclaw-openclaw-gateway-1 node /home/node/.openclaw/workspace-pm/skills/project-manager/scripts/send-reminders.mjs >> /var/log/smart-reminder.log 2>&1") | crontab -

# 统合学习（OpenClaw cron，每天 9:00 和 20:00）
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron add \
  --name "统合学习" \
  --cron "0 9,20 * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --agent pm \
  --message "分析项目状态和提醒效果，生成/调整提醒"
```

### 使用

通过飞书与 Agent 对话：

- "我在做一个新项目叫 xxx"
- "今天下午3点有个会"
- "这个提醒时间不错"
- "查看我的项目"

## 相关文档

- [系统架构设计](docs/system-architecture-v2.md)
- [提醒设计方案](docs/smart-reminder-design.md)
- [纯脚本方案](docs/pure-script-reminder.md)
- [定时任务配置](workspace-pm/skills/project-manager/cron-config.md)

## License

MIT
