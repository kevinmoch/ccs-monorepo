/**
 * 内置技能播种的更新语义（0.21.0）。
 *
 * 老实现是「戳在就跳过」：装过一次的浏览器永远拿不到新版内置技能，
 * 要更新只能卸载重装，而卸载会连 `/chat` 的会话与运行记录一起清掉。
 * 这里钉住新语义——按内容决定动作，且不碰内置技能目录以外的任何路径。
 */
import { MemoryFS } from '@webskill/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_ROOT, seedBuiltinSkills } from '../src/shared/seedSkills';

const SKILLS = ['authored-bulletin', 'authored-screen', 'authored-slides'] as const;
const FILES = ['SKILL.md', 'references/authoring.md', 'scripts/publish.js'] as const;

/** 扩展包里那一份：键是 `chrome.runtime.getURL` 解出来的地址 */
let assets: Map<string, string>;

const resolve = (path: string): string => `chrome-extension://x/${path}`;

function assetKey(skill: string, file: string): string {
  return resolve(`skills/builtin/${skill}/${file}`);
}

function bodyOf(skill: string, file: string, revision: string): string {
  return file === 'SKILL.md'
    ? `---\nname: ${skill}\ndescription: ${revision}\n---\n\n# ${skill} ${revision}\n`
    : `// ${skill}/${file} ${revision}\n`;
}

beforeEach(() => {
  assets = new Map();
  for (const skill of SKILLS) for (const file of FILES) assets.set(assetKey(skill, file), bodyOf(skill, file, 'v1'));
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const text = assets.get(url);
    if (text === undefined) return new Response('not found', { status: 404 });
    return new Response(text, { status: 200 });
  }) as typeof globalThis.fetch;
});

async function seedInto(fs: MemoryFS): Promise<boolean> {
  return seedBuiltinSkills(fs, resolve);
}

describe('内置技能播种：更新不靠重装', () => {
  it('首次播种把三个技能全写进内置根', async () => {
    const fs = new MemoryFS();
    expect(await seedInto(fs)).toBe(true);
    for (const skill of SKILLS) {
      for (const file of FILES) {
        expect(await fs.readText(`${BUILTIN_ROOT}/${skill}/${file}`)).toBe(bodyOf(skill, file, 'v1'));
      }
    }
  });

  it('扩展里的内容变了就覆盖磁盘上那份，无需清空任何用户数据', async () => {
    const fs = new MemoryFS();
    await fs.writeText('/chat/keep-me.json', '{"kept":true}');
    await seedInto(fs);

    assets.set(assetKey('authored-slides', 'SKILL.md'), bodyOf('authored-slides', 'SKILL.md', 'v2'));
    expect(await seedInto(fs)).toBe(true);

    expect(await fs.readText(`${BUILTIN_ROOT}/authored-slides/SKILL.md`)).toContain('v2');
    // 别的技能不受牵连，会话记录更不该被碰
    expect(await fs.readText(`${BUILTIN_ROOT}/authored-screen/SKILL.md`)).toContain('v1');
    expect(await fs.readText('/chat/keep-me.json')).toBe('{"kept":true}');
  });

  it('扩展里没变的文件不覆盖：用户对内置技能的改动保得住', async () => {
    const fs = new MemoryFS();
    await seedInto(fs);
    await fs.writeText(`${BUILTIN_ROOT}/authored-screen/SKILL.md`, '---\nname: mine\n---\n\n# 我改过\n');

    expect(await seedInto(fs)).toBe(false);
    expect(await fs.readText(`${BUILTIN_ROOT}/authored-screen/SKILL.md`)).toContain('我改过');
  });

  it('用户删掉的内置技能不复活，哪怕扩展更新了它', async () => {
    const fs = new MemoryFS();
    await seedInto(fs);
    await fs.remove(`${BUILTIN_ROOT}/authored-bulletin`, { recursive: true });

    assets.set(assetKey('authored-bulletin', 'SKILL.md'), bodyOf('authored-bulletin', 'SKILL.md', 'v2'));
    await seedInto(fs);
    expect(await fs.exists(`${BUILTIN_ROOT}/authored-bulletin/SKILL.md`)).toBe(false);

    // 再开一次侧栏也不会把它带回来
    await seedInto(fs);
    expect(await fs.exists(`${BUILTIN_ROOT}/authored-bulletin/SKILL.md`)).toBe(false);
  });

  it('从清单里下架的技能连目录一起收走', async () => {
    const fs = new MemoryFS();
    await seedInto(fs);
    // 模拟上一版播过、这一版清单已不含的技能
    await fs.writeText(`${BUILTIN_ROOT}/retired/SKILL.md`, '---\nname: retired\n---\n');
    const state = JSON.parse(await fs.readText(`${BUILTIN_ROOT}/.seed-state.json`)) as {
      files: Record<string, string>;
    };
    state.files['retired/SKILL.md'] = 'stale';
    await fs.writeText(`${BUILTIN_ROOT}/.seed-state.json`, JSON.stringify(state));

    expect(await seedInto(fs)).toBe(true);
    expect(await fs.exists(`${BUILTIN_ROOT}/retired/SKILL.md`)).toBe(false);
  });

  it('装过老版本的浏览器：旧戳当成未知版本，全量补课一次', async () => {
    const fs = new MemoryFS();
    for (const skill of SKILLS) {
      for (const file of FILES) await fs.writeText(`${BUILTIN_ROOT}/${skill}/${file}`, 'stale');
    }
    await fs.writeText(`${BUILTIN_ROOT}/.seeded-v1`, new Date().toISOString());

    expect(await seedInto(fs)).toBe(true);
    expect(await fs.readText(`${BUILTIN_ROOT}/authored-slides/SKILL.md`)).toContain('v1');
    expect(await fs.exists(`${BUILTIN_ROOT}/.seeded-v1`)).toBe(false);
  });

  it('资源缺失当场抛错，不把 404 页面当技能内容写进去', async () => {
    const fs = new MemoryFS();
    assets.delete(assetKey('authored-screen', 'scripts/publish.js'));
    await expect(seedInto(fs)).rejects.toThrow(/Builtin skill asset missing/);
  });
});
