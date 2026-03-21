# Project Manager Scripts

## 文档用途

本文档用于逐个 Review 项目管理脚本，确保每个脚本的功能正确、接口清晰。

Review 内容记录在每个脚本的注释块中，格式如下：

```javascript
/**
 * === Script Review ===
 * 
 * 功能: 一句话描述
 * 
 * 输入:
 *   - 参数1: 说明
 *   - 参数2: 说明
 * 
 * 输出:
 *   - stdout: 说明
 *   - 文件: 说明
 */
```

## 读取类脚本（无副作用）

| 脚本 | 用途 |
|------|------|
| `get-reminder-history.mjs` | 查看提醒历史和统计 |

## 写入类脚本（修改数据）

| 脚本 | 用途 |
|------|------|
| `project.mjs` | 项目 CRUD + 状态概览（add/update/list/archive/status） |
| `schedule.mjs` | 日程 CRUD + 智能分组（add/update/delete/list） |
| `reminder.mjs` | 提醒 CRUD（add/delete/list） |
| `record-feedback.mjs` | 记录提醒反馈 |
| `send-reminders.mjs` | 发送提醒到飞书（核心） |

## Review 进度

- [x] get-schedules.mjs → 已合并到 schedule.mjs
- [x] get-reminder-history.mjs
- [x] project.mjs
- [x] schedule.mjs（含 get-schedules 功能）
- [x] reminder.mjs（合并 add-pending/add-recurring/delete-recurring/get-reminders/mark-sent）
- [ ] record-feedback.mjs
- [x] send-reminders.mjs
