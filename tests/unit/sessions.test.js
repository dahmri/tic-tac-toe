import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceName } from '../../server/sessions.js';

test('device names come from the user agent', () => {
  const cases = {
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36':
      'Chrome on macOS',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0':
      'Firefox on Windows',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1':
      'Safari on iPhone',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 EdgA/126.0 Edg/126.0':
      'Edge on Android',
    'curl/8.0': 'A browser',
  };
  for (const [ua, name] of Object.entries(cases)) assert.equal(deviceName(ua), name, ua);
});
