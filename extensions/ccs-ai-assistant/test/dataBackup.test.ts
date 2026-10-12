import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { MemoryFS, WebSkillError } from '@webskill/sdk';
import { BACKUP_FORMAT, createExtensionDataBackup, type DataBackupDeps } from '../src/shared/dataBackup';

/**
 * 0.26.0 分册 15 · AC-15.6～15.9：备份的往返、排除项、合并语义与校验。
 * 存储全用内存假体，所以「写了几次、有没有删」都能直接计数。
 */

class FakeLocalStorage {
  readonly #map = new Map<string, string>();
  setCalls = 0;
  get length(): number {
    return this.#map.size;
  }
  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.setCalls += 1;
    this.#map.set(key, value);
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.#map);
  }
}

class FakeChromeStorage {
  items: Record<string, unknown> = {};
  setCalls = 0;
  get(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.items));
  }
  set(items: Record<string, unknown>): Promise<void> {
    this.setCalls += 1;
    Object.assign(this.items, structuredClone(items));
    return Promise.resolve();
  }
}

interface Env {
  fs: MemoryFS;
  local: FakeLocalStorage;
  chrome: FakeChromeStorage;
  restored: ReturnType<typeof vi.fn>;
  deps: DataBackupDeps;
}

function makeEnv(overrides: Partial<DataBackupDeps> = {}): Env {
  const fs = new MemoryFS();
  const local = new FakeLocalStorage();
  const chrome = new FakeChromeStorage();
  const restored = vi.fn();
  const deps: DataBackupDeps = {
    fs,
    chatRoot: '/chat',
    localStorage: local,
    chromeStorage: chrome,
    extensionVersion: '0.26.0',
    excludeLocalKeys: ['webskill.extension.last-bound-tab'],
    onRestored: restored,
    now: () => new Date(2026, 9, 11, 9, 5, 7),
    ...overrides
  };
  return { fs, local, chrome, restored, deps };
}

const PNG = Uint8Array.from({ length: 256 }, (_, i) => i);

async function seed(env: Env): Promise<void> {
  await env.fs.writeText('/chat/sessions/s1.json', '{"id":"s1","title":"你好"}');
  await env.fs.writeBinary('/chat/attachments/a1/图纸 final.png', PNG);
  await env.fs.writeText('/skills/alpha/SKILL.md', '---\nname: alpha\n---\n# alpha\n');
  await env.fs.writeText('/managed/skills.lock.json', '{"schemaVersion":1,"skills":{}}');
  await env.fs.writeText('/builtin/.seed-state.json', '{"files":{},"tombstones":["authored-screen"]}');
  await env.fs.writeText('/chat/memory/session%3Aabc/params.json', '{"a":1}');
  env.local.setItem('webskill.extension.runtime-config', '{"llm":{"entries":[{"apiKey":"sk-secret"}]}}');
  env.local.setItem('webskill.component.wechat', '{"token":"t-1"}');
  env.local.setItem('webskill_sidebar_state', 'true');
  env.chrome.items = { 'consent:https://a.test:click': { grantedAt: 1 }, 'dlconsent:read': { grantedAt: 2 } };
  env.local.setCalls = 0;
  env.chrome.setCalls = 0;
}

async function snapshotFs(fs: MemoryFS, dir = '/'): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  for (const entry of await fs.list(dir)) {
    if (entry.type === 'directory') Object.assign(out, await snapshotFs(fs, entry.path));
    else out[entry.path] = [...(await fs.readBinary(entry.path))];
  }
  return out;
}

async function exportAll(env: Env): Promise<{ blob: Blob; name: string; entries: Record<string, Uint8Array> }> {
  const file = await createExtensionDataBackup(env.deps).exportBackup();
  return { blob: file.data, name: file.name, entries: unzipSync(new Uint8Array(await file.data.arrayBuffer())) };
}

function archive(files: Record<string, string | Uint8Array>): Blob {
  const data: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(files)) data[name] = typeof value === 'string' ? strToU8(value) : value;
  return new Blob([zipSync(data).slice()]);
}

const manifest = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1, createdAt: '2026-10-11T00:00:00.000Z', ...extra });

async function expectRejected(env: Env, source: Blob, message: RegExp): Promise<void> {
  const writes = vi.spyOn(env.fs, 'writeBinary');
  const error = await createExtensionDataBackup(env.deps)
    .importBackup(source)
    .then(
      () => undefined,
      (e: unknown) => e
    );
  expect(error).toBeInstanceOf(WebSkillError);
  expect((error as WebSkillError).code).toBe('VALIDATION_FAILED');
  expect((error as WebSkillError).message).toMatch(message);
  expect(writes).not.toHaveBeenCalled();
  expect(env.local.setCalls).toBe(0);
  expect(env.chrome.setCalls).toBe(0);
  expect(env.restored).not.toHaveBeenCalled();
}

describe('AC-15.6 往返', () => {
  it('文件（含二进制与中文文件名）、localStorage、chrome.storage 逐字节还原', async () => {
    const source = makeEnv();
    await seed(source);
    const file = await createExtensionDataBackup(source.deps).exportBackup();
    expect(file.name).toBe('webskill-backup-20261011-090507.zip');

    const target = makeEnv();
    const summary = await createExtensionDataBackup(target.deps).importBackup(file.data);

    const expected = await snapshotFs(source.fs);
    expect(Object.keys(expected)).toContain('/chat/attachments/a1/图纸 final.png');
    expect(await snapshotFs(target.fs)).toEqual(expected);
    expect(target.local.snapshot()).toEqual(source.local.snapshot());
    expect(target.chrome.items).toEqual(source.chrome.items);
    expect(summary).toEqual({ files: 6, settings: 5 });
    expect(target.restored).toHaveBeenCalledTimes(1);
  });

  it('清单记录格式、版本与各类计数', async () => {
    const env = makeEnv();
    await seed(env);
    const { entries } = await exportAll(env);
    const parsed = JSON.parse(strFromU8(entries['webskill-backup.json']!)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      format: BACKUP_FORMAT,
      formatVersion: 1,
      extensionVersion: '0.26.0',
      counts: { files: 6, localStorage: 3, chromeStorage: 2 }
    });
  });

  it('空存储也能导出并导入', async () => {
    const empty = makeEnv();
    const file = await createExtensionDataBackup(empty.deps).exportBackup();
    const target = makeEnv();
    expect(await createExtensionDataBackup(target.deps).importBackup(file.data)).toEqual({ files: 0, settings: 0 });
  });

  it('已压缩格式原样存放，文本照常压缩', async () => {
    const env = makeEnv();
    await seed(env);
    const file = await createExtensionDataBackup(env.deps).exportBackup();
    const methods = new Map<string, number>();
    unzipSync(new Uint8Array(await file.data.arrayBuffer()), {
      filter: (info) => {
        methods.set(info.name, info.compression);
        return false;
      }
    });
    expect(methods.get('fs/chat/attachments/a1/图纸 final.png')).toBe(0);
    expect(methods.get('fs/chat/sessions/s1.json')).toBe(8);
  });

  it('多个大文件分批解压写入，字节不变', async () => {
    const source = makeEnv();
    const big = new Uint8Array(20 * 1024 * 1024).fill(7);
    await source.fs.writeBinary('/chat/artifacts/r1/big-a.bin', big);
    await source.fs.writeBinary('/chat/artifacts/r1/big-b.bin', big);
    await source.fs.writeText('/chat/artifacts/r1/small.txt', 'tail');
    const file = await createExtensionDataBackup(source.deps).exportBackup();

    const target = makeEnv();
    const summary = await createExtensionDataBackup(target.deps).importBackup(file.data);
    expect(summary.files).toBe(3);
    expect((await target.fs.readBinary('/chat/artifacts/r1/big-b.bin')).byteLength).toBe(big.byteLength);
    expect(await target.fs.readText('/chat/artifacts/r1/small.txt')).toBe('tail');
  });
});

describe('AC-15.7 排除项', () => {
  it('用户画像记忆、非 webskill 前缀的键与标签页编号都不在归档里', async () => {
    const env = makeEnv();
    await seed(env);
    await env.fs.writeText('/chat/memory/user%3Adefault/profile.json', '{"v":1,"ct":"cipher"}');
    await env.fs.writeText('/chat/memory/USER%3ADefault/records.json', '{"v":1}');
    env.local.setItem('unrelated.key', 'x');
    env.local.setItem('webskill.extension.last-bound-tab', '42');

    const { entries } = await exportAll(env);
    const names = Object.keys(entries);
    expect(names.filter((name) => name.toLowerCase().includes('user%3a'))).toEqual([]);
    expect(names).toContain('fs/chat/memory/session%3Aabc/params.json');

    const local = JSON.parse(strFromU8(entries['local-storage.json']!)) as Record<string, string>;
    expect(Object.keys(local).sort()).toEqual([
      'webskill.component.wechat',
      'webskill.extension.runtime-config',
      'webskill_sidebar_state'
    ]);
  });

  it('备份里若混进画像记忆（手工改过的文件）导入时跳过并给出警告', async () => {
    const env = makeEnv();
    const source = archive({
      'webskill-backup.json': manifest(),
      'fs/chat/memory/user%3Adefault/profile.json': '{"v":1}',
      'fs/chat/sessions/s9.json': '{"id":"s9"}'
    });
    const summary = await createExtensionDataBackup(env.deps).importBackup(source);
    expect(await env.fs.exists('/chat/memory/user%3Adefault/profile.json')).toBe(false);
    expect(await env.fs.exists('/chat/sessions/s9.json')).toBe(true);
    expect(summary.files).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.warnings?.join(' ')).toContain('user-profile memory');
  });

  it('备份里不属于本扩展的 localStorage 键与未知条目被跳过并计数', async () => {
    const env = makeEnv();
    const source = archive({
      'webskill-backup.json': manifest(),
      'local-storage.json': JSON.stringify({
        'webskill.ok': '1',
        'evil.key': '2',
        'webskill.extension.last-bound-tab': '7'
      }),
      'notes.txt': 'not part of the format'
    });
    const summary = await createExtensionDataBackup(env.deps).importBackup(source);
    expect(env.local.snapshot()).toEqual({ 'webskill.ok': '1' });
    expect(summary).toMatchObject({ files: 0, settings: 1, skipped: 3 });
    expect(summary.warnings?.join(' ')).toContain('not part of the backup format');
  });
});

describe('AC-15.8 合并语义', () => {
  it('同路径覆盖，其余既有数据原样在，导入不删除任何东西', async () => {
    const source = makeEnv();
    await source.fs.writeText('/skills/alpha/SKILL.md', 'from backup');
    source.local.setItem('webskill.shared', 'backup');
    source.chrome.items = { 'consent:x': { from: 'backup' } };
    const file = await createExtensionDataBackup(source.deps).exportBackup();

    const target = makeEnv();
    await target.fs.writeText('/skills/alpha/SKILL.md', 'local old');
    await target.fs.writeText('/chat/sessions/keep.json', '{"keep":true}');
    target.local.setItem('webskill.shared', 'local');
    target.local.setItem('webskill.only-here', 'stay');
    target.chrome.items = { 'consent:y': { from: 'local' } };
    const removes = vi.spyOn(target.fs, 'remove');
    const renames = vi.spyOn(target.fs, 'rename');

    await createExtensionDataBackup(target.deps).importBackup(file.data);

    expect(await target.fs.readText('/skills/alpha/SKILL.md')).toBe('from backup');
    expect(await target.fs.readText('/chat/sessions/keep.json')).toBe('{"keep":true}');
    expect(target.local.snapshot()).toEqual({ 'webskill.shared': 'backup', 'webskill.only-here': 'stay' });
    expect(target.chrome.items).toEqual({ 'consent:y': { from: 'local' }, 'consent:x': { from: 'backup' } });
    expect(removes).not.toHaveBeenCalled();
    expect(renames).not.toHaveBeenCalled();
  });
});

describe('AC-15.9 校验先于写入', () => {
  const good = {
    'webskill-backup.json': manifest(),
    'fs/chat/sessions/ok.json': '{}',
    'local-storage.json': '{"webskill.a":"1"}'
  };

  it('不是 zip', async () => {
    await expectRejected(makeEnv(), new Blob([new Uint8Array([1, 2, 3, 4])]), /not a valid zip/);
  });

  it('缺清单', async () => {
    const { 'webskill-backup.json': _omitted, ...rest } = good;
    await expectRejected(makeEnv(), archive(rest), /webskill-backup\.json is missing/);
  });

  it('格式名不对', async () => {
    await expectRejected(
      makeEnv(),
      archive({ ...good, 'webskill-backup.json': manifest({ format: 'something-else' }) }),
      /not a WebSkill extension backup/
    );
  });

  it('格式版本高于本版支持', async () => {
    await expectRejected(
      makeEnv(),
      archive({ ...good, 'webskill-backup.json': manifest({ formatVersion: 2 }) }),
      /newer version \(format 2\)/
    );
  });

  it('格式版本缺失或不是正整数', async () => {
    await expectRejected(
      makeEnv(),
      archive({ ...good, 'webskill-backup.json': JSON.stringify({ format: BACKUP_FORMAT }) }),
      /no valid format version/
    );
    await expectRejected(
      makeEnv(),
      archive({ ...good, 'webskill-backup.json': manifest({ formatVersion: 1.5 }) }),
      /no valid format version/
    );
  });

  it.each([
    ['上级目录', 'fs/../escape.txt'],
    ['绝对路径', 'fs//abs.txt'],
    ['反斜杠', 'fs/a\\b.txt'],
    ['空段', 'fs/a//b.txt'],
    ['当前目录段', 'fs/./a.txt'],
    ['控制字符', 'fs/a\u0001b.txt']
  ])('不安全路径（%s）整份拒绝，合法条目也不写', async (_title, name) => {
    await expectRejected(makeEnv(), archive({ ...good, [name]: 'x' }), /unsafe path/);
  });

  it('JSON 条目不是对象，或 localStorage 值不是字符串', async () => {
    await expectRejected(makeEnv(), archive({ ...good, 'local-storage.json': '[]' }), /must be a JSON object/);
    await expectRejected(
      makeEnv(),
      archive({ ...good, 'local-storage.json': '{"webskill.a":1}' }),
      /map keys to strings/
    );
    await expectRejected(makeEnv(), archive({ ...good, 'chrome-storage-local.json': 'not json' }), /not valid JSON/);
  });
});

describe('写入阶段', () => {
  it('写入失败：报出停在哪里，不调用 onRestored', async () => {
    const env = makeEnv();
    const source = archive({
      'webskill-backup.json': manifest(),
      'fs/a/1.txt': '1',
      'fs/a/2.txt': '2',
      'fs/a/3.txt': '3'
    });
    let calls = 0;
    const real = env.fs.writeBinary.bind(env.fs);
    vi.spyOn(env.fs, 'writeBinary').mockImplementation(async (path, content) => {
      calls += 1;
      if (calls === 2) throw new Error('QuotaExceededError');
      await real(path, content);
    });
    const error = (await createExtensionDataBackup(env.deps)
      .importBackup(source)
      .catch((e: unknown) => e)) as WebSkillError;
    expect(error).toBeInstanceOf(WebSkillError);
    expect(error.code).toBe('INSTALL_FAILED');
    expect(error.message).toBe('Restore stopped after 1 of 3 files: QuotaExceededError');
    expect(env.restored).not.toHaveBeenCalled();
  });
});
