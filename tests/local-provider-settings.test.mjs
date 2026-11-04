import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalProviderSettings } from '../local-provider-settings.mjs';

test('MiniMax key saves immediately, survives restart, and removal overrides an old environment key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soundisle-provider-'));
  try {
    const env = { MINIMAX_API_KEY: 'old-environment-key' };
    const settings = createLocalProviderSettings(dir, env);
    settings.save('test-key.only-not-real');
    assert.equal(env.MINIMAX_API_KEY, 'test-key.only-not-real');
    const restarted = {};
    const loaded = createLocalProviderSettings(dir, restarted);
    assert.equal(restarted.MINIMAX_API_KEY, env.MINIMAX_API_KEY);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'minimax-settings.json')).mode & 0o777, 0o600);
    loaded.clear();
    assert.equal(restarted.MINIMAX_API_KEY, '');
    const next = { MINIMAX_API_KEY: 'old-environment-key' };
    createLocalProviderSettings(dir, next);
    assert.equal(next.MINIMAX_API_KEY, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('invalid input and disk failure preserve the running MiniMax configuration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soundisle-provider-'));
  try {
    const env = { MINIMAX_API_KEY: 'unchanged' };
    const settings = createLocalProviderSettings(dir, env);
    for (const invalid of [undefined, 123, '', 'has space', 'line\nbreak', 'x'.repeat(8193)]) assert.throws(() => settings.save(invalid), TypeError);
    fs.mkdirSync(path.join(dir, 'minimax-settings.json'));
    assert.throws(() => settings.save('valid-new-key'));
    assert.equal(env.MINIMAX_API_KEY, 'unchanged');
    assert(!fs.existsSync(path.join(dir, 'minimax-settings.json.tmp')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
