import type { FileSystemProvider } from '@webskill/core';

/**
 * 内置技能播种：把随扩展发布的 `skills/builtin/*` 写进 OPFS 的 `/skills/builtin`。
 *
 * 三份「模型自己写版式」的文档技能——公文、大屏、幻灯片。脚本只做投放校验，
 * 取数与 HTML/CSS 都由模型现场做，因此不依赖任何宿主专属数据源，
 * 搬进扩展一个字都不用改（这正是分册 13「同一份技能在两个宿主里长得一样」要证的事）。
 *
 * 幂等是必须的：`SEED_STAMP` 戳存在即跳过——每次开侧栏都重写会覆盖用户对内置技能的改动。
 */

/** 技能目录 → 文件清单（扩展内没有目录列举接口，必须显式列出） */
const MANIFEST: Record<string, readonly string[]> = {
  'authored-bulletin': ['SKILL.md', 'references/authoring.md', 'scripts/publish.js'],
  'authored-screen': ['SKILL.md', 'references/authoring.md', 'scripts/publish.js'],
  'authored-slides': ['SKILL.md', 'references/authoring.md', 'scripts/publish.js']
};

/**
 * 内置技能落在这个根下，它必须是 `SKILL_ROOTS` 里的**一项**。
 * 不能写成 `/skills/builtin`：`SkillDiscovery` 只认 root 的直接子目录，
 * 多套一层就成了「`/skills` 下有个叫 builtin 的技能但没 SKILL.md」——三个技能全漏。
 */
export const BUILTIN_ROOT = '/builtin';

/** 上一版误放在这里；它不带 SKILL.md，留着就是技能库里一条无意义的告警 */
const LEGACY_ROOT = '/skills/builtin';

/**
 * 戳名带版本：清单里新增技能、或改了任何一个技能的内容时必须跟着改，
 * 否则装过这版扩展的浏览器永远拿不到新内容。改戳名会重抷全部内置技能，
 * 用户对它们的改动会被覆盖。
 */
const SEED_STAMP = `${BUILTIN_ROOT}/.seeded-v1`;

/**
 * 取扩展内资源的地址。这一步**必须**经 `chrome.runtime.getURL`：
 * 侧栏与选项页各自的 HTML 深浅不一，相对路径解出来的位置不同。
 */
type ResolveAsset = (path: string) => string;

async function copyFromPackage(fs: FileSystemProvider, resolve: ResolveAsset, skill: string, file: string) {
  const url = resolve(`skills/builtin/${skill}/${file}`);
  const res = await fetch(url);
  if (!res.ok) {
    // 静默吞掉 404 会把错误页当成技能内容写进 OPFS，必须炸在这里
    throw new Error(`Builtin skill asset missing: skills/builtin/${skill}/${file} (HTTP ${res.status})`);
  }
  const text = await res.text();
  if (file === 'SKILL.md' && !text.startsWith('---')) {
    throw new Error(`Builtin skill asset is not a SKILL.md contract: skills/builtin/${skill}/${file}`);
  }
  await fs.writeText(`${BUILTIN_ROOT}/${skill}/${file}`, text);
}

/**
 * 清掉上一版留在 OPFS 里、这一版清单已不再包含的文件。
 * 光照清单重抷不够：删掉的脚本会以旧内容继续注册成工具，
 * 而 SKILL.md 已经不再提它，模型拿到的是一份自相矛盾的技能。
 */
async function pruneStaleFiles(fs: FileSystemProvider, skillRoot: string, files: readonly string[]): Promise<void> {
  const keep = new Set(files);
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await fs.list(dir).catch(() => [])) {
      const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
      const rel = prefix === '' ? name : `${prefix}/${name}`;
      if (entry.type === 'directory') await walk(`${dir}/${name}`, rel);
      else if (!keep.has(rel)) await fs.remove(`${dir}/${name}`).catch(() => undefined);
    }
  };
  await walk(skillRoot, '');
}

export async function seedBuiltinSkills(fs: FileSystemProvider, resolve: ResolveAsset): Promise<void> {
  if (await fs.exists(SEED_STAMP)) return;
  await fs.remove(LEGACY_ROOT).catch(() => undefined);
  for (const [skill, files] of Object.entries(MANIFEST)) {
    const root = `${BUILTIN_ROOT}/${skill}`;
    await fs.mkdir(root).catch(() => undefined);
    for (const file of files) await copyFromPackage(fs, resolve, skill, file);
    await pruneStaleFiles(fs, root, files);
  }
  await fs.writeText(SEED_STAMP, new Date().toISOString());
}
