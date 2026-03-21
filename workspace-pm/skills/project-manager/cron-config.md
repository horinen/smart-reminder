# Cron 配置指南

本系统需要配置两个定时任务。

---

## 任务1：发送提醒（纯脚本方案）

**职责**：读取提醒数据，确定性判断，发送提醒。

**实现方式**：宿主机 cron + 纯脚本，**不经过 AI**，确保可靠性。

### 配置命令

```bash
# 添加到宿主机 crontab
(echo "# Smart Reminder - 项目进度提醒"; echo "*/15 * * * * docker exec openclaw-openclaw-gateway-1 node /home/node/.openclaw/workspace-pm/skills/project-manager/scripts/send-reminders.mjs >> /var/log/smart-reminder.log 2>&1") | crontab -
```

### 脚本逻辑

`send-reminders.mjs` 执行流程：
1. 读取 `pending-reminders.json` 和 `recurring-reminders.json`
2. 判断当前时间是否 >= 提醒时间（考虑上海时区）
3. 检查静默时段（22:00-08:00 不发送）
4. 调用飞书 API 发送提醒
5. 更新提醒状态和历史记录
6. 记录发送日志

### 执行时机

- **频率**：每 15 分钟
- **推送**：直接调用飞书 API

### 日志查看

```bash
# 查看发送日志
tail -f /var/log/smart-reminder.log

# 查看详细记录
docker exec openclaw-openclaw-gateway-1 cat /home/node/.openclaw/workspace-pm/skills/project-manager/data/send-log.json
```

### 为什么用纯脚本

**原方案问题**：Agent 判断提醒逻辑可能不可靠（AI 误判、理解偏差）。

**纯脚本优势**：
- 完全确定性逻辑，无 AI 误判
- 可调试，日志完整
- 不消耗 AI tokens
- 无 Agent 启动延迟

---

## 任务2：统合学习（OpenClaw Agent）

**职责**：读取项目、日程、历史数据，AI 智能分析后生成或调整提醒。

**实现方式**：OpenClaw cron + Agent。

### 配置命令

```bash
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron add \
  --name "统合学习" \
  --cron "0 9,20 * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --agent pm \
  --message "你是统合学习任务。请执行：

1. 获取数据：
   - node scripts/get-projects.mjs（项目状态）
   - node scripts/get-schedules.mjs（用户日程）
   - node scripts/get-reminder-history.mjs（提醒效果）
   - node scripts/get-reminders.mjs（当前提醒：待发送 + 持久提醒）

2. 分析判断：
   - 哪些项目需要关注？（距上次更新超过3天、状态活跃的项目）
   - 当前已有哪些提醒？是否需要调整？
   - 什么时候提醒合适？（用户空闲时段、历史响应率高的时间）

3. 生成/调整提醒：
   - 临时提醒：node scripts/add-pending-reminder.mjs --time \"YYYY-MM-DD HH:mm\" --content \"内容\"
   - 持久提醒：node scripts/add-recurring-reminder.mjs --time \"HH:mm\" --content \"内容\"
   - 删除持久提醒：node scripts/delete-recurring-reminder.mjs --id \"ID\"

4. 边界约束（必须遵守）：
   - 不在 22:00-08:00 设置提醒时间
   - 同一项目 24 小时内不重复生成提醒
   - 避免频繁打扰

完成后输出简要总结。" \
  --light-context
```

### 执行时机

- **频率**：每天2次
- **时间点**：早 9:00、晚 20:00
- **推送**：无（只生成提醒，不推送）

---

## 常用命令

### 宿主机 cron（发送提醒）

```bash
# 查看 crontab
crontab -l

# 手动测试
docker exec openclaw-openclaw-gateway-1 node /home/node/.openclaw/workspace-pm/skills/project-manager/scripts/send-reminders.mjs

# 查看日志
tail -f /var/log/smart-reminder.log
```

### OpenClaw cron（统合学习）

```bash
# 查看已有 Cron
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron list

# 删除 Cron
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron rm <cron-id>

# 编辑 Cron
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron edit <cron-id> --message "新消息"

# 手动触发测试
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron run <cron-id>
```

---

## 回滚方案

如需恢复 Agent 发送方案：

```bash
# 删除宿主机 cron
crontab -r

# 添加 OpenClaw cron
docker exec openclaw-openclaw-gateway-1 node dist/index.js cron add \
  --name "项目进度提醒" \
  --cron "*/15 * * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --agent pm \
  --message '检查提醒规则，发送需要发送的提醒...' \
  --no-deliver \
  --channel feishu \
  --to "ou_xxx" \
  --light-context
```

---

## 变更历史

- 2026-03-21：发送提醒任务改为纯脚本方案（详见 `docs/pure-script-reminder.md`）
