/**
 * authored-bulletin 投放：收**结构化文档模型**，渲染成文档窗口里的 HTML/CSS，
 * 并把原样模型挂回根节点供另存使用。
 *
 * 为什么不再收 HTML：屏幕上那份和另存下来那份以前是两条独立通路——一条吃模型手写的
 * HTML+CSS，另一条从 DOM 上把残渣刮回来，于是「看到的」和「存下来的」必然不一样。
 * 现在两边读同一个 JSON，不一致就成了缺陷而不是宿命。
 *
 * 校验放在这里而不是交给窗口兜底：窗口对坏数据只会就地显示一行英文提示，
 * 用户得先开窗口才发现；在这里挡下来，模型当场就能改。
 */

const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'scatter', 'stacked-bar', 'dual-axis'];
const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'list',
  'table',
  'chart',
  'image',
  'metrics',
  'keyValue',
  'callout',
  'quote',
  'divider',
  'pageBreak'
];
const TONES = ['info', 'success', 'warning', 'danger'];
/** 图片引用的定位前缀；字节由引擎在投放前按引用填入，技能不搬运字节 */
const IMAGE_REF_PREFIXES = ['artifact:', 'upload:', 'remote:'];

/** 屏幕与另存件共用的一组取色；写进模型里带走，编码器不再自己配色 */
const PALETTE = {
  background: '#ffffff',
  surface: '#f5f7fa',
  text: '#1a1a1a',
  muted: '#5c6b7f',
  accent: '#1a6fd4',
  border: '#d8dee8'
};

// ---------------------------------------------------------------- 校验

function validate(doc, dataSource) {
  const issues = [];
  if (typeof dataSource !== 'string' || dataSource.trim() === '') {
    issues.push('dataSource is empty; state where the numbers came from');
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    issues.push('doc must be an object shaped like references/authoring.md');
    return issues;
  }
  if (typeof doc.title !== 'string' || doc.title.trim() === '') issues.push('doc.title is required');

  const docType = doc.docType === undefined ? 'plain' : doc.docType;
  if (docType !== 'plain' && docType !== 'official') {
    issues.push('doc.docType must be "plain" (an ordinary Word document) or "official" (a red-header bulletin)');
  }
  if (docType === 'official') {
    const issuer = doc.official && doc.official.issuer;
    if (typeof issuer !== 'string' || issuer.trim() === '') {
      issues.push(
        'doc.docType is "official" so doc.official.issuer is required; ask the user rather than inventing one'
      );
    }
  } else if (doc.official !== undefined) {
    issues.push('doc.official only belongs on an "official" document; a plain Word document has no red header');
  }

  if (!Array.isArray(doc.blocks) || doc.blocks.length === 0) {
    issues.push('doc.blocks must be a non-empty array');
    return issues;
  }
  doc.blocks.forEach((block, index) => {
    for (const issue of blockIssues(block, `doc.blocks[${index}]`)) issues.push(issue);
  });
  return issues;
}

function blockIssues(block, at) {
  const issues = [];
  if (typeof block !== 'object' || block === null || Array.isArray(block)) return [`${at} must be an object`];
  if (!BLOCK_TYPES.includes(block.type)) {
    return [`${at}.type "${String(block.type)}" is unknown; allowed: ${BLOCK_TYPES.join(', ')}`];
  }
  switch (block.type) {
    case 'heading':
      if (!isText(block.text)) issues.push(`${at}.text is required`);
      if (![1, 2, 3].includes(block.level)) issues.push(`${at}.level must be 1, 2 or 3`);
      break;
    case 'paragraph':
      if (!isText(block.text)) issues.push(`${at}.text is required`);
      break;
    case 'list':
      if (!Array.isArray(block.items) || block.items.length === 0) {
        issues.push(`${at}.items must be a non-empty array`);
      } else {
        block.items.forEach((item, i) => {
          if (!isScalar(item)) issues.push(notScalar(`${at}.items[${i}]`));
        });
      }
      break;
    case 'table':
      for (const issue of tableIssues(block, at)) issues.push(issue);
      break;
    case 'chart':
      for (const issue of chartIssues(block, at)) issues.push(issue);
      break;
    case 'image':
      for (const issue of imageIssues(block, at)) issues.push(issue);
      break;
    case 'metrics':
      if (!Array.isArray(block.items) || block.items.length === 0) {
        issues.push(`${at}.items must be a non-empty array`);
      } else if (block.items.length > 6) {
        issues.push(`${at}.items has ${block.items.length} metrics; keep it to 6 so one row still fits the page`);
      } else {
        block.items.forEach((item, i) => {
          if (!item || !isText(item.label)) issues.push(`${at}.items[${i}].label is required`);
          if (!item || item.value === undefined || item.value === null) {
            issues.push(`${at}.items[${i}].value is required`);
          } else if (!isScalar(item.value)) {
            issues.push(notScalar(`${at}.items[${i}].value`));
          }
        });
      }
      break;
    case 'keyValue':
      if (!Array.isArray(block.items) || block.items.length === 0) {
        issues.push(`${at}.items must be a non-empty array`);
      } else {
        block.items.forEach((item, i) => {
          if (typeof item !== 'object' || item === null) {
            issues.push(`${at}.items[${i}] must be an object with a label and a value`);
            return;
          }
          if (!isText(item.label)) issues.push(`${at}.items[${i}].label is required`);
          if (item.value !== undefined && item.value !== null && !isScalar(item.value)) {
            issues.push(notScalar(`${at}.items[${i}].value`));
          }
        });
      }
      break;
    case 'callout':
      if (!isText(block.text)) issues.push(`${at}.text is required`);
      if (block.tone !== undefined && !TONES.includes(block.tone)) {
        issues.push(`${at}.tone must be one of ${TONES.join(', ')}`);
      }
      break;
    case 'quote':
      if (!isText(block.text)) issues.push(`${at}.text is required`);
      break;
    default:
      break;
  }
  return issues;
}

function tableIssues(block, at) {
  const issues = [];
  if (!Array.isArray(block.columns) || block.columns.length === 0) {
    issues.push(`${at}.columns must be a non-empty array of column headers`);
    return issues;
  }
  if (!Array.isArray(block.rows) || block.rows.length === 0) {
    issues.push(`${at}.rows must be a non-empty array`);
    return issues;
  }
  block.columns.forEach((column, i) => {
    if (!isScalar(column)) issues.push(notScalar(`${at}.columns[${i}]`));
  });
  block.rows.forEach((row, i) => {
    if (!Array.isArray(row)) {
      issues.push(`${at}.rows[${i}] must be an array of cells`);
      return;
    }
    if (row.length !== block.columns.length) {
      issues.push(`${at}.rows[${i}] has ${row.length} cells but there are ${block.columns.length} columns`);
    }
    row.forEach((cell, j) => {
      if (cell !== null && !isScalar(cell)) issues.push(notScalar(`${at}.rows[${i}][${j}]`));
    });
  });
  return issues;
}

function chartIssues(block, at) {
  const issues = [];
  if (!CHART_TYPES.includes(block.chartType)) {
    issues.push(`${at}.chartType "${String(block.chartType)}" is unknown; allowed: ${CHART_TYPES.join(', ')}`);
  }
  if (!Array.isArray(block.labels) || block.labels.length === 0) {
    issues.push(`${at}.labels must be a non-empty array`);
  } else {
    block.labels.forEach((label, i) => {
      if (!isScalar(label)) issues.push(notScalar(`${at}.labels[${i}]`));
    });
  }
  if (!Array.isArray(block.series) || block.series.length === 0) {
    issues.push(`${at}.series must be a non-empty array`);
    return issues;
  }
  block.series.forEach((series, i) => {
    if (!series || !isText(series.name)) issues.push(`${at}.series[${i}].name is required`);
    if (!series || !Array.isArray(series.values)) {
      issues.push(`${at}.series[${i}].values must be an array of numbers`);
      return;
    }
    if (Array.isArray(block.labels) && series.values.length !== block.labels.length) {
      issues.push(
        `${at}.series[${i}].values has ${series.values.length} numbers but there are ${block.labels.length} labels`
      );
    }
    series.values.forEach((value, j) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push(`${at}.series[${i}].values[${j}] must be a number, not a string`);
      }
    });
  });
  return issues;
}

/**
 * 宽高与 MIME 一律不收：那些是**事实**，由宿主侧解析时实测。
 * 像素数是投放载荷预算的硬兜底维度，让技能自报等于让被限制方自报限额。
 */
function imageIssues(block, at) {
  const issues = [];
  if (!isText(block.ref)) {
    issues.push(`${at}.ref is required; point at an image artifact or an uploaded file`);
  } else if (!IMAGE_REF_PREFIXES.some((prefix) => block.ref.startsWith(prefix))) {
    issues.push(`${at}.ref "${block.ref}" needs one of these prefixes: ${IMAGE_REF_PREFIXES.join(', ')}`);
  }
  if (!isText(block.alt)) {
    issues.push(`${at}.alt is required; it is the only thing left if the image cannot be loaded`);
  }
  if (block.width !== undefined || block.height !== undefined || block.mimeType !== undefined) {
    issues.push(`${at} must not declare width, height or mimeType; the host measures them from the bytes`);
  }
  return issues;
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * 正文里的一格、一条、一个值，只收标量。
 * 放富文本对象（或对象数组）过去的代价是 `String(值)` 在投放页面上印出 `[object Object]`：
 * 文档看着正常、版式完好，只是读不成句——这比当场报错难查得多。
 */
const isScalar = (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const notScalar = (at) =>
  `${at} must be a string, number or boolean. Rich-text objects and arrays are not accepted here; ` +
  'flatten them into plain text first and use "**bold**" if you need emphasis.';

// ---------------------------------------------------------------- 渲染

const escapeText = (value) => scalarText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 和 escapeText 同一个口径，只是不转义：给进 JSON 属性的值用 */
function scalarText(value) {
  return String(isScalar(value) ? value : '');
}

/** JSON 进单引号属性：双引号原样保留，只需处理 & 与 ' */
const escapeAttr = (value) => JSON.stringify(value).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

/** 文本进双引号属性：比 escapeText 多挡两种引号，否则 alt 里一个引号就能拆开标签 */
const escapeAttrText = (value) => escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** `**粗体**` 是模型能表达的唯一内联样式；两侧都还原得出来，所以只放这一种 */
function inline(text) {
  const parts = scalarText(text).split('**');
  return parts
    .map((part, index) => (index % 2 === 1 ? `<strong>${escapeText(part)}</strong>` : escapeText(part)))
    .join('');
}

function normalise(doc) {
  const docType = doc.docType === 'official' ? 'official' : 'plain';
  const model = {
    kind: 'document',
    docType,
    title: String(doc.title).trim(),
    blocks: doc.blocks,
    palette: PALETTE
  };
  if (isText(doc.subtitle)) model.subtitle = doc.subtitle.trim();
  if (Array.isArray(doc.meta) && doc.meta.length > 0) {
    model.meta = doc.meta
      .filter((item) => item && isText(item.label))
      .map((item) => ({ label: scalarText(item.label), value: scalarText(item.value) }));
  }
  if (docType === 'official' && doc.official) {
    const official = { issuer: String(doc.official.issuer).trim() };
    if (isText(doc.official.documentNumber)) official.documentNumber = doc.official.documentNumber.trim();
    if (isText(doc.official.recipient)) official.recipient = doc.official.recipient.trim();
    model.official = official;
  }
  if (doc.signature && (isText(doc.signature.org) || isText(doc.signature.date))) {
    model.signature = {};
    if (isText(doc.signature.org)) model.signature.org = doc.signature.org.trim();
    if (isText(doc.signature.date)) model.signature.date = doc.signature.date.trim();
  }
  return model;
}

function renderHtml(model) {
  const parts = [];
  if (model.official) {
    parts.push(
      `<header class="wsdoc__redhead"><p class="wsdoc__issuer">${escapeText(model.official.issuer)}</p></header>`
    );
    if (model.official.documentNumber) {
      parts.push(`<p class="wsdoc__docnum">${escapeText(model.official.documentNumber)}</p>`);
    }
  }
  parts.push(`<h1 class="wsdoc__title">${escapeText(model.title)}</h1>`);
  if (model.subtitle) parts.push(`<p class="wsdoc__subtitle">${escapeText(model.subtitle)}</p>`);
  if (model.meta && model.meta.length > 0) {
    const items = model.meta
      .map((item) => `<span class="wsdoc__metaitem">${escapeText(item.label)}：${escapeText(item.value)}</span>`)
      .join('');
    parts.push(`<p class="wsdoc__meta">${items}</p>`);
  }
  if (model.official && model.official.recipient) {
    parts.push(`<p class="wsdoc__recipient">${escapeText(model.official.recipient)}</p>`);
  } else if (!model.official) {
    parts.push('<hr class="wsdoc__rule" />');
  }
  for (const block of model.blocks) parts.push(renderBlock(block));
  if (model.signature) {
    const lines = [];
    if (model.signature.org) lines.push(`<p>${escapeText(model.signature.org)}</p>`);
    if (model.signature.date) lines.push(`<p>${escapeText(model.signature.date)}</p>`);
    parts.push(`<footer class="wsdoc__sign">${lines.join('')}</footer>`);
  }

  const attrs = [
    `class="wsdoc wsdoc--${model.docType}"`,
    'data-webskill-doc="document"',
    `data-webskill-doc-model='${escapeAttr(model)}'`
  ].join(' ');
  return `<div ${attrs}><article class="wsdoc__page">${parts.join('')}</article></div>`;
}

function renderBlock(block) {
  switch (block.type) {
    case 'heading':
      return `<h${block.level} class="wsdoc__h${block.level}">${inline(block.text)}</h${block.level}>`;
    case 'paragraph':
      return `<p class="wsdoc__p">${inline(block.text)}</p>`;
    case 'list': {
      const tag = block.ordered === true ? 'ol' : 'ul';
      const items = block.items.map((item) => `<li>${inline(item)}</li>`).join('');
      return `<${tag} class="wsdoc__list">${items}</${tag}>`;
    }
    case 'table': {
      const props = { columns: block.columns.map(scalarText), rows: block.rows };
      if (Array.isArray(block.columnWidths)) props.columnWidths = block.columnWidths;
      const title = isText(block.title) ? `<p class="wsdoc__blocktitle">${escapeText(block.title)}</p>` : '';
      const caption = isText(block.caption) ? `<figcaption>${escapeText(block.caption)}</figcaption>` : '';
      return `<figure class="wsdoc__figure">${title}<div class="wsdoc__table" data-webskill-component="Table" data-webskill-props='${escapeAttr(props)}'></div>${caption}</figure>`;
    }
    case 'chart': {
      const props = { type: block.chartType, labels: block.labels.map(scalarText), series: block.series };
      if (isText(block.title)) props.title = block.title;
      const caption = isText(block.caption) ? `<figcaption>${escapeText(block.caption)}</figcaption>` : '';
      return `<figure class="wsdoc__figure"><div class="wsdoc__chart" data-webskill-component="Chart" data-webskill-props='${escapeAttr(props)}'></div>${caption}</figure>`;
    }
    case 'image': {
      // 故意不写 src：字节由引擎在投放前按 data-webskill-image 填入
      const caption = isText(block.caption) ? `<figcaption>${escapeText(block.caption)}</figcaption>` : '';
      const img = `<img class="wsdoc__image" data-webskill-image="${escapeAttrText(block.ref)}" alt="${escapeAttrText(block.alt)}" />`;
      return `<figure class="wsdoc__figure">${img}${caption}</figure>`;
    }
    case 'metrics': {
      const cells = block.items
        .map((item) => {
          const props = { label: scalarText(item.label), value: item.value };
          if (isText(item.change)) props.change = item.change;
          if (item.trend) props.trend = item.trend;
          return `<div class="wsdoc__metric" data-webskill-component="Metric" data-webskill-props='${escapeAttr(props)}'></div>`;
        })
        .join('');
      return `<div class="wsdoc__metrics">${cells}</div>`;
    }
    case 'keyValue': {
      const props = {
        items: block.items.map((item) => ({
          label: scalarText(item.label),
          value: scalarText(item.value)
        }))
      };
      const title = isText(block.title) ? `<p class="wsdoc__blocktitle">${escapeText(block.title)}</p>` : '';
      return `<div class="wsdoc__kvwrap">${title}<div class="wsdoc__kv" data-webskill-component="KeyValue" data-webskill-props='${escapeAttr(props)}'></div></div>`;
    }
    case 'callout': {
      const tone = TONES.includes(block.tone) ? block.tone : 'info';
      const title = isText(block.title) ? `<p class="wsdoc__callout-title">${escapeText(block.title)}</p>` : '';
      return `<aside class="wsdoc__callout" data-tone="${tone}">${title}<p>${inline(block.text)}</p></aside>`;
    }
    case 'quote': {
      const source = isText(block.source) ? `<cite>—— ${escapeText(block.source)}</cite>` : '';
      return `<blockquote class="wsdoc__quote"><p>${inline(block.text)}</p>${source}</blockquote>`;
    }
    case 'divider':
      return '<hr class="wsdoc__rule" />';
    case 'pageBreak':
      return '<div class="wsdoc__break"></div>';
    default:
      return '';
  }
}

/**
 * 样式表是**固定**的：模型不再写 CSS，所以另存件的取色与版式与屏幕对得上。
 * 想换观感就改这里，两侧一起变——这正是当初两边会漂开的那道口子。
 */
const CSS = [
  '.wsdoc { background: #ffffff; color: #1a1a1a; }',
  ".wsdoc { font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif; }",
  ".wsdoc--official { font-family: 'FangSong', '仿宋', 'STFangsong', serif; }",
  '.wsdoc__page { max-width: 820px; margin: 0 auto; padding: 44px 56px; }',
  '.wsdoc__redhead { text-align: center; border-bottom: 3px solid #c0202a; padding-bottom: 10px; margin-bottom: 10px; }',
  ".wsdoc__issuer { margin: 0; font-size: 36px; font-weight: 700; color: #c0202a; letter-spacing: 4px; font-family: 'SimHei', '黑体', sans-serif; }",
  '.wsdoc__docnum { margin: 0 0 24px; text-align: center; font-size: 14px; color: #5c6b7f; }',
  '.wsdoc__title { margin: 12px 0; text-align: center; font-size: 26px; font-weight: 700; line-height: 1.5; }',
  ".wsdoc--official .wsdoc__title { font-size: 28px; font-family: 'SimHei', '黑体', sans-serif; }",
  '.wsdoc__subtitle { margin: 0 0 8px; text-align: center; font-size: 16px; color: #5c6b7f; }',
  '.wsdoc__meta { margin: 0 0 12px; text-align: center; font-size: 13px; color: #5c6b7f; }',
  '.wsdoc__metaitem + .wsdoc__metaitem { margin-left: 18px; }',
  '.wsdoc__recipient { margin: 24px 0 0; font-size: 16px; }',
  '.wsdoc__rule { border: 0; border-top: 1px solid #d8dee8; margin: 18px 0 22px; }',
  '.wsdoc__h1, .wsdoc__h2, .wsdoc__h3 { break-after: avoid; margin: 26px 0 10px; line-height: 1.5; }',
  '.wsdoc__h1 { font-size: 22px; font-weight: 700; }',
  '.wsdoc__h2 { font-size: 18px; font-weight: 700; }',
  '.wsdoc__h3 { font-size: 16px; font-weight: 700; color: #5c6b7f; }',
  '.wsdoc__p { margin: 0 0 12px; font-size: 16px; line-height: 1.9; text-indent: 2em; }',
  '.wsdoc__list { margin: 0 0 14px; padding-left: 2em; font-size: 16px; line-height: 1.9; }',
  '.wsdoc__figure { margin: 18px 0; break-inside: avoid; }',
  '.wsdoc__blocktitle { margin: 0 0 8px; font-size: 15px; font-weight: 700; color: #5c6b7f; }',
  '.wsdoc__chart { height: 300px; }',
  '.wsdoc__image { display: block; max-width: 100%; height: auto; margin: 0 auto; }',
  '.wsdoc__figure figcaption { margin-top: 8px; font-size: 13px; color: #5c6b7f; text-align: center; }',
  '.wsdoc table { width: 100%; border-collapse: collapse; font-size: 14px; }',
  '.wsdoc th, .wsdoc td { border: 1px solid #d8dee8; padding: 8px 10px; text-align: left; }',
  '.wsdoc th { background: #f5f7fa; font-weight: 700; print-color-adjust: exact; }',
  '.wsdoc__metrics { display: flex; gap: 12px; margin: 18px 0; break-inside: avoid; }',
  '.wsdoc__metric { flex: 1 1 0; background: #f5f7fa; padding: 14px 16px; print-color-adjust: exact; }',
  '.wsdoc__metric [data-webskill-metric="label"] { display: block; font-size: 13px; color: #5c6b7f; }',
  '.wsdoc__metric [data-webskill-metric="value"] { display: block; font-size: 26px; font-weight: 700; color: #1a6fd4; }',
  '.wsdoc__metric [data-webskill-metric="change"] { display: block; font-size: 13px; color: #5c6b7f; }',
  '.wsdoc__kvwrap { margin: 18px 0; break-inside: avoid; }',
  '.wsdoc__kv dl { display: grid; grid-template-columns: 30% 1fr; gap: 0; margin: 0; font-size: 14px; }',
  '.wsdoc__kv dt { background: #f5f7fa; color: #5c6b7f; padding: 8px 10px; border: 1px solid #d8dee8; print-color-adjust: exact; }',
  '.wsdoc__kv dd { margin: 0; padding: 8px 10px; border: 1px solid #d8dee8; border-left: 0; }',
  '.wsdoc__callout { margin: 18px 0; padding: 12px 16px; border-left: 4px solid #1a6fd4; background: #eef4fd; break-inside: avoid; print-color-adjust: exact; }',
  '.wsdoc__callout p { margin: 0; font-size: 15px; line-height: 1.8; }',
  '.wsdoc__callout-title { font-weight: 700; color: #1a6fd4; margin-bottom: 4px !important; }',
  '.wsdoc__callout[data-tone="success"] { border-left-color: #1e9e5a; background: #ecfaf1; }',
  '.wsdoc__callout[data-tone="success"] .wsdoc__callout-title { color: #1e9e5a; }',
  '.wsdoc__callout[data-tone="warning"] { border-left-color: #c77700; background: #fef6e7; }',
  '.wsdoc__callout[data-tone="warning"] .wsdoc__callout-title { color: #c77700; }',
  '.wsdoc__callout[data-tone="danger"] { border-left-color: #c0202a; background: #fdeded; }',
  '.wsdoc__callout[data-tone="danger"] .wsdoc__callout-title { color: #c0202a; }',
  '.wsdoc__quote { margin: 18px 0; padding-left: 16px; border-left: 3px solid #d8dee8; color: #5c6b7f; }',
  '.wsdoc__quote p { margin: 0; font-style: italic; font-size: 15px; line-height: 1.8; }',
  '.wsdoc__quote cite { display: block; margin-top: 6px; font-size: 13px; font-style: normal; }',
  '.wsdoc__break { break-before: page; }',
  '.wsdoc__sign { margin-top: 40px; text-align: right; font-size: 16px; }',
  '.wsdoc__sign p { margin: 4px 0; }',
  '@media print { @page { size: A4; margin: 16mm; } .wsdoc__page { padding: 0; max-width: none; } }'
].join('\n');

// ---------------------------------------------------------------- 工具

export const inputSchema = {
  type: 'object',
  properties: {
    doc: {
      type: 'object',
      description:
        'The document as structured data, not markup. Shape: { docType?: "plain" | "official", title, subtitle?, meta?: [{label,value}], official?: {issuer, documentNumber?, recipient?}, blocks: [...], signature?: {org?, date?} }. "plain" is an ordinary Word document and is the default; use "official" only when the user asked for a 通报/公文/通告. Block types: heading, paragraph, list, table, chart, metrics, keyValue, callout, quote, divider, pageBreak. See references/authoring.md for every field.',
      properties: {
        docType: { type: 'string', enum: ['plain', 'official'] },
        title: { type: 'string' },
        blocks: { type: 'array', items: { type: 'object' } }
      },
      required: ['title', 'blocks']
    },
    dataSource: {
      type: 'string',
      description:
        'Where the numbers actually came from, shown to the user in the document window. Name the real origins you read, e.g. "page: 付款管理 / 合同台账" or "tools: list_bugs, get_dora_metrics". Never claim a source you did not read.'
    }
  },
  required: ['doc', 'dataSource']
};

export async function run(input, context) {
  const issues = validate(input && input.doc, input && input.dataSource);
  if (issues.length > 0) {
    return [
      {
        type: 'text',
        text: `PUBLISH_REJECTED: ${issues.join(' | ')}. Nothing was published — fix the doc object and call authored-bulletin__publish again.`
      }
    ];
  }

  const model = normalise(input.doc);
  await context.writeArtifact('bulletin.html', renderHtml(model), {
    mimeType: 'text/html',
    metadata: { resultCard: false }
  });
  await context.writeArtifact('bulletin.css', CSS, { mimeType: 'text/css', metadata: { resultCard: false } });

  // 宿主没接文档面时按钮根本不会渲染（SDK 分册 13 FR-13.3），发了就是「模型以为有、用户看不到」。
  if (context.documentSurface !== true) {
    return [
      {
        type: 'text',
        text: 'The document artifacts were written, but this host has no document surface, so there is no way to present them here. Tell the user the document is in the managed skill storage and summarize its key points inline instead.'
      }
    ];
  }

  const kindNote =
    model.docType === 'official'
      ? 'It is a red-header official bulletin because the user asked for one.'
      : 'It is an ordinary Word-style document — no red header, no seal.';
  return [
    // 不写 label：缺省文案跟随宿主界面语言，写死就把技能钉死在一种语言上。
    {
      type: 'json',
      data: {
        $surface: [
          {
            type: 'open',
            id: 'authored-bulletin-open',
            node: {
              component: 'OpenDocument',
              props: { artifact: 'bulletin.html', style: 'bulletin.css', dataSource: input.dataSource }
            }
          }
        ]
      }
    },
    {
      type: 'text',
      text: `The document is published. ${kindNote} The open button in this result is already rendered and is the ONLY UI entry point — do NOT call render_ui or emit any other button, link or chart for it, and do not mention downloads or attachments. Reply with one or two sentences on what the document says, note that the window can export a DOCX that matches what is on screen, and invite the user to tell you in plain language what they want changed; keep the doc object you just sent so you can revise it.`
    }
  ];
}
