import type {
  DataSourceCandidateStore,
  DownloadedFileAction,
  DownloadedFileConsent,
  PageActionConsent,
  PageActionKind,
  PageActionTarget
} from '@webskill/agent';
import type { ConnectPageActionConsentView } from '@webskill/console';

const PREFIX = 'consent:';

/** `consent:<origin>:<action>`。origin 自带 `://`，所以取动作要从**末尾**切 */
function keyOf(origin: string, action: string): string {
  return `${PREFIX}${origin}:${action}`;
}

/** `<origin>|<action>`。console 只把 id 当不透明串回传（分册 11 §5.1），所以这边能直接解析回键 */
function idOf(origin: string, action: string): string {
  return `${origin}|${action}`;
}

function parseId(id: string): { origin: string; action: string } | undefined {
  const cut = id.lastIndexOf('|');
  if (cut <= 0 || cut === id.length - 1) return undefined;
  return { origin: id.slice(0, cut), action: id.slice(cut + 1) };
}

interface StoredConsent {
  id: string;
  scope: string;
  action: string;
  grantedAt: string;
}

function isStored(value: unknown): value is StoredConsent {
  const v = value as StoredConsent | undefined;
  return typeof v?.id === 'string' && typeof v.scope === 'string' && typeof v.action === 'string';
}

/** 中文文案里的动作名；英文侧直接用 `PageActionKind` 原值 */
const ACTION_LABELS_ZH: Record<PageActionKind, string> = {
  click: '点击',
  fill: '填写',
  submit: '提交',
  select: '选择',
  set: '开关',
  attach: '附件上传',
  scroll: '滚动',
  back: '返回上一页'
};

/**
 * 一份实现同时满足两个接口（FR-14.6）：
 * - `PageActionConsent` 给 side panel 的 `PageActionPolicy`（写 + 读）；
 * - `list` / `forget` / `forgetScope` 给 options 页里 console 的 `ConnectFacade`（列 + 撤销）。
 *
 * 两边共用一份存储不是省事，是**正确性要求**：console 上撤销后如果 side panel 还有
 * 一份缓存，用户会看到"已撤销"却依然不弹卡。
 */
export interface ExtensionConsentStore extends PageActionConsent {
  list(): Promise<readonly ConnectPageActionConsentView[]>;
  forget(id: string): Promise<void>;
  forgetScope(scope: string): Promise<void>;
}

/**
 * @param currentOrigin 绑定 tab 的 origin。**origin 从绑定的 tab 取，不从 target 取**——
 *   `PageActionTarget` 上没有 origin（只有 role/name/frame/secret/elevated），
 *   这正是「粒度归宿主」（D-11-4）在本示例里的具体含义。
 * @param currentLocale 界面语言。`describeScope` 覆盖的是 chatbot 已经本地化过的默认文案，
 *   不跟语言走就会在中文界面里出一句英文。
 */
export function createExtensionConsentStore(
  currentOrigin: () => string | undefined,
  currentLocale: () => 'en' | 'zh' = () => 'en'
): ExtensionConsentStore {
  return {
    async recall(_target: PageActionTarget, action: PageActionKind): Promise<boolean> {
      const origin = currentOrigin();
      if (origin === undefined) return false;
      const key = keyOf(origin, action);
      const bag = await chrome.storage.local.get(key);
      return isStored(bag[key]);
    },

    async remember(_target: PageActionTarget, action: PageActionKind): Promise<void> {
      const origin = currentOrigin();
      // 拿不到 origin 就**不记**：记成一条没有粒度的授权，等于全网通配
      if (origin === undefined) return;
      const entry: StoredConsent = {
        id: idOf(origin, action),
        scope: origin,
        action,
        grantedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ [keyOf(origin, action)]: entry });
    },

    /** 复选框文案必须说出真实粒度，否则用户以为只授权了这一个按钮（D-11-5） */
    describeScope(_target: PageActionTarget, action: PageActionKind): string | undefined {
      const origin = currentOrigin();
      if (origin === undefined) return undefined;
      return currentLocale() === 'zh'
        ? `以后不再询问在 ${origin} 上的「${ACTION_LABELS_ZH[action]}」操作`
        : `Don’t ask again for “${action}” on ${origin}`;
    },

    async list(): Promise<readonly ConnectPageActionConsentView[]> {
      const bag = await chrome.storage.local.get(null);
      const views: ConnectPageActionConsentView[] = [];
      for (const [key, value] of Object.entries(bag)) {
        if (!key.startsWith(PREFIX) || !isStored(value)) continue;
        views.push({ id: value.id, scope: value.scope, action: value.action, grantedAt: value.grantedAt });
      }
      return views;
    },

    async forget(id: string): Promise<void> {
      const parsed = parseId(id);
      if (parsed === undefined) return;
      await chrome.storage.local.remove(keyOf(parsed.origin, parsed.action));
    },

    async forgetScope(scope: string): Promise<void> {
      const bag = await chrome.storage.local.get(null);
      const doomed = Object.keys(bag).filter((key) => key.startsWith(`${PREFIX}${scope}:`));
      if (doomed.length > 0) await chrome.storage.local.remove(doomed);
    }
  };
}

/** `dlconsent:<action>`。下载授权的粒度是「这台浏览器的下载目录」，没有 origin 一维 */
const DOWNLOAD_PREFIX = 'dlconsent:';

/** 撤销入口复用页面操作那一套列表 UI，因此存的也是同一个视图形状 */
const DOWNLOAD_SCOPE = 'downloads';

const DOWNLOAD_ACTION_LABELS_ZH: Record<DownloadedFileAction, string> = {
  list: '列出下载目录',
  read: '读取下载的文件'
};

/**
 * 下载文件授权的「不再询问」存储（0.14.0 分册 20 AC-20.14）。
 *
 * 与页面操作共用 `chrome.storage.local` 与 `ConnectPageActionConsentView` 那套列表 / 撤销 UI：
 * 字段是 `{ id, scope, action, grantedAt }`，对下载授权同样成立，**不新造第二个 console 视图**。
 * 前缀分开是为了让两类记录各自可撤销，而不是两份实现。
 */
export interface ExtensionDownloadConsentStore extends DownloadedFileConsent {
  list(): Promise<readonly ConnectPageActionConsentView[]>;
  forget(id: string): Promise<void>;
  forgetAll(): Promise<void>;
}

export function createExtensionDownloadConsentStore(
  currentLocale: () => 'en' | 'zh' = () => 'en'
): ExtensionDownloadConsentStore {
  const keyOfAction = (action: string): string => `${DOWNLOAD_PREFIX}${action}`;
  return {
    async recall(action: DownloadedFileAction): Promise<boolean> {
      const key = keyOfAction(action);
      const bag = await chrome.storage.local.get(key);
      return isStored(bag[key]);
    },

    async remember(action: DownloadedFileAction): Promise<void> {
      const entry: StoredConsent = {
        id: `${DOWNLOAD_SCOPE}|${action}`,
        scope: DOWNLOAD_SCOPE,
        action,
        grantedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ [keyOfAction(action)]: entry });
    },

    /**
     * 记住的是**整个下载目录上的这一类动作**，不是这一个文件。
     * 文案必须直说，否则用户以为只放行了眼前这份文件（同 D-11-5）。
     */
    describeScope(action: DownloadedFileAction): string {
      return currentLocale() === 'zh'
        ? `以后不再询问「${DOWNLOAD_ACTION_LABELS_ZH[action]}」`
        : `Don’t ask again to ${action === 'list' ? 'list your downloads' : 'read files from your downloads'}`;
    },

    async list(): Promise<readonly ConnectPageActionConsentView[]> {
      const bag = await chrome.storage.local.get(null);
      const views: ConnectPageActionConsentView[] = [];
      for (const [key, value] of Object.entries(bag)) {
        if (!key.startsWith(DOWNLOAD_PREFIX) || !isStored(value)) continue;
        views.push({ id: value.id, scope: value.scope, action: value.action, grantedAt: value.grantedAt });
      }
      return views;
    },

    async forget(id: string): Promise<void> {
      const cut = id.lastIndexOf('|');
      if (cut <= 0 || cut === id.length - 1) return;
      await chrome.storage.local.remove(keyOfAction(id.slice(cut + 1)));
    },

    async forgetAll(): Promise<void> {
      const bag = await chrome.storage.local.get(null);
      const doomed = Object.keys(bag).filter((key) => key.startsWith(DOWNLOAD_PREFIX));
      if (doomed.length > 0) await chrome.storage.local.remove(doomed);
    }
  };
}

/** `dscandidate:<origin>|<id>`。粒度就是 origin + 源 id 这一对（D-21-3），不多不少 */
const CANDIDATE_PREFIX = 'dscandidate:';

/**
 * 站点自荐数据源的「记住」存储（0.14.0 分册 21）。
 *
 * 与上面两份共用 `chrome.storage.local` 和同一个 `{ id, scope, action, grantedAt }` 形状，
 * 于是 console 的撤销列表照样列得出来——`action` 位放源 id。
 */
export interface ExtensionDataSourceCandidateStore extends DataSourceCandidateStore {
  list(): Promise<readonly ConnectPageActionConsentView[]>;
  forgetById(id: string): Promise<void>;
}

export function createExtensionDataSourceCandidateStore(): ExtensionDataSourceCandidateStore {
  const keyOf = (scope: string, id: string): string => `${CANDIDATE_PREFIX}${scope}|${id}`;
  return {
    async recall(scope: string, id: string): Promise<boolean> {
      const key = keyOf(scope, id);
      const bag = await chrome.storage.local.get(key);
      return isStored(bag[key]);
    },

    async remember(scope: string, id: string): Promise<void> {
      const entry: StoredConsent = { id: idOf(scope, id), scope, action: id, grantedAt: new Date().toISOString() };
      await chrome.storage.local.set({ [keyOf(scope, id)]: entry });
    },

    async forget(scope: string, id: string): Promise<void> {
      await chrome.storage.local.remove(keyOf(scope, id));
    },

    async list(): Promise<readonly ConnectPageActionConsentView[]> {
      const bag = await chrome.storage.local.get(null);
      const views: ConnectPageActionConsentView[] = [];
      for (const [key, value] of Object.entries(bag)) {
        if (!key.startsWith(CANDIDATE_PREFIX) || !isStored(value)) continue;
        views.push({ id: value.id, scope: value.scope, action: value.action, grantedAt: value.grantedAt });
      }
      return views;
    },

    async forgetById(id: string): Promise<void> {
      const parsed = parseId(id);
      if (parsed === undefined) return;
      await chrome.storage.local.remove(keyOf(parsed.origin, parsed.action));
    }
  };
}
