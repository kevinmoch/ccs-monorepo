// @vitest-environment jsdom
/**
 * 导出保留图片（0.22.0 分册 14 AC-14.1 ~ AC-14.7）。
 *
 * 断言落在**解包后的 OOXML 字节**上：`AC-14.1` 明写了不接受「编码过程没报错」。
 */
import { unzipWithLimits } from '@webskill/core';
import { describe, expect, it } from 'vitest';
import { encodeDocx } from '../src/viewer/export/docx';
import { extractExportDoc, type ExportDoc } from '../src/viewer/export/extract';
import type { DocImage } from '../src/viewer/export/image';
import { encodePptx } from '../src/viewer/export/pptx';

/** 4×3 真 PNG；断言比对的就是这 97 个字节 */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAKElEQVR4nAXBMQEAAAjDsApDxORwVspEIJAEcHDxEOLEjRehTt169QHjtw35+qrLrAAAAABJRU5ErkJggg==';
const PNG_URL = `data:image/png;base64,${PNG_B64}`;
const PNG_BYTES = Uint8Array.from(atob(PNG_B64), (ch) => ch.charCodeAt(0));

/** 内容无关：编码器不解码，只搬字节；用它证明 JPEG 这条支路也真的走通 */
const JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAE=';
const JPEG_URL = `data:image/jpeg;base64,${JPEG_B64}`;

const sized = (url: string, alt: string): DocImage => ({ url, width: 4, height: 3, alt });

const bulletin = (body: string): string =>
  `<!doctype html><html><body><article class="wsdoc">${body}</article></body></html>`;

async function entries(blob: Blob): Promise<[string, Uint8Array][]> {
  return await unzipWithLimits(new Uint8Array(await blob.arrayBuffer()));
}

function partText(parts: [string, Uint8Array][], match: (name: string) => boolean): string {
  return parts
    .filter(([name]) => match(name))
    .map(([, bytes]) => new TextDecoder().decode(bytes))
    .join('\n');
}

describe('导出保留图片', () => {
  it('AC-14.3 · 手写 HTML 里的 data: 图片活着穿过 DOM 抽取', () => {
    const doc = extractExportDoc(bulletin(`<p>前言</p><img src="${PNG_URL}" alt="流程示意" /><p>后记</p>`), {
      docImages: [sized(PNG_URL, '流程示意')]
    });
    const blocks = doc.pages[0]?.blocks ?? [];
    const image = blocks.find((block) => block.kind === 'image');
    expect(image).toBeDefined();
    expect(image).toMatchObject({ kind: 'image', image: { url: PNG_URL, width: 4, height: 3, alt: '流程示意' } });
    // 前后的文字一个都不能因为多了一张图而掉队
    expect(blocks.filter((block) => block.kind === 'paragraph')).toHaveLength(2);
    expect(doc.omissions.some((item) => item.kind === 'image-dropped')).toBe(false);
  });

  it('AC-14.4 · 丢图的归因说得出是哪一张、为什么', () => {
    const doc = extractExportDoc(
      bulletin(
        `<img src="https://cdn.example.com/a.png" alt="外链图" />` +
          `<img src="data:image/webp;base64,AAAA" alt="不支持的类型" />` +
          `<img src="data:image/png;base64,${PNG_B64}" alt="没量到尺寸" />`
      )
    );
    const dropped = doc.omissions.find((item) => item.kind === 'image-dropped');
    expect(dropped?.count).toBe(3);
    expect(dropped?.images).toEqual([
      { alt: '外链图', source: 'https://cdn.example.com/a.png', reason: 'external-link' },
      { alt: '不支持的类型', source: 'data:image/webp;base64,AAAA', reason: 'unsupported-type' },
      { alt: '没量到尺寸', source: PNG_URL, reason: 'not-loaded' }
    ]);
  });

  it('AC-14.5 · 丢掉的图把替代文本留在正文里，中英各一份', () => {
    const html = bulletin(`<img src="https://cdn.example.com/a.png" alt="产能曲线" />`);
    const en = extractExportDoc(html).pages[0]?.blocks ?? [];
    const zh = extractExportDoc(html, { zh: true }).pages[0]?.blocks ?? [];
    expect(en[0]).toMatchObject({
      kind: 'paragraph',
      runs: [
        { text: '[image not included: 产能曲线] It is an external link, so the export could not fetch its bytes.' }
      ]
    });
    expect(zh[0]).toMatchObject({
      kind: 'paragraph',
      runs: [{ text: '［未包含的图片：产能曲线］这是一张外链图片，另存时取不到它的字节。' }]
    });
  });

  it('AC-14.1 · DOCX 的 word/media 里躺着与源图逐字节相同的那张图', async () => {
    const doc: ExportDoc = {
      kind: 'bulletin',
      title: '带图公文',
      omissions: [],
      pages: [
        {
          blocks: [
            { kind: 'image', image: sized(PNG_URL, '流程示意'), caption: '图 1 流程' },
            { kind: 'image', image: sized(JPEG_URL, '现场照片') }
          ]
        }
      ]
    };
    const encoded = await encodeDocx(doc);
    const parts = await entries(encoded.blob);
    const media = parts.filter(([name]) => /^word\/media\/.+/.test(name));
    expect(media).toHaveLength(2);
    expect(
      media.some(([, bytes]) => bytes.length === PNG_BYTES.length && bytes.every((b, i) => b === PNG_BYTES[i]))
    ).toBe(true);
    // 替代文本与题注都要进文档，不能只剩一张无名图
    const xml = partText(parts, (name) => name === 'word/document.xml');
    expect(xml).toMatch(/descr="流程示意"|name="流程示意"/);
    expect(xml).toMatch(/<w:t[^>]*>图 1 流程<\/w:t>/);
    expect(encoded.omissions.some((item) => item.kind === 'image-dropped')).toBe(false);
  }, 30_000);

  it('AC-14.2 · PPTX 的 ppt/media 里躺着与源图逐字节相同的那张图', async () => {
    const doc: ExportDoc = {
      kind: 'slides',
      title: '带图汇报',
      omissions: [],
      pages: [{ title: '现场', blocks: [{ kind: 'image', image: sized(PNG_URL, '流程示意'), caption: '图 1 流程' }] }]
    };
    const encoded = await encodePptx(doc);
    const parts = await entries(encoded.blob);
    const media = parts.filter(([name]) => /^ppt\/media\/.+/.test(name));
    expect(media).toHaveLength(1);
    const bytes = media[0]?.[1] ?? new Uint8Array();
    expect(bytes.length).toBe(PNG_BYTES.length);
    expect(bytes.every((b, i) => b === PNG_BYTES[i])).toBe(true);
    const xml = partText(parts, (name) => name.startsWith('ppt/slides/slide'));
    expect(xml).toContain('流程示意');
    expect(xml).toContain('图 1 流程');
  }, 30_000);

  it('AC-14.6 · 同一份文档，两个编码器对「这张图在不在」得出同一个结论', async () => {
    const blocks: ExportDoc['pages'][number]['blocks'] = [
      { kind: 'image', image: sized(PNG_URL, '嵌得进去的图') },
      { kind: 'paragraph', runs: [{ text: '[image not included: 外链图] ...' }] }
    ];
    const docx = await encodeDocx({ kind: 'bulletin', title: 'A', omissions: [], pages: [{ blocks }] });
    const pptx = await encodePptx({ kind: 'slides', title: 'A', omissions: [], pages: [{ title: 'A', blocks }] });
    const docxMedia = (await entries(docx.blob)).filter(([name]) => /^word\/media\/.+/.test(name));
    const pptxMedia = (await entries(pptx.blob)).filter(([name]) => /^ppt\/media\/.+/.test(name));
    expect(docxMedia).toHaveLength(1);
    expect(pptxMedia).toHaveLength(1);
    expect(partText(await entries(docx.blob), (n) => n === 'word/document.xml')).toContain('image not included');
    expect(partText(await entries(pptx.blob), (n) => n.startsWith('ppt/slides/slide'))).toContain('image not included');
  }, 30_000);

  it('AC-14.7 · 图表的画布快照仍走原路：贴图 + 数据表，归因不变', async () => {
    const encoded = await encodeDocx({
      kind: 'bulletin',
      title: '带图表公文',
      omissions: [],
      pages: [
        {
          blocks: [
            {
              kind: 'chart',
              props: {
                type: 'bar',
                labels: ['A'],
                series: [{ name: 'S', values: [1] }],
                image: { url: PNG_URL, width: 4, height: 3 }
              }
            }
          ]
        }
      ]
    });
    expect(encoded.omissions.map((item) => item.kind)).toContain('chart-as-picture');
    expect(encoded.omissions.some((item) => item.kind === 'image-dropped')).toBe(false);
    const parts = await entries(encoded.blob);
    expect(parts.filter(([name]) => /^word\/media\/.+/.test(name))).toHaveLength(1);
  }, 30_000);
});
