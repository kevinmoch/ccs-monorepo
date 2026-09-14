// @vitest-environment jsdom
/**
 * 结构化投放的往返判据（0.21.0 分册 19）。
 *
 * 这一份测的是本次改造的**全部理由**：屏幕上那份和另存下来那份必须来自同一个 JSON。
 * 所以每条用例都真的跑一遍技能的 `publish.js`，再拿它渲染出来的 HTML 走一遍导出抽取，
 * 断言两边看到的是同一批内容——而不是分别断言「HTML 里有个 table」「导出里有个 table」。
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { AUTHORED_MODEL_ATTR, readAuthoredModel } from '../src/viewer/authored/model';
import { extractExportDoc } from '../src/viewer/export/extract';
import { classifyExportKind, exportRootOf } from '../src/viewer/export/kind';

const BUILTIN = resolve(import.meta.dirname, '../skills/builtin');

interface PublishModule {
  run(input: unknown, context: unknown): Promise<Array<{ type: string; text?: string }>>;
}

interface Published {
  rejected?: string;
  artifacts: Map<string, string>;
}

async function load(skill: string): Promise<PublishModule> {
  return (await import(pathToFileURL(resolve(BUILTIN, skill, 'scripts/publish.js')).href)) as PublishModule;
}

async function publish(module: PublishModule, input: unknown): Promise<Published> {
  const artifacts = new Map<string, string>();
  const parts = await module.run(input, {
    documentSurface: true,
    writeArtifact: (name: string, body: string) => {
      artifacts.set(name, body);
      return Promise.resolve();
    }
  });
  const first = parts[0];
  if (first?.type === 'text' && first.text?.startsWith('PUBLISH_REJECTED') === true) {
    return { rejected: first.text, artifacts };
  }
  return { artifacts };
}

const rootOf = (html: string): Element | null => exportRootOf(new DOMParser().parseFromString(html, 'text/html'));

const CHART = {
  type: 'chart',
  chartType: 'bar',
  title: '月度缺陷趋势',
  labels: ['7 月', '8 月', '9 月'],
  series: [{ name: '新增', values: [468, 421, 395] }]
};
const TABLE = {
  type: 'table',
  columns: ['产品线', '新增', '遗留'],
  rows: [
    ['支付', 312, 14],
    ['风控', 205, 31]
  ]
};
const IMAGE = { type: 'image', ref: 'artifact:capture-1.png', alt: '季度营收趋势截图', caption: '来自经营看板' };

describe('authored-bulletin 的结构化投放', () => {
  let module: PublishModule;
  beforeAll(async () => {
    module = await load('authored-bulletin');
  });

  const plain = {
    doc: {
      title: '三季度交付质量分析',
      subtitle: '研发中心',
      meta: [{ label: '统计范围', value: '2024 Q3' }],
      blocks: [
        { type: 'heading', level: 2, text: '一、总体情况' },
        { type: 'paragraph', text: '三季度共受理缺陷 **1 284** 件。' },
        TABLE,
        CHART,
        { type: 'metrics', items: [{ label: '缺陷总数', value: 1284, change: '-12.4%', trend: 'down' }] },
        { type: 'callout', tone: 'warning', text: '风控线遗留缺陷连续两季度上升。' }
      ]
    },
    dataSource: '页面：缺陷管理'
  };

  it('屏幕上的 HTML 与另存件读的是同一个模型', async () => {
    const { rejected, artifacts } = await publish(module, plain);
    expect(rejected).toBeUndefined();
    const html = artifacts.get('bulletin.html') ?? '';
    expect(artifacts.get('bulletin.css')).toContain('.wsdoc');

    // 屏幕这一侧：占位是真的挂得起来的组件
    expect(html).toContain('data-webskill-component="Table"');
    expect(html).toContain('data-webskill-component="Chart"');
    expect(html).toContain('三季度共受理缺陷 <strong>1 284</strong> 件。');

    // 另存这一侧：同一批内容，来自根节点上的模型而不是刮 DOM
    const model = readAuthoredModel(rootOf(html));
    expect(model?.kind).toBe('document');
    const doc = extractExportDoc(html);
    expect(doc.title).toBe('三季度交付质量分析');
    expect(doc.header?.docType).toBe('plain');
    const kinds = doc.pages[0]?.blocks.map((block) => block.kind);
    expect(kinds).toEqual(['heading', 'paragraph', 'table', 'chart', 'metrics', 'callout']);
    const table = doc.pages[0]?.blocks.find((block) => block.kind === 'table');
    expect(table?.kind === 'table' && table.props.rows).toEqual(TABLE.rows);
    const chart = doc.pages[0]?.blocks.find((block) => block.kind === 'chart');
    expect(chart?.kind === 'chart' && chart.props.series).toEqual(CHART.series);
  });

  it('图片块只留引用，字节留给宿主侧填', async () => {
    const { rejected, artifacts } = await publish(module, {
      doc: { title: '报告', blocks: [{ type: 'paragraph', text: '见下图。' }, IMAGE] },
      dataSource: '页面：经营看板'
    });
    expect(rejected).toBeUndefined();
    const html = artifacts.get('bulletin.html') ?? '';

    // 占位不带 src：字节不经过技能，也不经过投放面
    const img = rootOf(html)?.querySelector('img');
    expect(img?.getAttribute('data-webskill-image')).toBe('artifact:capture-1.png');
    expect(img?.getAttribute('alt')).toBe('季度营收趋势截图');
    expect(img?.hasAttribute('src')).toBe(false);

    // 另存那一侧读的是同一个 JSON，引用与替代文本原样在
    const model = readAuthoredModel(rootOf(html));
    const block = model?.kind === 'document' ? model.blocks[1] : undefined;
    expect(block).toEqual(IMAGE);
  });

  it('替代文本里的引号不会拆开标签', async () => {
    const { artifacts } = await publish(module, {
      doc: {
        title: '报告',
        blocks: [{ type: 'image', ref: 'upload:u-1', alt: '他说"看这张" onerror=alert(1)' }]
      },
      dataSource: 'a'
    });
    const html = artifacts.get('bulletin.html') ?? '';
    expect(html).toContain('&quot;');
    const img = rootOf(html)?.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('他说"看这张" onerror=alert(1)');
    expect(img?.hasAttribute('onerror')).toBe(false);
  });

  it('默认是普通 Word 文档，不是红头公文', async () => {
    const { artifacts } = await publish(module, plain);
    const html = artifacts.get('bulletin.html') ?? '';
    expect(html).toContain('wsdoc--plain');
    expect(html).not.toContain('wsdoc__redhead');
    expect(classifyExportKind(rootOf(html))).toBe('docx');
  });

  it('明确要公文时才出红头与落款', async () => {
    const { rejected, artifacts } = await publish(module, {
      doc: {
        docType: 'official',
        official: { issuer: '某某集团办公室', documentNumber: '某办发〔2024〕17 号', recipient: '各分公司：' },
        title: '关于三季度质量情况的通报',
        blocks: [{ type: 'paragraph', text: '现通报如下。' }],
        signature: { org: '某某集团办公室', date: '2024 年 10 月 9 日' }
      },
      dataSource: '页面：缺陷管理'
    });
    expect(rejected).toBeUndefined();
    const html = artifacts.get('bulletin.html') ?? '';
    expect(html).toContain('wsdoc--official');
    expect(html).toContain('某某集团办公室');
    expect(readAuthoredModel(rootOf(html))).toMatchObject({ docType: 'official' });
    expect(extractExportDoc(html).header?.official?.issuer).toBe('某某集团办公室');
  });

  it('正文里的尖括号是文字，不会变成标签', async () => {
    const { artifacts } = await publish(module, {
      doc: { title: '测试', blocks: [{ type: 'paragraph', text: '<script>alert(1)</script> 与 a & b' }] },
      dataSource: '手工'
    });
    const html = artifacts.get('bulletin.html') ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    const doc = extractExportDoc(html);
    const paragraph = doc.pages[0]?.blocks[0];
    expect(paragraph?.kind === 'paragraph' && paragraph.runs[0]?.text).toBe('<script>alert(1)</script> 与 a & b');
  });

  it('模型里混进对象时，宁可读成空也不印 [object Object]', () => {
    // 校验会先把这种形状挡回去，这一条守的是万一挡漏了的那一刀：
    // `String(对象)` 印出来的正文版式完好、读不成句，比空格难查得多
    const model = {
      kind: 'document',
      title: '报告',
      blocks: [{ type: 'table', columns: ['产品线'], rows: [[{ type: 'text', text: '支付' }]] }]
    };
    const root = document.createElement('div');
    root.setAttribute(AUTHORED_MODEL_ATTR, JSON.stringify(model));
    const parsed = readAuthoredModel(root);
    const table = parsed?.kind === 'document' ? parsed.blocks[0] : undefined;
    expect(table?.type === 'table' && table.rows).toEqual([['']]);
  });

  it.each([
    [
      '公文没写发文单位',
      { doc: { docType: 'official', title: '通报', blocks: [{ type: 'paragraph', text: 'x' }] }, dataSource: 'a' },
      'doc.official.issuer is required'
    ],
    [
      '普通文档却带了公文头',
      {
        doc: { title: '报告', official: { issuer: '办公室' }, blocks: [{ type: 'paragraph', text: 'x' }] },
        dataSource: 'a'
      },
      'doc.official only belongs on an "official" document'
    ],
    [
      '表格某行的列数对不上',
      {
        doc: { title: '报告', blocks: [{ type: 'table', columns: ['A', 'B'], rows: [['只有一格']] }] },
        dataSource: 'a'
      },
      'has 1 cells but there are 2 columns'
    ],
    [
      '表格某一格写成了富文本对象',
      {
        doc: {
          title: '报告',
          blocks: [{ type: 'table', columns: ['A'], rows: [[{ type: 'text', text: '支付' }]] }]
        },
        dataSource: 'a'
      },
      'doc.blocks[0].rows[0][0] must be a string, number or boolean'
    ],
    [
      '列表某一条写成了对象数组',
      {
        doc: { title: '报告', blocks: [{ type: 'list', items: [[{ text: '第一条' }]] }] },
        dataSource: 'a'
      },
      'doc.blocks[0].items[0] must be a string, number or boolean'
    ],
    [
      '指标的值写成了对象',
      {
        doc: { title: '报告', blocks: [{ type: 'metrics', items: [{ label: '缺陷总数', value: { n: 1284 } }] }] },
        dataSource: 'a'
      },
      'doc.blocks[0].items[0].value must be a string, number or boolean'
    ],
    [
      '图表的数值写成了字符串',
      {
        doc: {
          title: '报告',
          blocks: [{ type: 'chart', chartType: 'bar', labels: ['一'], series: [{ name: 'x', values: ['3'] }] }]
        },
        dataSource: 'a'
      },
      'must be a number, not a string'
    ],
    ['正文为空', { doc: { title: '报告', blocks: [] }, dataSource: 'a' }, 'doc.blocks must be a non-empty array'],
    [
      '图片没写引用',
      { doc: { title: '报告', blocks: [{ type: 'image', alt: '一张图' }] }, dataSource: 'a' },
      'doc.blocks[0].ref is required'
    ],
    [
      '图片引用没有定位前缀',
      { doc: { title: '报告', blocks: [{ type: 'image', ref: 'chart-1.png', alt: '一张图' }] }, dataSource: 'a' },
      'needs one of these prefixes: artifact:, upload:, remote:'
    ],
    [
      '图片没写替代文本',
      { doc: { title: '报告', blocks: [{ type: 'image', ref: 'artifact:a.png' }] }, dataSource: 'a' },
      'doc.blocks[0].alt is required'
    ],
    [
      '图片自报了宽高',
      {
        doc: { title: '报告', blocks: [{ type: 'image', ref: 'artifact:a.png', alt: '图', width: 4000 }] },
        dataSource: 'a'
      },
      'must not declare width, height or mimeType'
    ],
    [
      '没说数据出处',
      { doc: { title: '报告', blocks: [{ type: 'paragraph', text: 'x' }] }, dataSource: '' },
      'dataSource is empty'
    ]
  ])('挡回：%s', async (_name, input, message) => {
    const { rejected, artifacts } = await publish(module, input);
    expect(rejected).toContain(message);
    expect(artifacts.size).toBe(0);
  });
});

describe('authored-slides 的结构化投放', () => {
  let module: PublishModule;
  beforeAll(async () => {
    module = await load('authored-slides');
  });

  const deck = {
    deck: {
      title: '三季度经营分析',
      theme: 'dark',
      slides: [
        {
          layout: 'cover',
          title: '三季度经营分析',
          subtitle: '经营管理部',
          body: [],
          meta: [{ label: '汇报日期', value: '2024-10-09' }]
        },
        {
          layout: 'split',
          title: '总体盘面',
          body: [
            {
              type: 'metrics',
              items: [
                { label: '总收入', value: '2 530 万', change: '+12.4%', trend: 'up' },
                { label: '毛利率', value: '41.2%' }
              ]
            },
            CHART
          ],
          takeaway: '收入连续三个月环比上升，增速在 9 月见顶。'
        },
        {
          layout: 'closing',
          title: '下一步',
          body: [{ type: 'bullets', items: ['复盘风控续约', '追加数据人力', '四季度目标 2 800 万'] }],
          takeaway: '把增长从一条线扩展到两条线。'
        }
      ]
    },
    dataSource: '页面：经营看板'
  };

  it('屏幕上的版式与另存件的版式来自同一个模型', async () => {
    const { rejected, artifacts } = await publish(module, deck);
    expect(rejected).toBeUndefined();
    const html = artifacts.get('deck.html') ?? '';
    // 放映引擎认这两个标记，少一个整份就退化成一张长网页
    expect(html).toContain('data-viewer-mode="slides"');
    expect(html).toContain('<div class="slides">');
    expect(html).toContain('data-layout="split"');
    expect(classifyExportKind(rootOf(html))).toBe('pptx');

    const doc = extractExportDoc(html);
    expect(doc.kind).toBe('slides');
    expect(doc.pages.map((page) => page.layout)).toEqual(['cover', 'split', 'closing']);
    // 两栏必须还是两栏：槽位分组丢了，PPTX 就只能把整页摊成一列
    expect(doc.pages[1]?.regions?.length).toBe(2);
    expect(doc.pages[1]?.takeaway).toBe('收入连续三个月环比上升，增速在 9 月见顶。');
    expect(doc.theme?.background).toBe('#0f1b2e');
  });

  it('字号由技能独占，模型交不出「小字」', async () => {
    const { artifacts } = await publish(module, deck);
    const css = artifacts.get('deck.css') ?? '';
    // 幻灯片舞台是 1600×900：正文低于 24px 在投屏上就认不出了
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(22);
    // 而模型这一侧根本没有写样式的入口
    const module2 = (await import(pathToFileURL(resolve(BUILTIN, 'authored-slides', 'scripts/publish.js')).href)) as {
      inputSchema: { properties: Record<string, unknown> };
    };
    expect(Object.keys(module2.inputSchema.properties).sort()).toEqual(['dataSource', 'deck']);
  });

  it('图片槽位与公文侧共用同一个块形状', async () => {
    const { rejected, artifacts } = await publish(module, {
      deck: {
        title: 'x',
        slides: [
          { layout: 'cover', title: '封面', body: [] },
          { layout: 'single', title: '一页', body: [IMAGE], takeaway: '这是一句完整的结论。' },
          { layout: 'section', title: '过渡', body: [] }
        ]
      },
      dataSource: 'a'
    });
    expect(rejected).toBeUndefined();
    const html = artifacts.get('deck.html') ?? '';
    const img = rootOf(html)?.querySelector('img');
    expect(img?.getAttribute('data-webskill-image')).toBe('artifact:capture-1.png');
    expect(img?.hasAttribute('src')).toBe(false);

    // 同一个 IMAGE 常量在公文与幻灯片两侧都原样还得回来，说明两边不是各定义一份
    const model = readAuthoredModel(rootOf(html));
    const item = model?.kind === 'deck' ? model.slides[1]?.body[0] : undefined;
    expect(item).toEqual(IMAGE);
  });

  it.each([
    ['两栏版式只给了一格', 1, 'holds 2 body items but got 1'],
    ['两栏版式塞了三格', 3, 'holds 2 body items but got 3']
  ])('挡回：%s', async (_name, count, message) => {
    const body = Array.from({ length: count }, () => CHART);
    const { rejected } = await publish(module, {
      deck: {
        title: 'x',
        slides: [
          { layout: 'cover', title: '封面', body: [] },
          { layout: 'split', title: '一页', body, takeaway: '这是一句完整的结论。' },
          {
            layout: 'closing',
            title: '收尾',
            body: [{ type: 'bullets', items: ['一', '二', '三'] }],
            takeaway: '结束语在此。'
          }
        ]
      },
      dataSource: 'a'
    });
    expect(rejected).toContain(message);
  });

  it.each([
    [
      '正文页没写结论，底栏会空一条',
      {
        layout: 'single',
        title: '一页',
        body: [CHART]
      },
      'takeaway is required'
    ],
    [
      '一格里只有两条要点',
      {
        layout: 'single',
        title: '一页',
        body: [{ type: 'bullets', items: ['一', '二'] }],
        takeaway: '这是一句完整的结论。'
      },
      'needs at least 3 or the slide reads as empty'
    ],
    [
      '整页只有一段话',
      {
        layout: 'single',
        title: '一页',
        body: [{ type: 'paragraph', text: '这一段话足够长，长到能通过长度校验，但它撑不满一整张幻灯片。' }],
        takeaway: '这是一句完整的结论。'
      },
      'leaves the stage almost empty'
    ]
  ])('挡回版面过空：%s', async (_name, slide, message) => {
    const { rejected } = await publish(module, {
      deck: {
        title: 'x',
        slides: [{ layout: 'cover', title: '封面', body: [] }, slide, { layout: 'section', title: '过渡', body: [] }]
      },
      dataSource: 'a'
    });
    expect(rejected).toContain(message);
  });

  it.each([
    ['图片没写引用', { type: 'image', alt: '一张图' }, '.ref is required'],
    ['图片引用没有定位前缀', { type: 'image', ref: 'a.png', alt: '一张图' }, 'needs one of these prefixes'],
    ['图片没写替代文本', { type: 'image', ref: 'artifact:a.png' }, '.alt is required'],
    [
      '图片自报了宽高',
      { type: 'image', ref: 'artifact:a.png', alt: '图', height: 3000 },
      'must not declare width, height or mimeType'
    ]
  ])('挡回：%s', async (_name, item, message) => {
    const { rejected } = await publish(module, {
      deck: {
        title: 'x',
        slides: [
          { layout: 'cover', title: '封面', body: [] },
          { layout: 'single', title: '一页', body: [item], takeaway: '这是一句完整的结论。' },
          { layout: 'section', title: '过渡', body: [] }
        ]
      },
      dataSource: 'a'
    });
    expect(rejected).toContain(message);
  });

  it('挡回：整份一个数据都没有', async () => {
    const { rejected } = await publish(module, {
      deck: {
        title: 'x',
        slides: [
          { layout: 'cover', title: '封面', body: [] },
          {
            layout: 'single',
            title: '一页',
            body: [{ type: 'bullets', items: ['一条', '两条', '三条'] }],
            takeaway: '这是一句完整的结论。'
          },
          {
            layout: 'closing',
            title: '收尾',
            body: [{ type: 'bullets', items: ['一', '二', '三'] }],
            takeaway: '把增长从一条线扩展到两条线。'
          }
        ]
      },
      dataSource: 'a'
    });
    expect(rejected).toContain('not one slide carries a chart, table, image, metrics or keyValue');
  });

  it('挡回：不足三页', async () => {
    const { rejected } = await publish(module, {
      deck: { title: 'x', slides: [{ layout: 'cover', title: '封面', body: [] }] },
      dataSource: 'a'
    });
    expect(rejected).toContain('needs at least 3 slides');
  });
});

describe('authored-screen 的表格约束', () => {
  const ROOT = '<div class="screen" data-viewer-chrome="hidden">';
  const CSS = '.screen { height: 100vh; overflow: hidden; display: grid; }\n.screen__body { min-height: 0; }';

  it('挡回手写的原生表格', async () => {
    const module = await load('authored-screen');
    const { rejected, artifacts } = await publish(module, {
      html: `${ROOT}<table><tr><td>一区</td><td>128</td></tr></table></div>`,
      css: CSS,
      dataSource: 'a'
    });
    expect(rejected).toContain('hand-written <table> is not allowed');
    expect(rejected).toContain('Table placeholder');
    expect(artifacts.size).toBe(0);
  });

  it('放行 Table 占位', async () => {
    const module = await load('authored-screen');
    const props = '{"columns":["区域","完成量"],"rows":[["一区",128]]}';
    const { rejected } = await publish(module, {
      html: `${ROOT}<div data-webskill-component="Table" data-webskill-props='${props}'></div></div>`,
      css: CSS,
      dataSource: 'a'
    });
    expect(rejected).toBeUndefined();
  });
});

describe('图片块的畸形判定（FR-11.4）', () => {
  /** 直接喂一份模型 JSON，绕开技能校验——这里测的是读回这一侧的兜底 */
  const read = (blocks: unknown[]) => {
    const root = document.createElement('div');
    root.setAttribute(
      'data-webskill-doc-model',
      JSON.stringify({ kind: 'document', docType: 'plain', title: 't', blocks })
    );
    const model = readAuthoredModel(root);
    return model?.kind === 'document' ? model.blocks : undefined;
  };

  it('引用与替代文本齐全时原样读回，宽高等声明一律不采信', () => {
    expect(read([{ ...IMAGE, width: 4000, height: 3000, mimeType: 'image/png' }])).toEqual([IMAGE]);
  });

  it.each([
    ['没有引用', { type: 'image', alt: '一张图' }],
    ['引用是空串', { type: 'image', ref: '', alt: '一张图' }],
    ['引用不是字符串', { type: 'image', ref: 123, alt: '一张图' }],
    ['没有替代文本', { type: 'image', ref: 'artifact:a.png' }],
    ['替代文本是空串', { type: 'image', ref: 'artifact:a.png', alt: '' }],
    ['替代文本不是字符串', { type: 'image', ref: 'artifact:a.png', alt: { zh: '图' } }]
  ])('整块丢弃而不是产出空块：%s', (_name, block) => {
    // 前后两个正常块还在，说明丢的是这一块而不是整份
    expect(read([{ type: 'divider' }, block, { type: 'pageBreak' }])).toEqual([
      { type: 'divider' },
      { type: 'pageBreak' }
    ]);
  });
});
