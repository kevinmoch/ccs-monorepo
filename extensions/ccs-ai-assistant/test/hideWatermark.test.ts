// @vitest-environment jsdom
/**
 * CCS 页面上的全屏水印隐藏（移植自 ccs-ai-proxy）。
 *
 * 两件事要验：选择器真的盖得住那层水印（而不是写了条没人命中的规则），
 * 以及非 CCS 站点上一个字都不留。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CCS_HOSTS } from '../src/shared/ccsHosts';
import { hideCcsWatermark } from '../src/content/hideWatermark';

const WATERMARK_STYLE =
  'position: fixed; inset: 0px; z-index: 9999; pointer-events: none; background-image: url("data:image/png;base64,iVBORw0KGgo=");';

function atHost(host: string): void {
  vi.spyOn(window, 'location', 'get').mockReturnValue({ host } as Location);
}

function paintWatermark(): HTMLElement {
  const layer = document.createElement('div');
  layer.setAttribute('style', WATERMARK_STYLE);
  document.body.appendChild(layer);
  return layer;
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('hideCcsWatermark', () => {
  it('在 CCS 自家站点上把水印层盖掉', () => {
    atHost(CCS_HOSTS[0]);
    const layer = paintWatermark();

    hideCcsWatermark();

    expect(getComputedStyle(layer).display).toBe('none');
  });

  it('页面把节点重建一遍照样盖得住（规则常驻，不靠删节点）', () => {
    atHost(CCS_HOSTS[0]);
    hideCcsWatermark();
    const rebuilt = paintWatermark();

    expect(getComputedStyle(rebuilt).display).toBe('none');
  });

  it('无关站点上不注入任何东西', () => {
    atHost('example.com');
    const layer = paintWatermark();

    hideCcsWatermark();

    expect(document.querySelector('style')).toBeNull();
    expect(getComputedStyle(layer).display).not.toBe('none');
  });

  it('装两次只留一条规则', () => {
    atHost(CCS_HOSTS[0]);

    hideCcsWatermark();
    hideCcsWatermark();

    expect(document.querySelectorAll('style').length).toBe(1);
  });
});
