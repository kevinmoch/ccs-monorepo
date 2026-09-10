/**
 * 未导出清单（0.21.0 分册 15 FR-15.6 / 设计分册 16 §5）。
 *
 * `kind` 是稳定的英文标识，面向用户的句子在这里现生成——文案不得暗示
 * 「换个方式就能导出」，本版没有那个能力，写了就是骗人。
 */

export type OmissionKind =
  | 'gauge-shape'
  | 'metric-shape'
  | 'key-value-shape'
  | 'chart-as-picture'
  | 'chart-downgraded-to-table'
  | 'unsupported-chart-type'
  | 'inline-graphic'
  | 'css-decoration'
  | 'unparsable-component-props'
  | 'unknown-component';

export interface ExportOmission {
  kind: OmissionKind;
  count: number;
}

/** 累计器：抽取与编码两侧都往里记，最后合并成一张清单 */
export class OmissionCounter {
  readonly #counts = new Map<OmissionKind, number>();

  add(kind: OmissionKind, count = 1): void {
    if (count <= 0) return;
    this.#counts.set(kind, (this.#counts.get(kind) ?? 0) + count);
  }

  /** 顺序按 `OmissionKind` 的声明序，保证清单文案是确定的 */
  list(): ExportOmission[] {
    return ORDER.filter((kind) => this.#counts.has(kind)).map((kind) => ({
      kind,
      count: this.#counts.get(kind) ?? 0
    }));
  }
}

/** 合并两侧的清单（抽取的结构性缺失 + 编码器的格式性降级） */
export function mergeOmissions(...lists: readonly (readonly ExportOmission[])[]): ExportOmission[] {
  const counter = new OmissionCounter();
  for (const list of lists) for (const item of list) counter.add(item.kind, item.count);
  return counter.list();
}

interface Label {
  zh: (n: number) => string;
  en: (n: number) => string;
  /** 降级：内容还在，只是换了形态；与「没了」分开说 */
  downgraded?: true;
}

const LABELS: Record<OmissionKind, Label> = {
  'gauge-shape': { zh: (n) => `${n} 张仪表盘的图形形态`, en: (n) => `${n} gauge${n > 1 ? 's' : ''} as shapes` },
  'metric-shape': { zh: (n) => `${n} 张指标卡的图形形态`, en: (n) => `${n} metric card${n > 1 ? 's' : ''} as shapes` },
  'key-value-shape': {
    zh: (n) => `${n} 组键值表的图形形态`,
    en: (n) => `${n} key-value list${n > 1 ? 's' : ''} as shapes`
  },
  'chart-as-picture': {
    zh: (n) => `${n} 张图表贴的是屏幕上那张图，数字另附在下方的数据表里`,
    en: (n) =>
      `${n} chart${n > 1 ? 's' : ''} came across as the on-screen picture, with the numbers in the table below`,
    downgraded: true
  },
  'chart-downgraded-to-table': {
    zh: (n) => `${n} 张图表已降级为数据表`,
    en: (n) => `${n} chart${n > 1 ? 's' : ''} became data tables`,
    downgraded: true
  },
  'unsupported-chart-type': {
    zh: (n) => `${n} 张图表的类型不受支持，已降级为数据表`,
    en: (n) => `${n} chart${n > 1 ? 's' : ''} used an unsupported type and became data tables`,
    downgraded: true
  },
  'inline-graphic': { zh: (n) => `${n} 处内联图形`, en: (n) => `${n} inline graphic${n > 1 ? 's' : ''}` },
  'css-decoration': { zh: () => '技能自带的配色与版式', en: () => 'the skill’s own colours and layout' },
  'unparsable-component-props': {
    zh: (n) => `${n} 个组件的数据无法解析`,
    en: (n) => `${n} component${n > 1 ? 's' : ''} with unreadable data`
  },
  'unknown-component': {
    zh: (n) => `${n} 个未知组件`,
    en: (n) => `${n} unrecognised component${n > 1 ? 's' : ''}`
  }
};

const ORDER = Object.keys(LABELS) as OmissionKind[];

/**
 * 生成就地展示的那一行。空清单返回空串（没有丢东西就不必说话）。
 */
export function describeOmissions(omissions: readonly ExportOmission[], zh: boolean): string {
  const say = (item: ExportOmission): string => LABELS[item.kind][zh ? 'zh' : 'en'](item.count);
  const lost = omissions.filter((item) => !LABELS[item.kind].downgraded).map(say);
  const moved = omissions.filter((item) => LABELS[item.kind].downgraded).map(say);
  const sentences: string[] = [];
  if (zh) {
    if (lost.length > 0) sentences.push(`本次导出只保留文字与数据，未包含：${lost.join('、')}。`);
    if (moved.length > 0) sentences.push(`${moved.join('；')}。`);
  } else {
    if (lost.length > 0) sentences.push(`This export keeps text and data only. Not included: ${lost.join(', ')}.`);
    if (moved.length > 0) sentences.push(`${moved.join('; ')}.`);
  }
  return sentences.join(' ');
}
