import type { FileSystemProvider } from '@webskill/core';

/**
 * 内置技能播种：把随扩展发布的 `skills/builtin/*` 写进 OPFS 的 `/builtin`。
 *
 * 三份「模型自己写版式」的文档技能——公文、大屏、幻灯片。脚本只做投放校验，
 * 取数与 HTML/CSS 都由模型现场做，因此不依赖任何宿主专属数据源，
 * 搬进扩展一个字都不用改（这正是分册 13「同一份技能在两个宿主里长得一样」要证的事）。
 *
 * 播种按**内容**决定动作，不再按「播过没有」一刀切：
 * 扩展里改过的文件覆盖，没改过的保留用户改动，用户删掉的技能不复活。
 * 这样更新技能不需要卸载重装，会话与运行记录（`/chat`）一个字都不动。
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

/** 0.20.0 之前的「播过就永不再播」戳。见到它就当成一次未知版本的播种，全量刷新一遍 */
const LEGACY_STAMP = `${BUILTIN_ROOT}/.seeded-v1`;

/** 播种账本：记的是**扩展内那一份**的指纹，不是磁盘上那一份的 */
const STATE_PATH = `${BUILTIN_ROOT}/.seed-state.json`;

interface SeedState {
  /** key = `${skill}/${file}` */
  files: Record<string, string>;
  /** 用户在技能库里删掉的内置技能：扩展更新时不复活 */
  tombstones: string[];
}

/**
 * 取扩展内资源的地址。这一步**必须**经 `chrome.runtime.getURL`：
 * 侧栏与选项页各自的 HTML 深浅不一，相对路径解出来的位置不同。
 */
type ResolveAsset = (path: string) => string;

/** 只用来判断「这份文件跟上次播的是不是同一份」，不是完整性校验，故不必上 WebCrypto */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}-${text.length}`;
}

async function fetchAsset(resolve: ResolveAsset, skill: string, file: string): Promise<string> {
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
  return text;
}

async function readState(fs: FileSystemProvider): Promise<SeedState> {
  if (await fs.exists(LEGACY_STAMP)) {
    // 老戳不知道播的是哪一版内容，指纹表留空 → 这一轮全量重写，正是它需要的那次补课
    await fs.remove(LEGACY_STAMP).catch(() => undefined);
    return { files: {}, tombstones: [] };
  }
  if (!(await fs.exists(STATE_PATH))) return { files: {}, tombstones: [] };
  try {
    const parsed: unknown = JSON.parse(await fs.readText(STATE_PATH));
    const record = parsed as Partial<SeedState>;
    return {
      files: typeof record.files === 'object' && record.files !== null ? record.files : {},
      tombstones: Array.isArray(record.tombstones) ? record.tombstones.filter((id) => typeof id === 'string') : []
    };
  } catch {
    // 账本坏了就当没播过：重写一遍内置技能，比放着一个读不懂的账本继续猜要好
    return { files: {}, tombstones: [] };
  }
}

/**
 * @returns 是否动过 OPFS——没动就不必广播技能变更
 */
export async function seedBuiltinSkills(fs: FileSystemProvider, resolve: ResolveAsset): Promise<boolean> {
  await fs.remove(LEGACY_ROOT, { recursive: true }).catch(() => undefined);
  const state = await readState(fs);
  const next: SeedState = { files: {}, tombstones: [...state.tombstones] };
  let changed = false;

  for (const [skill, files] of Object.entries(MANIFEST)) {
    if (next.tombstones.includes(skill)) continue;
    const root = `${BUILTIN_ROOT}/${skill}`;
    const seededBefore = Object.keys(state.files).some((key) => key.startsWith(`${skill}/`));
    // 播过、现在 SKILL.md 没了 = 用户自己删的。记一笔墓碑，别在下次更新时又冒出来
    if (seededBefore && !(await fs.exists(`${root}/SKILL.md`))) {
      next.tombstones.push(skill);
      await fs.remove(root, { recursive: true }).catch(() => undefined);
      changed = true;
      continue;
    }

    await fs.mkdir(root).catch(() => undefined);
    for (const file of files) {
      const text = await fetchAsset(resolve, skill, file);
      const key = `${skill}/${file}`;
      const digest = fingerprint(text);
      next.files[key] = digest;
      // 扩展里这一份没变就不覆盖：用户对内置技能的改动只在扩展没更新它时才保得住
      if (state.files[key] === digest && (await fs.exists(`${root}/${file}`))) continue;
      await fs.writeText(`${root}/${file}`, text);
      changed = true;
    }

    // 上一版播过、这一版清单里没有的文件要收走，否则 SKILL.md 已经不提它，
    // 旧脚本却还在按旧内容注册成工具，模型拿到的是一份自相矛盾的技能。
    // 只清自己播过的，用户往技能目录里加的文件不动。
    for (const key of Object.keys(state.files)) {
      if (!key.startsWith(`${skill}/`) || key in next.files) continue;
      await fs.remove(`${BUILTIN_ROOT}/${key}`).catch(() => undefined);
      changed = true;
    }
  }

  // 整个技能从清单里下架：连目录一起收走
  for (const key of Object.keys(state.files)) {
    const skill = key.slice(0, key.indexOf('/'));
    if (skill in MANIFEST) continue;
    await fs.remove(`${BUILTIN_ROOT}/${skill}`, { recursive: true }).catch(() => undefined);
    changed = true;
  }

  const serialized = JSON.stringify(next);
  if (serialized !== JSON.stringify(state)) await fs.writeText(STATE_PATH, serialized);
  return changed;
}
