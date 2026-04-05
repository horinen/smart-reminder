---
name: project-manager
description: 项目进度管理技能。防止个人项目半途而废，AI 根据用户状态智能判断时机，主动提醒用户关注项目进度。
metadata:
  openclaw:
    emoji: 📊
    requires:
      bins: [node]
---

# Project Manager

防止个人项目半途而废。AI 根据用户状态智能判断时机，主动提醒用户关注项目进度。

## When to Use

✅ **使用此技能的场景：**

- 用户提到"项目"、"进度"、"日程"、"空闲时间"
- 用户说"记录项目"、"查看进度"、"/进度"
- 用户反馈日程时间（"实际是下午3点"）
- 用户评价提醒效果（"这个时间提醒很好"）
- **成果物相关**：用户提到"成果物"、"交付物"、"里程碑"
- **工作记录**：用户说"刚做完xxx"、"花了x小时"、"今天做了"
- **报告生成**：用户说"周报"、"月报"、"上周干了什么"
- **Cron 任务**：统合学习（每天2次）

## When NOT to Use

❌ **不应使用此技能的场景：**

- 创建 Apple Reminders 待办 → 使用 `apple-reminders` skill
- 管理日历事件 → 使用日历相关 skill
- 团队项目协作 → 使用 Notion、Trello 等
- 用户说"提醒我..." → 不属于本系统职责（系统主动生成提醒）

## Cron 任务

| 任务 | 实现方式 | 执行时机 | 职责 |
|------|----------|---------|------|
| 发送提醒 | 宿主机 cron + 脚本 | 每 15 分钟 | 读取提醒 → 判断时间 → 发送 → 记录 |
| 统合学习 | OpenClaw Agent | 每天2次（9:00, 20:00） | 分析数据 → 生成/调整提醒 |

> 发送提醒已改为纯脚本方案，不经过 AI，确保可靠性。

## 脚本清单

| 脚本 | 用途 |
|------|------|
| `send-reminders.mjs` | 发送提醒（宿主机 cron 调用） |
| `reminder.mjs` | 提醒 CRUD（add/delete/list） |
| `reminder-history.mjs` | 提醒历史与反馈 |
| `schedule.mjs` | 日程 CRUD + 智能分组 |
| `feishu-calendar-auth.mjs` | 飞书日历授权 |
| `feishu-calendar-read.mjs` | 同步飞书日历 |
| `feishu-calendar-write.mjs` | 写入飞书日历 |
| `feishu-bitable-project.mjs` | 项目 CRUD（飞书多维表格） |
| `feishu-bitable-deliverable.mjs` | 成果物 CRUD（飞书多维表格） |
| `feishu-bitable-worklog.mjs` | 工作记录 + 周报/月报（飞书多维表格） |
| `feishu-bitable-init.mjs` | 初始化飞书多维表格配置 |

## Setup

1. 确保 Node.js 18+ 已安装
2. 完成飞书日历授权（运行 `feishu-calendar-auth.mjs`）
3. 创建飞书多维表格（运行 `feishu-bitable-init.mjs --action init`，自动写入 `feishu-config.json`）
4. 无需额外配置

## Cron 配置

查看 `cron-config.md` 获取定时任务配置详情。
