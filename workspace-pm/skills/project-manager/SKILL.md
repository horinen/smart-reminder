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
| `get-reminder-history.mjs` | 获取提醒效果统计 |
| `project.mjs` | 项目 CRUD + 状态概览 |
| `schedule.mjs` | 日程 CRUD + 智能分组 |
| `record-feedback.mjs` | 记录用户反馈 |

## Setup

1. 确保 Node.js 18+ 已安装
2. 首次使用时，脚本会自动创建 `skills/project-manager/data/` 目录和 JSON 文件
3. 无需额外配置

## Cron 配置

查看 `cron-config.md` 获取定时任务配置详情。

## 纯脚本方案

详见 `docs/pure-script-reminder.md`。
