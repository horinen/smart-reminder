# 飞书日历统一重构任务

> 创建时间：2026-03-22
> 目标：统一使用飞书日历作为唯一日程存储，本地 JSON 作为只读缓存

## 背景

当前存在两套并行日历管理（本地 schedules.json + 飞书日历），造成混乱。
决策：统一使用飞书日历，所有日程操作都通过飞书 API，本地仅作缓存。

## 目标架构

```
用户操作 → schedule.mjs → 飞书日历 API（主存储）
                              ↓
                        feishu-calendar-read sync
                              ↓
                         schedules.json（只读缓存）
```

---

## 修改清单

### 1. 重构 `schedule.mjs`

**文件**: `workspace-pm/skills/project-manager/scripts/schedule.mjs`

**改动**:
- `add`: 调用 feishu-calendar-write create → 调用 feishu-calendar-read sync
- `update`: 调用 feishu-calendar-write update → 调用 feishu-calendar-read sync
- `delete`: 调用 feishu-calendar-write delete → 调用 feishu-calendar-read sync
- `list`: 读取本地缓存（不变）
- 移除 `--source` 和 `--priority` 参数
- 保留 `--type` 参数（映射到飞书日程颜色）

**依赖导入**:
```javascript
import { execSync } from 'child_process';
```

**内部函数**（新增）:
```javascript
function callFeishuWrite(action, params) {
  const args = Object.entries(params)
    .filter(([k, v]) => v !== undefined)
    .map(([k, v]) => `--${k} "${v}"`)
    .join(' ');
  const script = path.join(__dirname, 'feishu-calendar-write.mjs');
  execSync(`node "${script}" --action ${action} ${args}`, { encoding: 'utf-8' });
}

function syncFromFeishu() {
  const script = path.join(__dirname, 'feishu-calendar-read.mjs');
  execSync(`node "${script}" --action sync`, { encoding: 'utf-8' });
}
```

**add 改动**:
```javascript
if (params.action === 'add') {
  if (!params.title || !params.start) {
    console.error('用法: node schedule.mjs --action add --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
    process.exit(1);
  }
  
  try {
    // 调用飞书 API 创建
    callFeishuWrite('create', {
      title: params.title,
      start: params.start,
      end: params.end,
      type: params.type,
      desc: params.raw
    });
    
    // 同步回本地
    syncFromFeishu();
    
    console.log(`✅ 已新增日程到飞书日历: ${params.title}`);
  } catch (e) {
    console.error(`❌ 新增日程失败: ${e.message}`);
    process.exit(1);
  }
  return;
}
```

**update 改动**:
```javascript
if (params.action === 'update') {
  if (!params.id) {
    console.error('用法: node schedule.mjs --action update --id "evt-xxx" [--title "标题"] [--start "ISO时间"] [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
    process.exit(1);
  }
  
  const schedules = loadSchedules();
  const event = schedules.events.find(e => e.id === params.id);
  if (!event) {
    console.error(`❌ 未找到日程: ${params.id}`);
    process.exit(1);
  }
  
  const hasUpdate = params.title || params.start || params.end || params.type || params.raw;
  if (!hasUpdate) {
    console.error('⚠️ 未指定更新字段');
    process.exit(1);
  }
  
  try {
    callFeishuWrite('update', {
      'event-id': event.feishuEventId,
      title: params.title,
      start: params.start,
      end: params.end,
      type: params.type,
      desc: params.raw
    });
    
    syncFromFeishu();
    
    console.log(`✅ 已更新飞书日历日程: ${params.title || event.title}`);
  } catch (e) {
    console.error(`❌ 更新日程失败: ${e.message}`);
    process.exit(1);
  }
  return;
}
```

**delete 改动**:
```javascript
if (params.action === 'delete') {
  if (!params.id) {
    console.error('用法: node schedule.mjs --action delete --id "evt-xxx"');
    process.exit(1);
  }
  
  const schedules = loadSchedules();
  const event = schedules.events.find(e => e.id === params.id);
  if (!event) {
    console.error(`❌ 未找到日程: ${params.id}`);
    process.exit(1);
  }
  
  try {
    callFeishuWrite('delete', {
      'event-id': event.feishuEventId
    });
    
    syncFromFeishu();
    
    console.log(`✅ 已删除飞书日历日程: ${event.title}`);
  } catch (e) {
    console.error(`❌ 删除日程失败: ${e.message}`);
    process.exit(1);
  }
  return;
}
```

**更新用法提示**:
```javascript
console.error('用法: node schedule.mjs --action add|list|update|delete ...');
console.error('');
console.error('add:    --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
console.error('list:   [--format smart|raw]');
console.error('update: --id "evt-xxx" [--title "标题"] [--start "ISO时间"] [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
console.error('delete: --id "evt-xxx"');
```

**移除 normalizeEvent 函数中的 source/priority 逻辑**（如果有的话）

---

### 2. 重构 `feishu-calendar-read.mjs`

**文件**: `workspace-pm/skills/project-manager/scripts/feishu-calendar-read.mjs`

**改动**:
- `sync` 改为全量覆盖（移除合并逻辑）
- 移除 `source` 和 `priority` 字段
- `type` 根据飞书日程颜色推断

**颜色映射**（新增函数）:
```javascript
function inferTypeFromColor(event) {
  // 飞书日历颜色映射
  // 参考: https://open.feishu.cn/document/ukTMukTMukTMuYTM1UjMzNjM2MjM
  const color = event.color || event.calendar_color;
  
  // 红色系 → important
  if (color === 'red' || color === '#FF4D4F' || color?.includes('red')) {
    return 'important';
  }
  // 绿色系 → free
  if (color === 'green' || color === '#52C41A' || color?.includes('green')) {
    return 'free';
  }
  // 默认 → routine
  return 'routine';
}
```

**mapEventToSchedule 改动**:
```javascript
function mapEventToSchedule(event) {
  const startTime = event.start_time || event.start?.timestamp;
  const endTime = event.end_time || event.end?.timestamp;
  
  const startTs = typeof startTime === 'number' ? startTime : parseInt(startTime) * 1000;
  const endTs = typeof endTime === 'number' ? endTime : parseInt(endTime) * 1000;
  
  return {
    id: `feishu-${event.event_id || event.id}`,
    title: event.summary || '无标题',
    startTime: new Date(startTs).toISOString().replace(/\.\d{3}Z$/, '+08:00'),
    endTime: new Date(endTs).toISOString().replace(/\.\d{3}Z$/, '+08:00'),
    type: inferTypeFromColor(event),
    raw: event.description || '',
    feishuEventId: event.event_id || event.id,
    syncedAt: new Date().toISOString()
  };
}
```

**actionSync 改动**（全量覆盖）:
```javascript
async function actionSync(params) {
  const token = loadToken();
  const accessToken = ensureValidToken(token);
  
  const startTime = new Date();
  const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const calendarId = 'primary';
  
  console.log('## 同步飞书日历到本地\n');
  
  try {
    const feishuEvents = await fetchCalendarEvents(accessToken, calendarId, startTime, endTime);
    
    // 全量覆盖
    const schedules = { events: feishuEvents };
    saveSchedules(schedules);
    
    console.log(`✅ 同步完成\n`);
    console.log(`- 共 ${feishuEvents.length} 条日程`);
  } catch (e) {
    console.error(`❌ 同步失败: ${e.message}`);
    process.exit(1);
  }
}
```

---

### 3. 重构 `feishu-calendar-write.mjs`

**文件**: `workspace-pm/skills/project-manager/scripts/feishu-calendar-write.mjs`

**改动**:
- 支持 `--type` 参数，映射到飞书日程颜色
- 移除 priority 相关逻辑

**颜色映射常量**:
```javascript
const TYPE_TO_COLOR = {
  important: 'red',      // 红色
  routine: 'blue',       // 蓝色（飞书默认）
  free: 'green'          // 绿色
};
```

**actionCreate 改动**:
```javascript
async function actionCreate(params) {
  if (!params.title || !params.start) {
    console.error('用法: node feishu-calendar-write.mjs --action create --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important|routine|free] [--desc "描述"]');
    process.exit(1);
  }
  
  const token = loadToken();
  const accessToken = ensureValidToken(token);
  
  const calendarId = params['calendar-id'] || 'primary';
  const startTime = new Date(params.start);
  const endTime = params.end ? new Date(params.end) : new Date(startTime.getTime() + 60 * 60 * 1000);
  const type = params.type || 'routine';
  
  const url = FEISHU_CREATE_EVENT_URL.replace('{calendar_id}', calendarId);
  
  const eventData = {
    summary: params.title,
    start_time: toTimestamp(startTime),
    end_time: toTimestamp(endTime),
    description: params.desc || '',
    visibility: 'default',
    color: TYPE_TO_COLOR[type] || 'blue',
    remind_info: {
      remind_type: 'cron',
      remind_minutes: [15]
    }
  };
  
  // ... 其余不变
}
```

**actionUpdate 改动**:
```javascript
// 在 eventData 构建中添加
if (params.type) {
  eventData.color = TYPE_TO_COLOR[params.type] || 'blue';
}
```

**用法提示更新**:
```javascript
console.log('参数:');
console.log('  --title       事件标题 (create, update)');
console.log('  --start       开始时间 ISO 格式 (create, update)');
console.log('  --end         结束时间 ISO 格式 (create, update)');
console.log('  --type        类型 important|routine|free (create, update)');
console.log('  --desc        事件描述 (create, update)');
console.log('  --event-id    飞书事件 ID (update, delete)');
console.log('  --calendar-id 日历 ID (可选，默认 primary)');
```

---

### 4. 更新 `AGENTS.md`

**文件**: `workspace-pm/AGENTS.md`

**改动**:
- 日程管理部分更新命令格式
- 飞书日历集成部分简化说明
- 数据格式部分移除 source/priority

**日程管理表格**（替换）:
```markdown
### 日程管理

**说明**: 所有日程存储在飞书日历，本地为只读缓存。需要先完成飞书日历授权。

| 操作 | 脚本命令 |
|------|----------|
| 新增日程 | `node {baseDir}/scripts/schedule.mjs --action add --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important\|routine\|free] [--raw "原始表达"]` |
| 更新日程 | `node {baseDir}/scripts/schedule.mjs --action update --id "feishu-xxx" [--title "标题"] [--start "ISO时间"] [--end "ISO时间"] [--type important\|routine\|free] [--raw "原始表达"]` |
| 删除日程 | `node {baseDir}/scripts/schedule.mjs --action delete --id "feishu-xxx"` |
| 查看日程 | `node {baseDir}/scripts/schedule.mjs --action list [--format smart\|raw]` |
| 同步日程 | `node {baseDir}/scripts/feishu-calendar-read.mjs --action sync` |

**类型说明**:
- `important`: 重要日程（红色），智能感知时不会打扰
- `routine`: 常规日程（蓝色）
- `free`: 空闲时段（绿色），推荐提醒时间
```

**飞书日历集成部分**（简化）:
```markdown
### 飞书日历集成

**所需权限**（需租户管理员批准）：
- `calendar:calendar:readonly` - 读取日历
- `calendar:calendar` - 写入日历

| 操作 | 脚本命令 |
|------|----------|
| 开始授权 | `node {baseDir}/scripts/feishu-calendar-auth.mjs --action start` |
| 完成授权 | `node {baseDir}/scripts/feishu-calendar-auth.mjs --action callback --url "跳转后的完整URL"` |
| 查看状态 | `node {baseDir}/scripts/feishu-calendar-auth.mjs --action status` |
| 刷新令牌 | `node {baseDir}/scripts/feishu-calendar-auth.mjs --action refresh` |

**定时任务**（建议配置）:
```bash
*/15 * * * * cd /path/to/workspace-pm && node skills/project-manager/scripts/feishu-calendar-read.mjs --action sync
```
```

**数据格式部分**（更新）:
```markdown
**数据格式**（schedules.json，只读缓存）：

```json
{
  "events": [
    {
      "id": "feishu-xxx",
      "title": "日程标题",
      "startTime": "2026-03-21T10:00:00",
      "endTime": "2026-03-21T11:00:00",
      "type": "important|routine|free",
      "raw": "原始表达",
      "feishuEventId": "原始飞书事件ID",
      "syncedAt": "同步时间"
    }
  ]
}
```
```

**移除的字段说明**:
```diff
- - `source`: 来源标识
-   - `manual`: 手动添加
-   - `feishu`: 从飞书日历同步
- - `priority`: 优先级
-   - `high`: 高优先级（重要日程）
-   - `medium`: 中等优先级（常规日程）
-   - `low`: 低优先级（空闲时段）
```

**注意事项更新**:
```markdown
## 注意事项

- 新增日程时建议传 `--raw` 参数保留用户原始表达
- 日程 ID 格式为 `feishu-xxx`（飞书事件 ID 前缀）
- 本地 schedules.json 为只读缓存，由定时任务同步
- 飞书 API 不可用时，list 命令仍可查看本地缓存
```

---

## 最终数据格式

```json
{
  "events": [
    {
      "id": "feishu-evt_123456",
      "title": "项目周会",
      "startTime": "2026-03-21T14:00:00+08:00",
      "endTime": "2026-03-21T16:00:00+08:00",
      "type": "important",
      "raw": "每周一下午2点周会",
      "feishuEventId": "evt_123456",
      "syncedAt": "2026-03-22T10:30:00.000Z"
    }
  ]
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 本地 ID，格式 `feishu-{feishuEventId}` |
| title | string | 日程标题 |
| startTime | string | 开始时间 ISO 格式 |
| endTime | string | 结束时间 ISO 格式 |
| type | string | 类型: important/routine/free |
| raw | string | 原始自然语言表达 |
| feishuEventId | string | 飞书原生日程 ID |
| syncedAt | string | 最后同步时间 |

---

## 测试清单

完成修改后，按顺序测试：

1. **授权检查**
   ```bash
   node scripts/feishu-calendar-auth.mjs --action status
   ```

2. **创建日程**
   ```bash
   node scripts/schedule.mjs --action add --title "测试日程" --start "2026-03-22T15:00:00" --type important --raw "测试用"
   ```

3. **查看日程**
   ```bash
   node scripts/schedule.mjs --action list
   ```

4. **更新日程**
   ```bash
   node scripts/schedule.mjs --action update --id "feishu-xxx" --title "更新后的标题"
   ```

5. **删除日程**
   ```bash
   node scripts/schedule.mjs --action delete --id "feishu-xxx"
   ```

6. **同步测试**
   ```bash
   node scripts/feishu-calendar-read.mjs --action sync
   ```

---

## 依赖项

- Node.js 18+（支持原生 fetch）
- 飞书应用配置（`feishu-keys.json`）
- 飞书应用配置和 OAuth 授权（`feishu-keys.json`，包含 calendarToken 字段）
- 定时任务（可选，用于自动同步）

---

## 回滚方案

如果重构后出现问题，可以从 git 恢复：
```bash
git checkout HEAD -- workspace-pm/skills/project-manager/scripts/
```
