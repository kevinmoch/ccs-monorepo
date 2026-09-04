import type { FrameBudget, FrameDispatcher, PageAgentReply, PageAgentTransport } from '@webskill/browser';
import { createFrameRouter } from '@webskill/browser';
import { isPageAgentResponse, pageAgentEnvelope } from './messages';

/** 内容脚本不在场时 Chrome 的固定说法；扩展一更新，已打开页面里的旧脚本就成了孤儿 */
const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;

/** 主文档在 Chrome 里恒为 0 */
const MAIN_FRAME = 0;

/**
 * 扩展更新/重载后，已注入的内容脚本连的是上一个扩展实例，新实例发的消息它收不到，
 * 而浏览器不会自动重注。补注一次比要求用户刷新页面靠谱：这条失败会先传给模型，
 * 模型未必转达，用户只会看到「什么都读不到」。
 */
async function reinject(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
}

/** 地址归一化：只比 origin + path，与 SDK 侧的漂移判定同口径 */
function frameKey(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

/**
 * 扩展寻址的那一半（0.15.0 分册 11 FR-11.1）；编排在 `@webskill/browser` 里。
 *
 * 地址是 `frameId` 而**不是** `{ tabId, frameId }`：tabId 每次现取，
 * 句柄记的只是帧号。把 tabId 焊进地址会让用户切 tab 之后旧句柄被投回旧 tab。
 */
function createTabDispatcher(resolveTabId: () => number | undefined): FrameDispatcher<number> {
  /** 本次感知的帧清单快照；`mainFrame()` 是每次编排的第一步，借它作废上一次的缓存 */
  let frames: readonly chrome.webNavigation.GetAllFrameResultDetails[] = [];

  const requireTab = (): number => {
    const tabId = resolveTabId();
    if (tabId === undefined) {
      throw new Error('No page is bound. Switch to the tab you want the assistant to work on.');
    }
    return tabId;
  };

  return {
    mainFrame: () => {
      requireTab();
      frames = [];
      return MAIN_FRAME;
    },

    /**
     * `chrome.tabs.sendMessage` 上的帧投递（分册 16 D-16-5）。
     *
     * `frameId` 是**必填**的：不带它时 Chrome 把消息广播给 tab 里的每一帧，
     * 而 `sendMessage` 只返回**第一个**应答——哪一帧先答完全看调度。0.13.0 只有主帧
     * 注册处理器时这个 bug 看不出来；一旦每帧都注册，读到的就是随机某一帧的内容。
     */
    send: async (frameId, request) => {
      const tabId = requireTab();
      let raw: unknown;
      try {
        raw = await chrome.tabs.sendMessage(tabId, pageAgentEnvelope(request), { frameId });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        // tab 已关闭 / 导航到 chrome:// 或商店页 → 内容脚本根本没注入。
        // 这是 FR-14.4 说的失效场景：立刻失败，界面据此提示重新绑定。
        if (!NO_RECEIVER.test(detail)) {
          throw new Error(`Tab ${tabId} did not answer (${detail}). The page may be closed or not scriptable.`, {
            cause: e
          });
        }
        try {
          await reinject(tabId);
          raw = await chrome.tabs.sendMessage(tabId, pageAgentEnvelope(request), { frameId });
        } catch (retry) {
          // chrome:// 与商店页注不进去，重试也救不回来；此时才让用户去刷新
          const reason = retry instanceof Error ? retry.message : String(retry);
          throw new Error(
            `Tab ${tabId} has no content script and re-injecting it failed (${reason}). ` +
              'Tell the user to reload that page and try again.',
            { cause: retry }
          );
        }
      }
      if (!isPageAgentResponse(raw)) {
        throw new Error('The content script returned a payload that is not a page agent reply.');
      }
      return { reply: raw.reply, documentUrl: raw.documentUrl };
    },

    resolveNestedFrame: async (nested, context) => {
      // 帧清单在第一次真的要下钻时才取：多数页面没有嵌套帧，不该为它们付一次 API 调用
      if (frames.length === 0) frames = (await chrome.webNavigation.getAllFrames({ tabId: requireTab() })) ?? [];
      const key = frameKey(nested.url);
      const candidates = frames.filter(
        (frame) => frameKey(frame.url) === key && !context.visited.includes(frame.frameId)
      );
      // SPA 里父帧与子帧常常 origin+pathname 完全相同（区别只在 hash，而 hash 是故意丢的）。
      // 先按发现它的那一层收窄，否则两个同路径的兄弟帧会互相顶替，模型拿到的是另一帧的内容
      return (candidates.find((frame) => frame.parentFrameId === context.parent) ?? candidates[0])?.frameId;
    }
  };
}

/**
 * 把分册 13 的一次往返落到 `chrome.tabs.sendMessage`。
 *
 * 分册 16 之后它不再是「一次往返」：`perceive` 会沿着各帧自报的嵌套帧铺开，
 * 汇总成一份快照。0.15.0 分册 11 之后那段编排住在 `@webskill/browser` 里，
 * 这里只剩扩展特有的寻址。对 SDK 来说契约始终没变——仍然是一个 `send`。
 *
 * 这里**只抛普通 Error**：错误码由分册 13 的 `roundTrip` 统一补
 * （它会带上请求类型与超时值）。在这里自造一个码，反而会让同一类失败
 * 在远端与本地拿到两个不同的码。
 */
export function createTabTransport(
  resolveTabId: () => number | undefined,
  budget?: Partial<FrameBudget>
): PageAgentTransport {
  const router = createFrameRouter<number>({
    dispatcher: createTabDispatcher(resolveTabId),
    ...(budget !== undefined ? { budget } : {})
  });
  return {
    send: async (request): Promise<PageAgentReply> =>
      request.type === 'perceive' ? await router.perceive(request) : await router.execute(request)
  };
}
