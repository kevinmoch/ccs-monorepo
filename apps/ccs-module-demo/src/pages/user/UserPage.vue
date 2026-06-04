<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { isDocumentsSiteDocument, loadDocumentCatalog } from './offline-docs/catalog';
import {
	checkDocumentUpdate,
	downloadDocumentToOpfs,
	getAllMetadata,
	getStorageStats,
	isOpfsAvailable,
	openCachedDocument,
	openOnlineDocument,
	removeDocumentCache,
	removeManyDocumentCaches,
	writeCatalogSnapshot
} from './offline-docs/opfs';
import type { CachedDocumentMeta, DocumentFileType, DocumentStatus, DownloadProgress, OfflineDocument, StorageStats } from './offline-docs/types';

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
const autoLru = ref(true);
const stats = ref<StorageStats>({ usedBytes: 0, cachedBytes: 0, partialBytes: 0, metadataBytes: 0, opfsAvailable: isOpfsAvailable() });

const documentRows = computed(() => documents.value.map((document) => {
	const progress = progressMap.value.get(document.id);
	const meta = metaMap.value.get(document.id);
	const status: DocumentStatus = progress ? 'downloading' : getDocumentStatus(document, meta);
	return { document, meta, status, progress };
}));

const filteredRows = computed(() => documentRows.value);

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
});

async function initializePage() {
	isLoading.value = true;
	try {
		documents.value = await loadDocumentCatalog();
		if (isOpfsAvailable()) await writeCatalogSnapshot(documents.value);
		await refreshMetadata();
		selectedId.value = '';
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

async function openOnline(document: OfflineDocument) {
	selectedId.value = document.id;
	pageMessage.value = '';

	try {
		if (!isOnline.value) {
			pageMessage.value = '当前离线，无法打开在线文档';
			return;
		}

		await openOnlineDocument(document);
	} catch (error) {
		pageMessage.value = normalizeError(error);
	}
}

async function openOffline(document: OfflineDocument) {
	selectedId.value = document.id;
	pageMessage.value = '';

	try {
		const meta = metaMap.value.get(document.id);
		if (!meta || (meta.status !== 'offline' && meta.status !== 'update-available')) {
			pageMessage.value = '本地没有可用缓存，请先缓存本地';
			return;
		}

		if (isCacheSizeMismatch(document, meta)) {
			pageMessage.value = '本地缓存文件与服务器清单不一致，请更新缓存后再打开';
			return;
		}

		await openCachedDocument(document);
		await refreshMetadata();
	} catch (error) {
		pageMessage.value = normalizeError(error);
	}
}

function getDocumentStatus(document: OfflineDocument, meta?: CachedDocumentMeta): DocumentStatus {
	if (!meta) return 'not-downloaded';
	if (meta.status === 'offline' && isCacheSizeMismatch(document, meta)) return 'update-available';
	return meta.status;
}

function isCacheSizeMismatch(document: OfflineDocument, meta?: CachedDocumentMeta) {
	const expectedBytes = meta?.serverSize ?? document.size;
	return Boolean(expectedBytes && meta?.status === 'offline' && meta.cachedBytes > 0 && meta.cachedBytes !== expectedBytes);
}

async function cacheDocument(document: OfflineDocument, force = false) {
	if (progressMap.value.has(document.id)) return;
	pageMessage.value = '';

	try {
		setProgress(document.id, { id: document.id, receivedBytes: 0, totalBytes: document.size, percent: 0, resumable: false, message: '准备下载' });
		await clearLruIfNeeded(document);
		await downloadDocumentToOpfs(document, (progress) => setProgress(document.id, progress), { force });
		await refreshMetadata();
		pageMessage.value = force ? `已更新缓存：${document.title}` : `已缓存本地：${document.title}`;
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
	if (selectedId.value === id) selectedId.value = '';
}

async function clearSelected() {
	await removeManyDocumentCaches(checkedIds.value);
	const clearedSelected = checkedIds.value.includes(selectedId.value);
	checkedIds.value = [];
	await refreshMetadata();
	if (clearedSelected) selectedId.value = '';
}

async function clearAll() {
	await removeManyDocumentCaches(cachedRows.value.map(({ document }) => document.id));
	checkedIds.value = [];
	await refreshMetadata();
	selectedId.value = '';
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
							<span>{{ isDocumentsSiteDocument(row.document) ? '文档站点' : '远程文档' }}</span>
						</div>

						<div class="progress-area" :class="{ visible: row.progress }" :aria-hidden="!row.progress">
							<div class="progress-track"><span :style="{ width: `${row.progress?.percent ?? 0}%` }"></span></div>
							<small v-if="row.progress">{{ row.progress.percent ?? 0 }}% · {{ formatBytes(row.progress.receivedBytes) }} / {{ row.progress.totalBytes ? formatBytes(row.progress.totalBytes) : '未知大小' }} · {{ row.progress.message ?? (row.progress.resumable ? '续传中' : '下载中') }}</small>
							<small v-else>下载进度</small>
						</div>

						<div class="row-actions">
							<button type="button" :disabled="!isOnline" @click.stop="openOnline(row.document)">在线查看</button>
							<button v-if="row.status === 'not-downloaded' || row.status === 'failed'" type="button" @click.stop="cacheDocument(row.document)">缓存本地</button>
							<button v-if="row.status === 'offline' || row.status === 'update-available'" type="button" @click.stop="openOffline(row.document)">离线查看</button>
							<button v-if="row.meta" type="button" @click.stop="cacheDocument(row.document, true)">更新缓存</button>
							<button v-if="row.meta" type="button" class="ghost-button" @click.stop="clearOne(row.document.id)">删除缓存</button>
						</div>
					</article>
				</div>
			</aside>
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
	gap: 16px;
}

.doc-list-panel,
.cache-panel {
	padding: 16px;
}

.doc-list-panel {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	min-height: 0;
}

.panel-heading,
.doc-row-main,
.row-actions,
.cache-actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.panel-heading strong {
	font-size: 20px;
}

.doc-list {
	display: grid;
	gap: 10px;
	margin-top: 14px;
	min-height: 0;
	max-height: clamp(520px, calc(100dvh - 290px), 720px);
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
.status-badge {
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

.status-offline .status-badge {
	background: #dcfce7;
	color: #15803d;
}

.status-update-available .status-badge {
	background: #fef3c7;
	color: #b45309;
}

.status-downloading .status-badge {
	background: #dbeafe;
	color: #1d4ed8;
}

.status-failed .status-badge {
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

.page-message,
.empty-state {
	border-radius: 8px;
	padding: 12px;
}

.page-message {
	margin: 0;
	background: #f8fafc;
	color: #475569;
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
	.hero-metrics {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 720px) {
	.doc-hero,
	.doc-row-main,
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
