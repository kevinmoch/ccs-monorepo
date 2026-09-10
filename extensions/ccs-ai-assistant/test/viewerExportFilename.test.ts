/**
 * 文件名清洗（0.21.0 分册 15 AC-15.8）。
 *
 * 标题来自模型产出的 HTML，所以这里的输入全部按**不可信**对待。
 */
import { describe, expect, it } from 'vitest';
import { sanitizeExportFilename } from '../src/viewer/export/filename';

describe('sanitizeExportFilename', () => {
  it('正常标题原样保留，只补扩展名', () => {
    expect(sanitizeExportFilename('2024 年度汇报', 'pptx')).toBe('2024 年度汇报.pptx');
  });

  it('路径分隔符与穿越片段全部剔除', () => {
    expect(sanitizeExportFilename('../../etc/passwd', 'docx')).toBe('etcpasswd.docx');
    expect(sanitizeExportFilename('a/b\\c', 'docx')).toBe('abc.docx');
  });

  it('Windows 保留字符与控制字符剔除', () => {
    expect(sanitizeExportFilename('report:*?"<>|v1', 'pptx')).toBe('reportv1.pptx');
    expect(sanitizeExportFilename('a\u0000b\u001fc\u007f', 'pptx')).toBe('abc.pptx');
  });

  it('Windows 保留设备名前面加下划线，否则文件根本存不下来', () => {
    expect(sanitizeExportFilename('CON', 'docx')).toBe('_CON.docx');
    expect(sanitizeExportFilename('com9', 'pptx')).toBe('_com9.pptx');
    expect(sanitizeExportFilename('console', 'pptx')).toBe('console.pptx');
  });

  it('首尾的点会被系统吞掉，先自己去掉', () => {
    expect(sanitizeExportFilename('...草稿...', 'docx')).toBe('草稿.docx');
  });

  it('空白折叠并首尾修剪', () => {
    expect(sanitizeExportFilename('  年度\n\n 汇报  ', 'pptx')).toBe('年度 汇报.pptx');
  });

  it('按码位截断到 80，不会把一个汉字劈成两半', () => {
    const name = sanitizeExportFilename('汉'.repeat(200), 'pptx');
    expect(Array.from(name.replace('.pptx', ''))).toHaveLength(80);
    expect(name).not.toContain('\ufffd');
  });

  it('清洗到空就用缺省名，绝不产出一个只有扩展名的文件', () => {
    expect(sanitizeExportFilename('', 'pptx')).toBe('webskill-slides.pptx');
    expect(sanitizeExportFilename('///', 'docx')).toBe('webskill-document.docx');
    expect(sanitizeExportFilename('   ', 'docx')).toBe('webskill-document.docx');
  });
});
