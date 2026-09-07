import { applyConfigDefaults, createConfigDefaultsStore } from '@webskill/chatbot/config';
import type { WebSkillConfigDefaults } from '@webskill/chatbot/config';
import type { RuntimeConfig, RuntimeConfigStore } from '@webskill/ui-kit';
import { loadWebSkillSecrets, WEBSKILL_CONFIG } from 'virtual:webskill-config';

/**
 * `config.json` 缺省值的宿主接线。
 *
 * 合并语义、占位串换入换出、AES 解密全在 SDK 里（`@webskill/chatbot/config`
 * 与构建期的 `@webskill/chatbot/vite`）。这里只剩两件扩展自己的事：
 * 存快照用哪个 localStorage 键，以及 localStorage 不可用时的内存副本。
 */

/** 上次应用过的缺省值快照。有了它，改 config.json 重新打包，老用户也能拿到新值 */
const SNAPSHOT_KEY = 'webskill.extension.config-defaults';

function readSnapshot(): WebSkillConfigDefaults | undefined {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw === null ? undefined : (JSON.parse(raw) as WebSkillConfigDefaults);
  } catch {
    // 读不到就按「首次应用」处理：最差是某一项跟着新缺省值走，不影响用户改过的项
    return undefined;
  }
}

const snapshot = {
  read: readSnapshot,
  write: (value: WebSkillConfigDefaults) => {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(value));
    } catch {
      // 隐私模式 / 配额满：不写快照只是失去「跟随新缺省值」，不该让整页起不来
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(SNAPSHOT_KEY);
    } catch {
      // 同上
    }
  }
};

/**
 * 同步路径的缺省值合并。返回值里模型条目的 `apiKey` 仍是占位串或缺席——
 * 解密要 WebCrypto（异步），需要密钥的走 store 的 `load()`。
 */
export function applyBakedDefaults(stored: unknown): RuntimeConfig {
  return applyConfigDefaults({ stored, defaults: WEBSKILL_CONFIG, lastApplied: readSnapshot() }).config;
}

/** 把缺省值与烘焙凭据接进扩展自己的 localStorage store */
export function withBakedDefaults(inner: RuntimeConfigStore, readRaw: () => unknown): RuntimeConfigStore {
  return createConfigDefaultsStore(inner, {
    defaults: WEBSKILL_CONFIG,
    readRaw,
    snapshot,
    secrets: loadWebSkillSecrets
  });
}
