# 纯脚本提醒方案

## 背景

当前问题：Agent 判断提醒逻辑可能不可靠（AI 误判、理解偏差）。

解决方案：将提醒发送改为纯脚本实现，完全不经过 AI，确保确定性行为。

## 架构对比

### 当前方案（Agent 判断）

```
OpenClaw cron → Agent → AI 判断 → send_message → 飞书
                ↑
            不可靠点
```

### 新方案（纯脚本）

```
宿主机 cron → send-reminders.mjs → 飞书 API → 更新状态
                    ↓
                完全确定性
```

## 实现方案

### 1. 新增脚本：`send-reminders.mjs`

**功能**：
- 读取 `pending-reminders.json` 和 `recurring-reminders.json`
- 判断当前时间是否 >= 提醒时间
- 调用飞书 API 发送提醒
- 调用 `mark-reminder-sent.mjs` 更新状态
- 记录发送日志

**位置**：`workspace-pm/skills/project-manager/scripts/send-reminders.mjs`

**逻辑**：

```javascript
// 1. 读取提醒数据
const pending = JSON.parse(fs.readFileSync('pending-reminders.json'))
const recurring = JSON.parse(fs.readFileSync('recurring-reminders.json'))

// 2. 判断需要发送的提醒
const now = new Date()
const toSend = [
  ...pending.filter(r => new Date(r.time) <= now),
  ...recurring.filter(r => isTimeToSend(r, now))
]

// 3. 发送提醒
for (const reminder of toSend) {
  await sendFeishuMessage(reminder.content)
  await markAsSent(reminder.id, reminder.recurring)
}

// 4. 记录日志
logResult(toSend)
```

### 2. 飞书 API 配置

**方案 A：复用 OpenClaw 配置**

读取容器内环境变量或配置文件，获取飞书 API 凭证。

**方案 B：独立配置**

在 `data/config.json` 中存储：
```json
{
  "feishu": {
    "appId": "xxx",
    "appSecret": "xxx",
    "recipient": "ou_xxx"
  }
}
```

### 3. 宿主机 Cron 配置

```bash
# /etc/crontab 或 crontab -e
*/15 * * * * docker exec openclaw-openclaw-gateway-1 node /home/node/.openclaw/workspace-pm/skills/project-manager/scripts/send-reminders.mjs >> /var/log/smart-reminder.log 2>&1
```

### 4. 删除 OpenClaw 的提醒 Cron 任务

```bash
# 删除现有的"项目进度提醒"任务
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron rm <id>
```

## 数据文件格式

### pending-reminders.json

```json
[
  {
    "id": "rm-xxx",
    "content": "提醒内容",
    "time": "2024-01-15T10:00:00+08:00",
    "projectId": "proj-xxx",
    "createdAt": "2024-01-14T..."
  }
]
```

### recurring-reminders.json

```json
[
  {
    "id": "rm-xxx",
    "content": "提醒内容",
    "time": "10:00",
    "days": ["mon", "tue", "wed", "thu", "fri"],
    "projectId": "proj-xxx",
    "lastSent": "2024-01-14T..."
  }
]
```

## 边界约束（脚本实现）

- **禁止时段**：22:00-08:00 不发送
- **重复发送检查**：recurring 提醒检查 `lastSent`，同一天不重复
- **日志记录**：每次执行记录日志，便于排查

## 变更清单

1. [x] 创建方案文档
2. [x] 创建 `send-reminders.mjs` 脚本
3. [x] 配置宿主机 cron（复用 OpenClaw 飞书凭证，无需独立配置文件）
4. [x] 配置宿主机 cron
5. [x] 删除 OpenClaw 的提醒 cron 任务（id: d491ae2d-6c04-4e78-ac20-5286201f597d）
6. [x] 测试验证（2026-03-21 13:10 测试通过）

## 实施日期

2026-03-21

## 回滚方案

如果纯脚本方案有问题，可以恢复 OpenClaw cron：

```bash
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron add \
  --name "项目进度提醒" \
  --cron "*/15 * * * *" \
  ...
```

## 优势

1. **可靠性**：完全确定性逻辑，无 AI 误判
2. **可调试**：日志完整，问题易定位
3. **低成本**：不消耗 AI tokens
4. **快速响应**：无 Agent 启动延迟

## 劣势

1. **灵活性降低**：无法动态调整发送策略
2. **维护成本**：需要维护宿主机 cron
3. **依赖宿主机**：宿主机故障会影响提醒
