/**
 * 飞书日历公共模块
 *
 * 提取自 feishu-calendar-read.mjs 和 feishu-calendar-write.mjs 的共享代码：
 *   - parseArgs
 *   - ensureValidToken
 *   - getPrimaryCalendar
 *   - 类型/颜色映射
 */

import { loadCalendarToken } from './feishu-calendar-token.mjs';

const FEISHU_CALENDAR_LIST_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars';

const TYPE_TO_COLOR = {
  important: -8388608,
  routine: -11034625,
  free: -16711936
};

const TYPE_TO_EMOJI = {
  important: '\u{1F534}',
  routine: '\u{1F535}',
  free: '\u{1F7E2}'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      params[key] = value;
      i++;
    }
  }

  return params;
}

function ensureValidToken(token) {
  if (!token) {
    throw new Error('未找到飞书日历授权信息，请先运行: node feishu-calendar-auth.mjs --action start');
  }

  const expiresAt = new Date(token.expiresAt);
  const now = new Date();

  if (now >= expiresAt) {
    throw new Error('授权已过期，请运行: node feishu-calendar-auth.mjs --action refresh');
  }

  return token.accessToken;
}

function inferTypeFromColor(event) {
  const color = event.color;

  if (typeof color === 'number') {
    if (color === TYPE_TO_COLOR.important) return 'important';
    if (color === TYPE_TO_COLOR.free) return 'free';
    return 'routine';
  }

  if (color === 'red' || color === '#FF4D4F' || (typeof color === 'string' && color.includes('red'))) {
    return 'important';
  }
  if (color === 'green' || color === '#52C41A' || (typeof color === 'string' && color.includes('green'))) {
    return 'free';
  }
  return 'routine';
}

async function getPrimaryCalendar(accessToken) {
  const response = await fetch(FEISHU_CALENDAR_LIST_URL, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`获取日历列表失败: ${data.msg}`);
  }

  const calendars = data.data?.calendar_list || data.data?.calendars || [];
  const primary = calendars.find(c => c.type === 'primary');

  return primary ? primary.calendar_id : (calendars[0]?.calendar_id || null);
}

export {
  parseArgs,
  ensureValidToken,
  inferTypeFromColor,
  getPrimaryCalendar,
  TYPE_TO_COLOR,
  TYPE_TO_EMOJI
};
