// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createPptxSourceReader } from '../src/shared/pptxSource';

/**
 * pptx 原件解包（0.21.0 分册 12 AC-12.17）。
 *
 * 用 `zipSync` 现搭包而不是塞一个二进制 fixture：判据说的是「包长这样时读出什么」，
 * 包的形状必须在用例里看得见。
 */

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** 一个形状：段落之间是换行，段落内的 run 直接相接 */
function shape(...paragraphs: string[][]): string {
  const body = paragraphs
    .map((runs) => `<a:p>${runs.map((run) => `<a:t>${run}</a:t>`).join('')}</a:p>`)
    .join('');
  return `<p:sp xmlns:a="${A}"><p:txBody>${body}</p:txBody></p:sp>`;
}

function slideXml(...shapes: string[]): string {
  return `<?xml version="1.0"?><p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`;
}

function relsXml(entries: { id: string; target: string; external?: boolean }[]): string {
  const body = entries
    .map(
      ({ id, target, external }) =>
        `<Relationship Id="${id}" Target="${target}"${external === true ? ' TargetMode="External"' : ''}/>`
    )
    .join('');
  return `<?xml version="1.0"?><Relationships xmlns="${PKG}">${body}</Relationships>`;
}

function presentationXml(...relIds: string[]): string {
  const body = relIds.map((id, index) => `<p:sldId id="${256 + index}" r:id="${id}"/>`).join('');
  return `<?xml version="1.0"?><p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${body}</p:sldIdLst></p:presentation>`;
}

/** 一像素 PNG。内容不重要，判据只问「有没有被当成图收下来」 */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function pack(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(files)) {
    entries[name] = typeof value === 'string' ? strToU8(value) : value;
  }
  return zipSync(entries);
}

const read = async (files: Record<string, string | Uint8Array>) =>
  await createPptxSourceReader().read(pack(files));

describe('pptx 原件解包（AC-12.17）', () => {
  it('包里没有 ppt/presentation.xml 的 zip 一页都读不出来', async () => {
    const document = await read({ 'hello.txt': 'not a deck', 'ppt/slides/slide1.xml': slideXml(shape(['x'])) });
    expect(document.slides).toEqual([]);
  });

  it('放映顺序取自 sldIdLst，不是文件名里的数字', async () => {
    const document = await read({
      'ppt/presentation.xml': presentationXml('rId9', 'rId1'),
      'ppt/_rels/presentation.xml.rels': relsXml([
        { id: 'rId1', target: 'slides/slide1.xml' },
        { id: 'rId9', target: 'slides/slide9.xml' }
      ]),
      'ppt/slides/slide1.xml': slideXml(shape(['第一个文件'])),
      'ppt/slides/slide9.xml': slideXml(shape(['第一张放映']))
    });
    expect(document.slides.map((slide) => slide.texts)).toEqual([['第一张放映'], ['第一个文件']]);
  });

  it('一个形状一条，段落之间换行，run 直接相接', async () => {
    const document = await read({
      'ppt/presentation.xml': presentationXml('rId1'),
      'ppt/_rels/presentation.xml.rels': relsXml([{ id: 'rId1', target: 'slides/slide1.xml' }]),
      'ppt/slides/slide1.xml': slideXml(shape(['强电', '专业设计'], ['第二段']), shape(['另一个形状']))
    });
    expect(document.slides[0]?.texts).toEqual(['强电专业设计\n第二段', '另一个形状']);
  });

  it('图只认这一页 rels 里的 media，母版上的模板底图不进任何一页', async () => {
    const document = await read({
      'ppt/presentation.xml': presentationXml('rId1'),
      'ppt/_rels/presentation.xml.rels': relsXml([{ id: 'rId1', target: 'slides/slide1.xml' }]),
      'ppt/slides/slide1.xml': slideXml(shape(['配图说明'])),
      'ppt/slides/_rels/slide1.xml.rels': relsXml([
        { id: 'rId1', target: '../media/image1.png' },
        { id: 'rId2', target: 'https://example.com/logo.png', external: true }
      ]),
      'ppt/media/image1.png': PNG,
      // 母版引着另一张图。它没有出现在任何一页的 rels 里，所以一页也不该拿到它
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': relsXml([{ id: 'rId1', target: '../media/backdrop.png' }]),
      'ppt/media/backdrop.png': PNG
    });
    const [slide] = document.slides;
    expect(slide?.images).toHaveLength(1);
    expect(slide?.images[0]?.mimeType).toBe('image/png');
    expect(slide?.images[0]?.data).toBe(btoa(String.fromCharCode(...PNG)));
    expect(slide?.skippedMedia).toBe(0);
  });

  it('浏览器解不了的媒体不进图片清单，但计进读不出来的那个数', async () => {
    const document = await read({
      'ppt/presentation.xml': presentationXml('rId1'),
      'ppt/_rels/presentation.xml.rels': relsXml([{ id: 'rId1', target: 'slides/slide1.xml' }]),
      'ppt/slides/slide1.xml': slideXml(shape(['有图有视频'])),
      'ppt/slides/_rels/slide1.xml.rels': relsXml([
        { id: 'rId1', target: '../media/scan.tiff' },
        { id: 'rId2', target: '../media/clip.mp4' },
        { id: 'rId3', target: '../media/photo.png' }
      ]),
      'ppt/media/scan.tiff': PNG,
      'ppt/media/clip.mp4': PNG,
      'ppt/media/photo.png': PNG
    });
    expect(document.slides[0]?.images).toHaveLength(1);
    expect(document.slides[0]?.skippedMedia).toBe(2);
  });

  it('备注读得到，页码占位符那条不算备注', async () => {
    const notes = `<?xml version="1.0"?><p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${shape(['*'])}${shape(['这页只讲一分钟'])}</p:spTree></p:cSld></p:notes>`;
    const document = await read({
      'ppt/presentation.xml': presentationXml('rId1'),
      'ppt/_rels/presentation.xml.rels': relsXml([{ id: 'rId1', target: 'slides/slide1.xml' }]),
      'ppt/slides/slide1.xml': slideXml(shape(['正文'])),
      'ppt/slides/_rels/slide1.xml.rels': relsXml([{ id: 'rId1', target: '../notesSlides/notesSlide1.xml' }]),
      'ppt/notesSlides/notesSlide1.xml': notes
    });
    expect(document.slides[0]?.notes).toBe('这页只讲一分钟');
  });

  it('没有备注页时回空串，不是整页失败', async () => {
    const document = await read({
      'ppt/presentation.xml': presentationXml('rId1'),
      'ppt/_rels/presentation.xml.rels': relsXml([{ id: 'rId1', target: 'slides/slide1.xml' }]),
      'ppt/slides/slide1.xml': slideXml(shape(['只有正文']))
    });
    expect(document.slides[0]).toMatchObject({ texts: ['只有正文'], notes: '', images: [], skippedMedia: 0 });
  });

  it('表格里的字算一条，不会被当成标签吞掉', async () => {
    // 探测阶段用 `<a:t[^>]*>` 抓文本时，`<a:tblPr/>` / `<a:tblGrid>` 被一起吞进来，
    // 一页算出 18 万字符的「正文」。解析器不会犯这个错，这条用例把它钉住
    const table = `<p:graphicFrame xmlns:a="${A}"><a:graphic><a:graphicData><a:tbl><a:tblPr/><a:tblGrid><a:gridCol/></a:tblGrid><a:tr><a:tc><a:txBody><a:p><a:t>单元格</a:t></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    const document = await read({
      'ppt/presentation.xml': presentationXml('rId1'),
      'ppt/_rels/presentation.xml.rels': relsXml([{ id: 'rId1', target: 'slides/slide1.xml' }]),
      'ppt/slides/slide1.xml': slideXml(table)
    });
    expect(document.slides[0]?.texts).toEqual(['单元格']);
  });
});
