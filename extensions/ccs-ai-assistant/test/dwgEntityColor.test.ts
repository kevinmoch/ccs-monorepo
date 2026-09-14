import { describe, expect, it } from 'vitest';

import { isHiddenAttribute, viewportViewCenter } from '../src/shared/dwgSource';
import { collectDrawn } from '../src/viewer/dwgGeometry';
import type { DwgDocumentContent, DwgEntity } from '@webskill/agent';

function entity(handle: string, layer: string, color?: string): DwgEntity {
  return {
    handle,
    kind: 'LWPOLYLINE',
    layer,
    ...(color === undefined ? {} : { color }),
    geometry: {
      kind: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      closed: false
    }
  };
}

function doc(entities: readonly DwgEntity[], layers: DwgDocumentContent['layers'] = []): DwgDocumentContent {
  return {
    version: 'AC1027',
    layers,
    entities,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    omissions: []
  };
}

describe('T-26-A · 实体颜色优先于图层颜色（AC-26.1 ~ AC-26.4）', () => {
  // 实测自 `大堂立面图.dwg` Layout1：官方画成红色的修订云就长这样——
  // 实体自己是 #ff0000，脚下的图层却是绿的
  const cloudLayer = { name: 'AR-尺寸标注-1', color: '#00ff00', visible: true, entityCount: 5 };
  const textLayer = { name: 'G-____-____-TEXT', color: '#ffffff', visible: true, entityCount: 7 };

  it('云线画成实体自己的红色，而不是图层的绿色', () => {
    const drawn = collectDrawn({
      kind: 'dwg',
      lang: 'zh',
      after: doc([entity('c1', 'AR-尺寸标注-1', '#ff0000')], [cloudLayer])
    });
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.color).toBe('#ff0000');
    expect(drawn[0]!.color).not.toBe(cloudLayer.color);
  });

  it('白色图层上的红色小云圈同样按实体色画', () => {
    const drawn = collectDrawn({
      kind: 'dwg',
      lang: 'zh',
      after: doc([entity('t1', 'G-____-____-TEXT', '#ff0000')], [textLayer])
    });
    expect(drawn[0]!.color).toBe('#ff0000');
    expect(textLayer.color).not.toBe('#ff0000');
  });

  it('实体没写颜色时回落到图层色', () => {
    const drawn = collectDrawn({
      kind: 'dwg',
      lang: 'zh',
      after: doc([entity('n1', 'AR-尺寸标注-1')], [cloudLayer])
    });
    expect(drawn[0]!.color).toBe('#00ff00');
  });

  it('实体和图层都没颜色时用兜底灰', () => {
    const drawn = collectDrawn({
      kind: 'dwg',
      lang: 'zh',
      after: doc([entity('n2', '不存在的图层')])
    });
    expect(drawn[0]!.color).toBe('#d4d4d4');
  });
});

describe('T-26-B · 不可见属性不画（AC-26.7、AC-26.8）', () => {
  // 实测 `2D.dwg`：那 5 条字高 4000~6250、内容为 "1" 的属性就是 flags=1
  it('Hidden 位置位的属性认定为不画', () => {
    expect(isHiddenAttribute({ flags: 1 })).toBe(true);
  });

  it('Hidden 位和别的标志位同时置位也认得出来', () => {
    expect(isHiddenAttribute({ flags: 1 | 8 })).toBe(true);
  });

  it('没置 Hidden 位的属性照常画，不误伤', () => {
    expect(isHiddenAttribute({ flags: 0 })).toBe(false);
    expect(isHiddenAttribute({ flags: 2 })).toBe(false);
    expect(isHiddenAttribute({ flags: 4 | 8 })).toBe(false);
  });
});

describe('T-26-C · 视口中心要把目标点加回去（AC-26.5、AC-26.6）', () => {
  // 下面四组数值全部实测自 `2D.dwg`
  it('P-07 的取景中心是 viewCenter 与 viewTarget 之和', () => {
    const center = viewportViewCenter({
      viewCenter: { x: -89337, y: -8868 },
      viewTarget: { x: 22754, y: 32334 }
    });
    expect(center.x).toBeCloseTo(-66583, 0);
    expect(center.y).toBeCloseTo(23466, 0);
  });

  it('P-09 的 viewCenter 近乎为零，全靠 viewTarget 定位', () => {
    const center = viewportViewCenter({
      viewCenter: { x: -141, y: 0 },
      viewTarget: { x: -65382, y: 23882 }
    });
    expect(center.x).toBeCloseTo(-65523, 0);
    expect(center.y).toBeCloseTo(23882, 0);
  });

  it('P-11 的 viewTarget 为零，修复前后取景中心一致', () => {
    const raw = { x: -65380, y: 23868 };
    expect(viewportViewCenter({ viewCenter: raw, viewTarget: { x: 0, y: 0 } })).toEqual(raw);
  });

  it('没有 viewTarget 的视口按零处理', () => {
    expect(viewportViewCenter({ viewCenter: { x: 12, y: -4 } })).toEqual({ x: 12, y: -4 });
    expect(viewportViewCenter({ viewCenter: { x: 12, y: -4 }, viewTarget: null })).toEqual({ x: 12, y: -4 });
  });

  it('五张图纸的取景中心都落在模型主体那一簇（X 中位数 -64402）附近', () => {
    const sheets = [
      { viewCenter: { x: -89337, y: -8868 }, viewTarget: { x: 22754, y: 32334 } },
      { viewCenter: { x: -88641, y: -8422 }, viewTarget: { x: 22754, y: 32334 } },
      { viewCenter: { x: -141, y: 0 }, viewTarget: { x: -65382, y: 23882 } },
      { viewCenter: { x: -89068, y: -8858 }, viewTarget: { x: 22754, y: 32334 } },
      { viewCenter: { x: -65380, y: 23868 }, viewTarget: { x: 0, y: 0 } }
    ];
    for (const sheet of sheets) {
      const center = viewportViewCenter(sheet);
      expect(Math.abs(center.x - -64402)).toBeLessThan(4000);
      expect(center.y).toBeGreaterThan(20000);
    }
  });
});
