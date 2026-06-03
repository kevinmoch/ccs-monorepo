<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { isSameOriginDocument, loadDocumentCatalog } from './offline-docs/catalog';
import {
	checkDocumentUpdate,
	createCachedObjectUrl,
	downloadDocumentToOpfs,
	getAllMetadata,
	getStorageStats,
	isOpfsAvailable,
	removeDocumentCache,
	removeManyDocumentCaches,
	writeCatalogSnapshot
} from './offline-docs/opfs';
import type { CachedDocumentMeta, DocumentFileType, DocumentStatus, DownloadProgress, OfflineDocument, StorageStats, ViewerSource } from './offline-docs/types';

type SheetPreview = {
	name: string;
	rows: string[][];
};

const APP_WATERMARK_RATIO = 0.86;

const documents = ref<OfflineDocument[]>([]);
const metaMap = ref<Map<string, CachedDocumentMeta>>(new Map());
const progressMap = ref<Map<string, DownloadProgress>>(new Map());
const selectedId = ref('');
const checkedIds = ref<string[]>([]);
const isOnline = ref(navigator.onLine);
const isLoading = ref(true);
const isCheckingUpdates = ref(false);
const pageMessage = ref('');
const viewerSource = ref<ViewerSource>({ kind: 'unavailable', message: '请选择文档列表里的文档来查看' });
const viewerFileType = ref<DocumentFileType | 'empty'>('empty');
const viewerLoading = ref(false);
const viewerError = ref('');
const docxHtml = ref('');
const sheetPreview = ref<SheetPreview[]>([]);
const autoLru = ref(true);
const stats = ref<StorageStats>({ usedBytes: 0, cachedBytes: 0, partialBytes: 0, metadataBytes: 0, opfsAvailable: isOpfsAvailable() });

let activeObjectUrl: string | undefined;

const documentRows = computed(() => documents.value.map((document) => {
	const progress = progressMap.value.get(document.id);
	const meta = metaMap.value.get(document.id);
	const status: DocumentStatus = progress ? 'downloading' : meta?.status ?? 'not-downloaded';
	return { document, meta, status, progress };
}));

const filteredRows = computed(() => documentRows.value);

const selectedDocument = computed(() => documents.value.find((document) => document.id === selectedId.value));
const selectedMeta = computed(() => selectedId.value ? metaMap.value.get(selectedId.value) : undefined);
const cachedRows = computed(() => documentRows.value.filter(({ meta }) => meta && (meta.cachedBytes > 0 || meta.partialBytes > 0)));
const totalSelectedBytes = computed(() => checkedIds.value.reduce((total, id) => {
	const meta = metaMap.value.get(id);
	return total + (meta?.cachedBytes ?? 0) + (meta?.partialBytes ?? 0);
}, 0));

const measuredQuotaBytes = computed(() => {
	const quota = stats.value.quotaBytes;
	return typeof quota === 'number' && Number.isFinite(quota) && quota > 0 ? quota : undefined;
});

const storagePercent = computed(() => {
	const used = stats.value.usageBytes ?? stats.value.usedBytes;
	const quota = measuredQuotaBytes.value;
	if (!quota || quota <= 0) return 0;
	return Math.min(100, Math.round((used / quota) * 1000) / 10);
});

const pressureLabel = computed(() => {
	if (!stats.value.opfsAvailable) return 'OPFS 不可用';
	if (!measuredQuotaBytes.value) return '空间监测中';
	if (storagePercent.value >= 92) return '空间紧张';
	if (storagePercent.value >= APP_WATERMARK_RATIO * 100) return '接近建议水位';
	return '空间正常';
});

onMounted(async () => {
	window.addEventListener('online', handleNetworkChange);
	window.addEventListener('offline', handleNetworkChange);
	await initializePage();
});

onUnmounted(() => {
	window.removeEventListener('online', handleNetworkChange);
	window.removeEventListener('offline', handleNetworkChange);
	revokeActiveObjectUrl();
});

async function initializePage() {
	isLoading.value = true;
	try {
		documents.value = await loadDocumentCatalog();
		if (isOpfsAvailable()) await writeCatalogSnapshot(documents.value);
		await refreshMetadata();
		selectedId.value = '';
		viewerSource.value = { kind: 'unavailable', message: '请选择文档列表里的文档来查看' };
		viewerFileType.value = 'empty';
	} catch (error) {
		pageMessage.value = normalizeError(error);
	} finally {
		isLoading.value = false;
	}
}

async function refreshMetadata() {
	if (!isOpfsAvailable()) {
		stats.value = await getStorageStats();
		return;
	}

	const metadata = await getAllMetadata();
	metaMap.value = new Map(metadata.map((meta) => [meta.id, meta]));
	stats.value = await getStorageStats();
}

async function openDocument(document: OfflineDocument) {
	selectedId.value = document.id;
	revokeActiveObjectUrl();
	viewerLoading.value = true;
	viewerError.value = '';
	docxHtml.value = '';
	sheetPreview.value = [];
	viewerFileType.value = document.fileType;

	try {
		const meta = metaMap.value.get(document.id);
		if (meta?.status === 'offline' || meta?.status === 'update-available') {
			viewerSource.value = await createCachedObjectUrl(document);
			activeObjectUrl = viewerSource.value.url;
			await renderPreview(document, viewerSource.value);
			await refreshMetadata();
			return;
		}

		if (!isOnline.value) {
			viewerSource.value = { kind: 'unavailable', message: '离线状态下没有本地缓存，请联网后先缓存文档' };
			return;
		}

		viewerSource.value = { kind: 'online', url: document.url, message: isSameOriginDocument(document) ? '正在读取在线文档' : '在线预览不写入缓存' };
		await renderPreview(document, viewerSource.value);
	} catch (error) {
		viewerSource.value = { kind: 'unavailable', message: normalizeError(error) };
		viewerError.value = normalizeError(error);
	} finally {
		viewerLoading.value = false;
	}
}

async function cacheDocument(document: OfflineDocument, force = false) {
	if (progressMap.value.has(document.id)) return;
	pageMessage.value = '';

	try {
		await clearLruIfNeeded(document);
		setProgress(document.id, { id: document.id, receivedBytes: 0, totalBytes: document.size, percent: 0, resumable: false, message: '准备下载' });
		await downloadDocumentToOpfs(document, (progress) => setProgress(document.id, progress), { force });
		await refreshMetadata();
		if (selectedId.value === document.id) await openDocument(document);
	} catch (error) {
		pageMessage.value = normalizeError(error);
		await refreshMetadata();
	} finally {
		deleteProgress(document.id);
	}
}

async function clearOne(id: string) {
	await removeDocumentCache(id);
	checkedIds.value = checkedIds.value.filter((checkedId) => checkedId !== id);
	await refreshMetadata();
	if (selectedId.value === id && selectedDocument.value) await openDocument(selectedDocument.value);
}

async function clearSelected() {
	await removeManyDocumentCaches(checkedIds.value);
	const clearedSelected = checkedIds.value.includes(selectedId.value);
	checkedIds.value = [];
	await refreshMetadata();
	if (clearedSelected && selectedDocument.value) await openDocument(selectedDocument.value);
}

async function clearAll() {
	await removeManyDocumentCaches(cachedRows.value.map(({ document }) => document.id));
	checkedIds.value = [];
	await refreshMetadata();
	if (selectedDocument.value) await openDocument(selectedDocument.value);
}

async function clearOldestCache() {
	const oldest = cachedRows.value
		.map(({ document, meta }) => ({ document, meta }))
		.filter((row): row is { document: OfflineDocument; meta: CachedDocumentMeta } => Boolean(row.meta))
		.sort((left, right) => new Date(left.meta.lastAccessedAt ?? left.meta.downloadedAt ?? 0).getTime() - new Date(right.meta.lastAccessedAt ?? right.meta.downloadedAt ?? 0).getTime())[0];

	if (!oldest) return;
	await clearOne(oldest.document.id);
	pageMessage.value = `已按 LRU 清理：${oldest.document.title}`;
}

async function checkUpdates() {
	if (!isOnline.value) {
		pageMessage.value = '当前离线，无法检查服务器更新';
		return;
	}

	isCheckingUpdates.value = true;
	try {
		for (const document of documents.value) await checkDocumentUpdate(document);
		await refreshMetadata();
		pageMessage.value = '更新检查完成';
	} finally {
		isCheckingUpdates.value = false;
	}
}

async function renderPreview(document: OfflineDocument, source: ViewerSource) {
	docxHtml.value = '';
	sheetPreview.value = [];
	if (source.kind === 'unavailable') return;
	if (document.fileType === 'image' || document.fileType === 'pdf' || document.fileType === 'doc' || document.fileType === 'xls') return;

	try {
		const blob = source.blob ?? await fetchSourceBlob(source);
		const arrayBuffer = await blob.arrayBuffer();

		if (document.fileType === 'docx') {
			const mammoth = await import('mammoth');
			const result = await mammoth.convertToHtml({ arrayBuffer });
			docxHtml.value = result.value;
			return;
		}

		if (document.fileType === 'xlsx') {
			const xlsx = await import('xlsx');
			const workbook = xlsx.read(arrayBuffer, { type: 'array' });
			sheetPreview.value = workbook.SheetNames.slice(0, 3).map((name) => {
				const rows = xlsx.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, blankrows: false }).slice(0, 80);
				return { name, rows: rows.map((row) => row.map((cell) => String(cell ?? ''))) };
			});
		}
	} catch (error) {
		viewerError.value = `预览解析失败：${normalizeError(error)}`;
	}
}

async function fetchSourceBlob(source: ViewerSource): Promise<Blob> {
	if (!source.url) throw new Error('没有可读取的文档地址');
	const response = await fetch(source.url, { cache: 'no-store' });
	if (!response.ok) throw new Error(`在线文档读取失败：HTTP ${response.status}`);
	return response.blob();
}

async function clearLruIfNeeded(document: OfflineDocument) {
	if (!autoLru.value || !document.size) return;
	const currentStats = await getStorageStats();
	const quota = currentStats.quotaBytes;
	const usage = currentStats.usageBytes ?? currentStats.usedBytes;
	if (!quota || usage + document.size <= quota * APP_WATERMARK_RATIO) return;
	await clearOldestCache();
}

function handleNetworkChange() {
	isOnline.value = navigator.onLine;
}

function setProgress(id: string, progress: DownloadProgress) {
	const next = new Map(progressMap.value);
	next.set(id, progress);
	progressMap.value = next;
}

function deleteProgress(id: string) {
	const next = new Map(progressMap.value);
	next.delete(id);
	progressMap.value = next;
}

function revokeActiveObjectUrl() {
	if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
	activeObjectUrl = undefined;
}

function statusLabel(status: DocumentStatus) {
	const labels: Record<DocumentStatus, string> = {
		'not-downloaded': '未下载',
		downloading: '下载中',
		offline: '已离线',
		'update-available': '有更新',
		failed: '中断'
	};
	return labels[status];
}

function typeLabel(type: DocumentFileType) {
	const labels: Record<DocumentFileType, string> = {
		image: 'IMG',
		pdf: 'PDF',
		docx: 'DOCX',
		xlsx: 'XLSX',
		doc: 'DOC',
		xls: 'XLS'
	};
	return labels[type];
}

function formatBytes(bytes?: number) {
	if (!bytes || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value?: string) {
	if (!value) return '未记录';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function normalizeError(error: unknown) {
	if (error instanceof Error && error.message) return error.message;
	return '操作失败，请稍后重试';
}
</script>

<template>
	<section class="offline-doc-page">
		<header class="doc-hero">
			<div>
				<p class="eyebrow">ccs-module-demo</p>
				<h1>离线文档</h1>
				<span>{{ stats.storageLabel ?? 'Web OPFS' }} 大文件缓存 · {{ isOnline ? '在线' : '离线' }} · {{ pressureLabel }}</span>
			</div>
			<div class="hero-metrics">
				<button type="button" class="hero-update-button" :disabled="isCheckingUpdates" @click="checkUpdates">
					{{ isCheckingUpdates ? '检查中' : '检查更新' }}
				</button>
				<div>
					<span>已用空间</span>
					<strong>{{ formatBytes(stats.usageBytes ?? stats.usedBytes) }}</strong>
				</div>
				<div v-if="measuredQuotaBytes">
					<span>浏览器配额</span>
					<strong>{{ formatBytes(measuredQuotaBytes) }}</strong>
				</div>
				<div>
					<span>离线存储</span>
					<strong>{{ stats.opfsAvailable ? '可用' : '不可用' }}</strong>
				</div>
			</div>
		</header>

		<p v-if="pageMessage" class="page-message">{{ pageMessage }}</p>

		<div v-if="isLoading" class="empty-state">正在加载文档清单</div>
		<div v-else class="doc-workspace">
			<aside class="doc-list-panel">
				<div class="panel-heading">
					<span>文档列表</span>
					<strong>{{ filteredRows.length }} / {{ documents.length }}</strong>
				</div>

				<div class="doc-list">
					<article
						v-for="row in filteredRows"
						:key="row.document.id"
						class="doc-row"
						:class="[{ active: row.document.id === selectedId }, `status-${row.status}`]"
						role="button"
						tabindex="0"
						@click="openDocument(row.document)"
						@keydown.enter.self.prevent="openDocument(row.document)"
						@keydown.space.self.prevent="openDocument(row.document)"
					>
						<div class="doc-row-main">
							<label class="doc-checkbox" :title="row.meta ? '选择清理缓存' : '暂无缓存'" @click.stop>
								<input v-model="checkedIds" type="checkbox" :value="row.document.id" :disabled="!row.meta" />
							</label>
							<div class="doc-link">
								<span class="type-badge">{{ typeLabel(row.document.fileType) }}</span>
								<span>
									<strong>{{ row.document.title }}</strong>
								</span>
							</div>
							<span class="status-badge">{{ statusLabel(row.status) }}</span>
						</div>
						<p>{{ row.document.description }}</p>
						<div class="doc-meta-line">
							<span>更新 {{ formatDate(row.document.updatedAt ?? row.document.lastModified) }}</span>
							<span>缓存 {{ formatBytes((row.meta?.cachedBytes ?? 0) + (row.meta?.partialBytes ?? 0)) }}</span>
							<span>{{ isSameOriginDocument(row.document) ? '同源可缓存' : '仅在线查看' }}</span>
						</div>

						<div class="progress-area" :class="{ visible: row.progress }" :aria-hidden="!row.progress">
							<div class="progress-track"><span :style="{ width: `${row.progress?.percent ?? 0}%` }"></span></div>
							<small v-if="row.progress">{{ row.progress.percent ?? 0 }}% · {{ formatBytes(row.progress.receivedBytes) }} / {{ row.progress.totalBytes ? formatBytes(row.progress.totalBytes) : '未知大小' }} · {{ row.progress.message ?? (row.progress.resumable ? '续传中' : '下载中') }}</small>
							<small v-else>下载进度</small>
						</div>

						<div class="row-actions">
							<button v-if="row.status === 'not-downloaded' || row.status === 'failed'" type="button" @click.stop="cacheDocument(row.document)">缓存本地</button>
							<button v-else-if="row.status === 'update-available'" type="button" @click.stop="cacheDocument(row.document, true)">重新下载</button>
							<button v-else-if="row.status === 'offline'" type="button" @click.stop="openDocument(row.document)">离线查看</button>
							<button v-if="row.meta" type="button" class="ghost-button" @click.stop="clearOne(row.document.id)">清除缓存</button>
						</div>
					</article>
				</div>
			</aside>

			<section class="viewer-panel">
				<div class="viewer-topline">
					<div>
						<span>文档查看</span>
						<strong>{{ selectedDocument?.title ?? '未选择文档' }}</strong>
					</div>
					<div class="viewer-source" :class="viewerSource.kind">
						{{ viewerSource.kind === 'cache' ? '本地缓存' : viewerSource.kind === 'online' ? '在线读取' : '不可用' }}
					</div>
				</div>

				<div v-if="selectedMeta?.status === 'update-available'" class="update-strip">
					服务器文件已有更新，当前默认仍读取本地缓存。
					<button v-if="selectedDocument" type="button" @click="cacheDocument(selectedDocument, true)">重新下载</button>
				</div>

				<div class="viewer-body">
					<div v-if="viewerLoading" class="empty-state">正在准备查看器</div>
					<div v-else-if="viewerSource.kind === 'unavailable'" class="empty-state">{{ viewerSource.message }}</div>
					<img v-else-if="viewerFileType === 'image' && viewerSource.url" class="image-preview" :src="viewerSource.url" alt="文档图片预览" />
					<iframe v-else-if="viewerFileType === 'pdf' && viewerSource.url" class="pdf-preview" :src="viewerSource.url" title="PDF 文档预览"></iframe>
					<div v-else-if="viewerFileType === 'docx'" class="office-preview">
						<div v-if="docxHtml" v-html="docxHtml"></div>
						<div v-else class="empty-state">DOCX 正在解析或暂无可预览内容</div>
					</div>
					<div v-else-if="viewerFileType === 'xlsx'" class="sheet-preview">
						<section v-for="sheet in sheetPreview" :key="sheet.name">
							<h3>{{ sheet.name }}</h3>
							<div class="sheet-scroll">
								<table>
									<tbody>
										<tr v-for="(row, rowIndex) in sheet.rows" :key="rowIndex">
											<td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
										</tr>
									</tbody>
								</table>
							</div>
						</section>
						<div v-if="!sheetPreview.length" class="empty-state">XLSX 正在解析或暂无可预览内容</div>
					</div>
					<div v-else class="empty-state">
						旧版 Office 文件已支持缓存和离线管理，当前查看区不做内嵌解析。
					</div>
				</div>

				<p v-if="viewerError" class="viewer-error">{{ viewerError }}</p>
			</section>
		</div>

		<section class="cache-panel">
			<div class="panel-heading">
				<span>缓存管理</span>
				<strong>{{ cachedRows.length }} 个文档</strong>
			</div>
			<div class="storage-bar">
				<span :style="{ width: `${storagePercent}%` }"></span>
			</div>
			<div class="cache-stats">
				<div><span>缓存文件</span><strong>{{ formatBytes(stats.cachedBytes) }}</strong></div>
				<div><span>中断文件</span><strong>{{ formatBytes(stats.partialBytes) }}</strong></div>
				<div><span>元数据</span><strong>{{ formatBytes(stats.metadataBytes) }}</strong></div>
				<div><span>已选择</span><strong>{{ formatBytes(totalSelectedBytes) }}</strong></div>
			</div>
			<div class="cache-actions">
				<label class="lru-toggle"><input v-model="autoLru" type="checkbox" /> 下载前启用 LRU 空间整理</label>
				<button type="button" class="secondary-button" :disabled="!checkedIds.length" @click="clearSelected">清除所选</button>
				<button type="button" class="secondary-button" :disabled="!cachedRows.length" @click="clearOldestCache">清理最久未访问</button>
				<button type="button" class="danger-button" :disabled="!cachedRows.length" @click="clearAll">全部清除</button>
			</div>
		</section>
	</section>
</template>

<style scoped>
.offline-doc-page {
	min-height: calc(100vh - 2rem);
	display: grid;
	gap: 16px;
	color: var(--ccs-text, #101828);
}

.doc-hero,
.doc-list-panel,
.viewer-panel,
.cache-panel {
	box-sizing: border-box;
	border: 1px solid rgba(15, 23, 42, 0.08);
	border-radius: 8px;
	background: var(--ccs-card-background, #ffffff);
	box-shadow: var(--ccs-card-shadow, 0 18px 48px rgba(15, 23, 42, 0.08));
}

.doc-hero {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 18px;
	padding: 22px;
	background:
		linear-gradient(135deg, rgba(20, 184, 166, 0.16), rgba(37, 99, 235, 0.1) 52%, rgba(245, 158, 11, 0.12)),
		#ffffff;
}

.doc-hero h1,
.doc-hero p,
.doc-hero span,
.panel-heading span,
.cache-stats span,
.hero-metrics span,
.doc-meta-line,
.doc-row p {
	margin: 0;
}

.doc-hero h1 {
	margin-top: 5px;
	font-size: clamp(30px, 5vw, 52px);
	line-height: 1;
	letter-spacing: 0;
}

.eyebrow,
.panel-heading span,
.cache-stats span,
.hero-metrics span {
	color: #667085;
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.doc-hero > div:first-child > span,
.doc-row p,
.doc-meta-line,
.progress-area small {
	color: #667085;
}

.hero-metrics,
.cache-stats {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.hero-metrics > div,
.cache-stats div {
	display: grid;
	gap: 6px;
	min-width: 132px;
	padding: 12px;
	border-radius: 8px;
	background: rgba(255, 255, 255, 0.72);
}

.hero-update-button {
	align-self: stretch;
	height: auto;
	min-height: 58px;
	background: #ffffff;
	color: #1d4ed8;
	border: 1px solid rgba(37, 99, 235, 0.18);
	box-shadow: 0 10px 24px rgba(37, 99, 235, 0.08);
}

.hero-metrics strong,
.cache-stats strong {
	font-size: 18px;
}

.doc-workspace {
	display: grid;
	grid-template-columns: minmax(320px, 0.82fr) minmax(0, 1.18fr);
	gap: 16px;
	height: clamp(560px, calc(100dvh - 290px), 720px);
	min-height: 560px;
}

.doc-list-panel,
.viewer-panel,
.cache-panel {
	padding: 16px;
}

.doc-list-panel,
.viewer-panel {
	height: 100%;
	min-height: 0;
}

.doc-list-panel {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
}

.panel-heading,
.viewer-topline,
.doc-row-main,
.row-actions,
.cache-actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.panel-heading strong,
.viewer-topline strong {
	font-size: 20px;
}

.doc-list {
	display: grid;
	gap: 10px;
	margin-top: 14px;
	min-height: 0;
	overflow: auto;
	padding-right: 4px;
}

.doc-row {
	display: grid;
	gap: 10px;
	padding: 12px;
	border: 1px solid rgba(15, 23, 42, 0.08);
	border-radius: 8px;
	background: #ffffff;
	cursor: pointer;
}

.doc-row:focus-visible {
	outline: 3px solid rgba(37, 99, 235, 0.22);
	outline-offset: 2px;
}

.doc-row.active {
	border-color: rgba(37, 99, 235, 0.42);
	background: #f8fbff;
}

.doc-row.status-update-available {
	border-color: rgba(245, 158, 11, 0.42);
}

.doc-checkbox {
	line-height: 1;
}

.doc-link {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 10px;
	border: 0;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
}

.doc-link > span:last-child {
	display: grid;
	gap: 3px;
	min-width: 0;
}

.doc-link strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.type-badge,
.status-badge,
.viewer-source {
	flex: 0 0 auto;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 46px;
	height: 28px;
	padding: 0 8px;
	border-radius: 8px;
	font-size: 12px;
	font-weight: 900;
}

.type-badge {
	background: #eef2ff;
	color: #3730a3;
}

.status-badge {
	background: #f1f5f9;
	color: #475569;
}

.status-offline .status-badge,
.viewer-source.cache {
	background: #dcfce7;
	color: #15803d;
}

.status-update-available .status-badge {
	background: #fef3c7;
	color: #b45309;
}

.status-downloading .status-badge,
.viewer-source.online {
	background: #dbeafe;
	color: #1d4ed8;
}

.status-failed .status-badge,
.viewer-source.unavailable {
	background: #fee2e2;
	color: #b91c1c;
}

.doc-row p {
	font-size: 13px;
	line-height: 1.5;
}

.doc-meta-line {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 12px;
}

.progress-area {
	display: grid;
	gap: 6px;
	min-height: 36px;
}

.progress-area small {
	display: block;
	min-height: 16px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.progress-area:not(.visible) {
	visibility: hidden;
}

.progress-track,
.storage-bar {
	height: 8px;
	overflow: hidden;
	border-radius: 8px;
	background: #e2e8f0;
}

.progress-track span,
.storage-bar span {
	display: block;
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, #0f766e, #2563eb);
}

.row-actions {
	justify-content: flex-end;
}

button {
	height: 36px;
	border: 0;
	border-radius: 8px;
	background: #2563eb;
	color: #ffffff;
	font: inherit;
	font-weight: 800;
	padding: 0 12px;
	cursor: pointer;
}

button:disabled {
	cursor: not-allowed;
	opacity: 0.54;
}

.secondary-button,
.ghost-button {
	border: 1px solid rgba(37, 99, 235, 0.18);
	background: rgba(37, 99, 235, 0.08);
	color: #1d4ed8;
}

.ghost-button {
	background: #f8fafc;
	color: #475569;
}

.danger-button {
	background: #dc2626;
}

.viewer-panel {
	display: grid;
	grid-template-rows: auto auto minmax(0, 1fr) auto;
	gap: 12px;
	overflow: hidden;
}

.viewer-topline > div:first-child {
	display: grid;
	gap: 4px;
	min-width: 0;
}

.viewer-body {
	min-height: 0;
	height: 100%;
	overflow: auto;
	border: 1px solid rgba(15, 23, 42, 0.08);
	border-radius: 8px;
	background: #f8fafc;
}

.image-preview {
	display: block;
	max-width: 100%;
	max-height: 100%;
	height: 100%;
	margin: 0 auto;
	object-fit: contain;
}

.pdf-preview {
	width: 100%;
	height: 100%;
	min-height: 100%;
	border: 0;
	background: #ffffff;
}

.office-preview {
	box-sizing: border-box;
	min-height: 100%;
	padding: 24px;
	background: #ffffff;
	line-height: 1.7;
}

.office-preview :deep(table) {
	border-collapse: collapse;
	width: 100%;
}

.office-preview :deep(td),
.office-preview :deep(th) {
	border: 1px solid #e2e8f0;
	padding: 6px 8px;
}

.sheet-preview {
	display: grid;
	gap: 18px;
	box-sizing: border-box;
	min-height: 100%;
	padding: 18px;
	background: #ffffff;
}

.sheet-preview h3 {
	margin: 0 0 10px;
	font-size: 16px;
}

.sheet-scroll {
	overflow: auto;
	border: 1px solid #e2e8f0;
	border-radius: 8px;
}

.sheet-scroll table {
	border-collapse: collapse;
	min-width: 680px;
	width: 100%;
}

.sheet-scroll td {
	border: 1px solid #e2e8f0;
	padding: 7px 9px;
	font-size: 13px;
	white-space: nowrap;
}

.update-strip,
.page-message,
.viewer-error,
.empty-state {
	border-radius: 8px;
	padding: 12px;
}

.update-strip {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	background: #fffbeb;
	color: #92400e;
	font-weight: 800;
}

.page-message {
	margin: 0;
	background: #f8fafc;
	color: #475569;
	font-weight: 700;
}

.viewer-error {
	margin: 0;
	background: #fef2f2;
	color: #b91c1c;
	font-weight: 700;
}

.empty-state {
	display: grid;
	min-height: 240px;
	place-items: center;
	color: #667085;
	font-weight: 800;
	text-align: center;
}

.viewer-body > .empty-state {
	min-height: 100%;
}

.cache-panel {
	display: grid;
	gap: 12px;
}

.cache-stats {
	grid-template-columns: repeat(4, minmax(0, 1fr));
}

.cache-stats div {
	background: #f8fafc;
}

.lru-toggle {
	margin-right: auto;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	color: #475569;
	font-weight: 800;
}

@media (max-width: 1100px) {
	.doc-workspace {
		grid-template-columns: 1fr;
		height: auto;
	}

	.doc-list-panel,
	.viewer-panel {
		height: min(640px, calc(100dvh - 150px));
	}

	.hero-metrics {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 720px) {
	.doc-hero,
	.doc-row-main,
	.viewer-topline,
	.cache-actions {
		align-items: stretch;
		flex-direction: column;
	}

	.hero-metrics,
	.cache-stats {
		grid-template-columns: 1fr;
		width: 100%;
	}

	.row-actions {
		justify-content: stretch;
		flex-wrap: wrap;
	}

	.row-actions button,
	.cache-actions button {
		flex: 1 1 auto;
	}
}
</style>
