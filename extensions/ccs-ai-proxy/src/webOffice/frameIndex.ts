/**
 * 「本帧是顶层帧的第几个子帧」——两个世界、两侧各算一次，结果必然一致（DV-18）。
 *
 * 这是 PDF 字节能在**零跨窗口消息**的前提下认领到正确文档的全部依据：
 * 顶层帧那边拿得到 `iframe.contentWindow`，子帧这边拿得到自己的 `window`，
 * 两者都能在同一个 `window.frames` 列表里定位，于是不必把身份「投递」给对方。
 *
 * 跨源读得到：`length` 与索引访问在 WindowProxy 的跨源白名单上，
 * WindowProxy 的身份比较（`===`）同样允许——这两点正是本方案成立的前提。
 */

/** 非顶层帧的直接子帧一律返回 `undefined`：更深的帧在顶层的 `frames` 里没有位置 */
export function frameIndexInTop(): number | undefined {
  try {
    const top = window.top;
    if (top === null || top === window || window.parent !== top) return undefined;
    for (let index = 0; index < top.length; index += 1) {
      if (top[index] === window) return index;
    }
  } catch {
    // 跨源限制比预期更严时宁可不认：认错帧比认不出更糟
  }
  return undefined;
}
