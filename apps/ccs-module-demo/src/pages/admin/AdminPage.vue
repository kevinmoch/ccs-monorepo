<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
	captureAndroidPhoto,
	clearAllPhotos,
	createAttendanceService,
	detectRuntime,
	formatBytes,
	getPhotoStorageStats,
	getPhotoViewSource,
	isPhotoStorageAvailable,
	listPhotos,
	normalizeError,
	removeManyPhotos,
	removePhoto,
	savePhoto,
	uploadPhoto,
} from '@ccs/shared';
import type { OfflinePhoto, PhotoStorageStats } from '@ccs/shared';

// ---------------------------------------------------------------------------
// 运行时与存储状态
// ---------------------------------------------------------------------------

const runtime = detectRuntime();
const storageAvailable = isPhotoStorageAvailable();

const photos = ref<OfflinePhoto[]>([]);
const checkedIds = ref<string[]>([]);
const uploadTargetId = ref('');
const uploadUrl = ref('https://192.168.43.232:8083/upload');
const isLoading = ref(true);
const isCapturing = ref(false);
const isUploading = ref(false);
const pageMessage = ref('');
const stats = ref<PhotoStorageStats>({
	count: 0,
	usedBytes: 0,
	photoBytes: 0,
	metadataBytes: 0,
	opfsAvailable: storageAvailable,
	storageKind: 'unavailable',
	storageLabel: '检测中',
});

// ---------------------------------------------------------------------------
// 相机弹窗（Web / Electron getUserMedia 取景）
// ---------------------------------------------------------------------------

const cameraDialog = ref<HTMLDialogElement | null>(null);
const cameraVideo = ref<HTMLVideoElement | null>(null);
const cameraError = ref('');
let cameraStream: MediaStream | null = null;

// ---------------------------------------------------------------------------
// 大图查看弹窗
// ---------------------------------------------------------------------------

const viewerDialog = ref<HTMLDialogElement | null>(null);
const viewerUrl = ref('');
const viewerPhoto = ref<OfflinePhoto | null>(null);
let viewerObjectUrl = '';

// ---------------------------------------------------------------------------
// 消息提示 Popover
// ---------------------------------------------------------------------------

const messagePopover = ref<HTMLElement | null>(null);
let messageTimer: ReturnType<typeof setTimeout> | undefined;

watch(pageMessage, async (msg) => {
	if (msg && messagePopover.value) {
		clearTimeout(messageTimer);
		await nextTick();
		messagePopover.value.showPopover();
		messageTimer = setTimeout(() => messagePopover.value?.hidePopover(), 3000);
	}
});

// ---------------------------------------------------------------------------
// 计算属性
// ---------------------------------------------------------------------------

const totalSelectedBytes = computed(() =>
	checkedIds.value.reduce((total, id) => {
		const photo = photos.value.find((item) => item.id === id);
		return total + (photo?.sizeBytes ?? 0);
	}, 0),
);

const uploadablePhotos = computed(() => photos.value);

const captureLabel = computed(() => {
	if (isCapturing.value) return '处理中...';
	return runtime.kind === 'android' ? '调用相机拍照' : '打开相机拍照';
});

// 选中的上传目标随列表变化保持有效
watch(
	photos,
	(list) => {
		if (!list.some((photo) => photo.id === uploadTargetId.value)) {
			uploadTargetId.value = list[0]?.id ?? '';
		}
	},
	{ deep: false },
);

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------

onMounted(async () => {
	await initialize();
});

onUnmounted(() => {
	stopCameraStream();
	releaseViewerUrl();
});

// ---------------------------------------------------------------------------
// 定位（复用 attendance 模块的 locate，自动按平台选择最佳策略）
// ---------------------------------------------------------------------------

const { locate } = createAttendanceService();

/** 获取当前位置，失败时静默返回 undefined（不阻断拍照流程） */
async function getCurrentLocation() {
	try {
		return await locate();
	} catch {
		return undefined;
	}
}

async function initialize() {
	isLoading.value = true;
	try {
		if (!storageAvailable) {
			pageMessage.value = '当前环境不支持离线照片存储';
			return;
		}
		await refresh();
	} catch (error) {
		pageMessage.value = normalizeError(error);
	} finally {
		isLoading.value = false;
	}
}

async function refresh() {
	photos.value = await listPhotos();
	stats.value = await getPhotoStorageStats();
}

// ---------------------------------------------------------------------------
// 拍照
// ---------------------------------------------------------------------------

async function handleCapture() {
	if (!storageAvailable || isCapturing.value) return;
	pageMessage.value = '';

	if (runtime.kind === 'android') {
		await captureWithNativeCamera();
		return;
	}

	await openWebCamera();
}

async function captureWithNativeCamera() {
	try {
		isCapturing.value = true;
		const [result, location] = await Promise.all([
			captureAndroidPhoto(),
			getCurrentLocation(),
		]);
		await savePhoto(result.blob, {
			source: 'camera',
			runtimeLabel: runtime.label,
			mimeType: result.mimeType,
			...location && {
				latitude: location.latitude,
				longitude: location.longitude,
				locationAccuracy: location.accuracy,
				locationProvider: location.provider,
			},
		});
		await refresh();
		pageMessage.value = '已离线保存照片';
	} catch (error) {
		pageMessage.value = normalizeError(error);
	} finally {
		isCapturing.value = false;
	}
}

async function openWebCamera() {
	cameraError.value = '';
	try {
		cameraStream = await navigator.mediaDevices.getUserMedia({
			video: {
				width: { ideal: 8000 },
				height: { ideal: 8000 },
				facingMode: 'environment' 
			},
			audio: false,
		});
	} catch (error) {
		pageMessage.value = `无法打开相机：${normalizeError(error)}`;
		return;
	}

	cameraDialog.value?.showModal();
	await nextTick();
	if (cameraVideo.value) {
		cameraVideo.value.srcObject = cameraStream;
		await cameraVideo.value.play().catch(() => undefined);
	}
}

async function takeWebPhoto() {
	const video = cameraVideo.value;
	if (!video || !cameraStream) return;

	try {
		isCapturing.value = true;
		const width = video.videoWidth;
		const height = video.videoHeight;
		if (!width || !height) {
			cameraError.value = '相机尚未就绪，请稍候重试';
			return;
		}

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) {
			cameraError.value = '当前环境不支持画布抓帧';
			return;
		}
		context.drawImage(video, 0, 0, width, height);

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.9),
		);
		if (!blob) {
			cameraError.value = '抓帧失败，请重试';
			return;
		}

		const location = await getCurrentLocation();

		await savePhoto(blob, {
			source: 'camera',
			runtimeLabel: runtime.label,
			mimeType: 'image/jpeg',
			...location && {
				latitude: location.latitude,
				longitude: location.longitude,
				locationAccuracy: location.accuracy,
				locationProvider: location.provider,
			},
		});
		closeCamera();
		await refresh();
		pageMessage.value = '已离线保存照片';
	} catch (error) {
		cameraError.value = normalizeError(error);
	} finally {
		isCapturing.value = false;
	}
}

function closeCamera() {
	stopCameraStream();
	cameraDialog.value?.close();
}

function stopCameraStream() {
	if (cameraVideo.value) cameraVideo.value.srcObject = null;
	cameraStream?.getTracks().forEach((track) => track.stop());
	cameraStream = null;
}

// ---------------------------------------------------------------------------
// 查看大图
// ---------------------------------------------------------------------------

async function viewPhoto(photo: OfflinePhoto) {
	pageMessage.value = '';
	try {
		releaseViewerUrl();
		const source = await getPhotoViewSource(photo.id);
		viewerUrl.value = source.url;
		viewerObjectUrl = source.blob ? source.url : '';
		viewerPhoto.value = photo;
		viewerDialog.value?.showModal();
	} catch (error) {
		pageMessage.value = normalizeError(error);
	}
}

function closeViewer() {
	viewerDialog.value?.close();
	releaseViewerUrl();
	viewerUrl.value = '';
	viewerPhoto.value = null;
}

function releaseViewerUrl() {
	if (viewerObjectUrl) {
		URL.revokeObjectURL(viewerObjectUrl);
		viewerObjectUrl = '';
	}
}

// ---------------------------------------------------------------------------
// 删除
// ---------------------------------------------------------------------------

async function removeOne(id: string) {
	try {
		await removePhoto(id);
		checkedIds.value = checkedIds.value.filter((checkedId) => checkedId !== id);
		await refresh();
	} catch (error) {
		pageMessage.value = normalizeError(error);
	}
}

async function removeSelected() {
	if (!checkedIds.value.length) return;
	try {
		await removeManyPhotos(checkedIds.value);
		checkedIds.value = [];
		await refresh();
		pageMessage.value = '已删除所选照片';
	} catch (error) {
		pageMessage.value = normalizeError(error);
	}
}

async function removeAll() {
	if (!photos.value.length) return;
	try {
		await clearAllPhotos();
		checkedIds.value = [];
		await refresh();
		pageMessage.value = '已清空离线照片';
	} catch (error) {
		pageMessage.value = normalizeError(error);
	}
}

// ---------------------------------------------------------------------------
// 上传
// ---------------------------------------------------------------------------

async function handleUpload() {
	if (isUploading.value) return;
	pageMessage.value = '';

	if (!uploadTargetId.value) {
		pageMessage.value = '请选择要上传的照片';
		return;
	}
	if (!uploadUrl.value.trim()) {
		pageMessage.value = '请填写上传地址';
		return;
	}

	try {
		isUploading.value = true;
		const result = await uploadPhoto(uploadTargetId.value, uploadUrl.value.trim());
		await refresh();
		pageMessage.value = result.message;
	} catch (error) {
		pageMessage.value = normalizeError(error);
	} finally {
		isUploading.value = false;
	}
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

function uploadStatusLabel(status: OfflinePhoto['uploadStatus']) {
	const labels: Record<OfflinePhoto['uploadStatus'], string> = {
		local: '仅本地',
		uploaded: '已上传',
		failed: '上传失败',
	};
	return labels[status];
}

function sourceLabel(source: OfflinePhoto['source']) {
	return source === 'camera' ? '相机' : '文件';
}

function formatDate(value?: string) {
	if (!value) return '未记录';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat('zh-CN', {
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date);
}

function dimensionLabel(photo: OfflinePhoto) {
	if (!photo.width || !photo.height) return '尺寸未知';
	return `${photo.width} × ${photo.height}`;
}

function locationLabel(photo: OfflinePhoto) {
	if (photo.latitude == null || photo.longitude == null) return '';
	const lat = photo.latitude.toFixed(6);
	const lng = photo.longitude.toFixed(6);
	const acc = photo.locationAccuracy != null ? ` ±${Math.round(photo.locationAccuracy)}m` : '';
	return `${lat}, ${lng}${acc}`;
}
</script>

<template>
	<section class="offline-photo-page">
		<header class="photo-hero">
			<div>
				<p class="eyebrow">ccs-module-demo</p>
				<h1>离线拍照</h1>
				<span>{{ stats.storageLabel }} 本地相册 · 离线优先 · 共 {{ stats.count }} 张</span>
			</div>
			<div class="hero-metrics">
				<div class="runtime-pill">{{ runtime.label }}</div>
				<div>
					<span>已用空间</span>
					<strong>{{ formatBytes(stats.usedBytes) }}</strong>
				</div>
				<div>
					<span>照片数量</span>
					<strong>{{ stats.count }}</strong>
				</div>
				<div>
					<span>离线存储</span>
					<strong>{{ stats.opfsAvailable ? '可用' : '不可用' }}</strong>
				</div>
			</div>
		</header>

		<div ref="messagePopover" popover="manual" class="page-message-popover">{{ pageMessage }}</div>

		<section class="capture-panel">
			<div class="capture-copy">
				<span>拍照采集</span>
				<strong>所有照片先离线保存，再按需手动上传</strong>
				<small>{{ runtime.strategy }}</small>
			</div>
			<button class="capture-button" type="button" :disabled="!storageAvailable || isCapturing" @click="handleCapture">
				<span class="button-icon">◎</span>
				{{ captureLabel }}
			</button>
		</section>

		<div v-if="isLoading" class="empty-state">正在加载离线相册</div>
		<template v-else>
			<section class="photo-list-panel">
				<div class="panel-heading">
					<span>离线照片</span>
					<strong>{{ photos.length }} 张</strong>
				</div>

				<div v-if="!photos.length" class="empty-state small">还没有照片，点击上方按钮开始拍照</div>
				<div v-else class="photo-grid">
					<article v-for="photo in photos" :key="photo.id" class="photo-card" :class="`upload-${photo.uploadStatus}`">
						<label class="photo-checkbox" @click.stop>
							<input v-model="checkedIds" type="checkbox" :value="photo.id" />
						</label>
						<button type="button" class="thumb-button" @click="viewPhoto(photo)">
							<img v-if="photo.thumbnailDataUrl" :src="photo.thumbnailDataUrl" :alt="photo.name" loading="lazy" />
							<span v-else class="thumb-fallback">无预览</span>
						</button>
						<div class="photo-info">
							<strong :title="photo.name">{{ photo.name }}</strong>
							<div class="photo-meta-line">
								<span>{{ formatDate(photo.capturedAt) }}</span>
								<span>{{ formatBytes(photo.sizeBytes) }}</span>
							</div>
							<div class="photo-meta-line">
								<span>{{ dimensionLabel(photo) }}</span>
								<span>{{ sourceLabel(photo.source) }}</span>
							</div>
							<div v-if="locationLabel(photo)" class="photo-meta-line photo-location" :title="`${photo.locationProvider ?? '定位'} · 精度 ${photo.locationAccuracy != null ? Math.round(photo.locationAccuracy) + 'm' : '未知'}`">
								<span>📍 {{ locationLabel(photo) }}</span>
							</div>
							<span class="upload-badge">{{ uploadStatusLabel(photo.uploadStatus) }}</span>
						</div>
						<div class="photo-actions">
							<button type="button" @click="viewPhoto(photo)">查看</button>
							<button type="button" class="ghost-button" @click="removeOne(photo.id)">删除</button>
						</div>
					</article>
				</div>
			</section>

			<section class="upload-panel">
				<div class="panel-heading">
					<span>上传图片</span>
					<strong>选择一张上传</strong>
				</div>
				<div class="upload-form">
					<label class="field">
						<span>上传地址</span>
						<input v-model="uploadUrl" type="text" placeholder="https://example.com/upload" />
					</label>
					<label class="field">
						<span>选择照片</span>
						<select v-model="uploadTargetId" :disabled="!uploadablePhotos.length">
							<option v-if="!uploadablePhotos.length" value="">暂无照片</option>
							<option v-for="photo in uploadablePhotos" :key="photo.id" :value="photo.id">
								{{ photo.name }}（{{ uploadStatusLabel(photo.uploadStatus) }}）
							</option>
						</select>
					</label>
					<button type="button" class="upload-button" :disabled="isUploading || !uploadTargetId" @click="handleUpload">
						{{ isUploading ? '上传中...' : '上传所选' }}
					</button>
				</div>
			</section>

			<section class="manage-panel">
				<div class="panel-heading">
					<span>相册管理</span>
					<strong>{{ photos.length }} 张 · 已选 {{ checkedIds.length }}</strong>
				</div>
				<div class="manage-stats">
					<div><span>照片文件</span><strong>{{ formatBytes(stats.photoBytes) }}</strong></div>
					<div><span>元数据</span><strong>{{ formatBytes(stats.metadataBytes) }}</strong></div>
					<div><span>已选择</span><strong>{{ formatBytes(totalSelectedBytes) }}</strong></div>
				</div>
				<div class="manage-actions">
					<button type="button" class="secondary-button" :disabled="!checkedIds.length" @click="removeSelected">删除所选</button>
					<button type="button" class="danger-button" :disabled="!photos.length" @click="removeAll">全部清除</button>
				</div>
			</section>
		</template>

		<dialog ref="cameraDialog" closedby="none" class="camera-dialog" aria-label="相机取景" @close="stopCameraStream">
			<div class="camera-body">
				<video ref="cameraVideo" playsinline muted></video>
				<p v-if="cameraError" class="camera-error">{{ cameraError }}</p>
				<div class="camera-controls">
					<button type="button" class="ghost-button" @click="closeCamera">取消</button>
					<button type="button" class="capture-button" :disabled="isCapturing" @click="takeWebPhoto">
						{{ isCapturing ? '保存中...' : '拍照' }}
					</button>
				</div>
			</div>
		</dialog>

		<dialog ref="viewerDialog" closedby="any" class="viewer-dialog" aria-label="查看照片" @close="releaseViewerUrl">
			<div class="viewer-body">
				<div class="viewer-head">
					<strong>{{ viewerPhoto?.name }}</strong>
					<button type="button" class="ghost-button" @click="closeViewer">关闭</button>
				</div>
				<img v-if="viewerUrl" :src="viewerUrl" :alt="viewerPhoto?.name ?? '照片'" />
				<div v-if="viewerPhoto && locationLabel(viewerPhoto)" class="viewer-location">
					<span>📍 {{ locationLabel(viewerPhoto) }}</span>
					<small v-if="viewerPhoto.locationProvider">{{ viewerPhoto.locationProvider }}</small>
				</div>
			</div>
		</dialog>
	</section>
</template>

<style scoped>
.offline-photo-page {
	min-height: calc(100vh - 2rem);
	display: grid;
	gap: 16px;
	color: var(--ccs-text, #101828);
}

.photo-hero,
.capture-panel,
.photo-list-panel,
.upload-panel,
.manage-panel {
	box-sizing: border-box;
	border: 1px solid rgba(15, 23, 42, 0.08);
	border-radius: 8px;
	background: var(--ccs-card-background, #ffffff);
	box-shadow: var(--ccs-card-shadow, 0 18px 48px rgba(15, 23, 42, 0.08));
}

.photo-hero {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 18px;
	padding: 22px;
	background:
		linear-gradient(135deg, rgba(20, 184, 166, 0.16), rgba(37, 99, 235, 0.1) 52%, rgba(245, 158, 11, 0.12)),
		#ffffff;
}

.photo-hero h1,
.photo-hero p,
.photo-hero span,
.panel-heading span,
.hero-metrics span,
.manage-stats span {
	margin: 0;
}

.photo-hero h1 {
	margin-top: 5px;
	font-size: clamp(30px, 5vw, 52px);
	line-height: 1;
}

.eyebrow,
.panel-heading span,
.hero-metrics span,
.manage-stats span {
	color: #667085;
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.photo-hero > div:first-child > span {
	color: #667085;
}

.hero-metrics {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	align-items: stretch;
}

.hero-metrics > div {
	display: grid;
	gap: 6px;
	min-width: 120px;
	padding: 12px;
	border-radius: 8px;
	background: rgba(255, 255, 255, 0.72);
}

.runtime-pill {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 8px 12px;
	border: 1px solid rgba(37, 99, 235, 0.22);
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.72);
	color: #1d4ed8;
	font-size: 13px;
	font-weight: 800;
}

.hero-metrics strong {
	font-size: 18px;
}

.capture-panel {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 20px 22px;
}

.capture-copy {
	display: grid;
	gap: 6px;
}

.capture-copy span {
	color: #667085;
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.capture-copy strong {
	font-size: 20px;
}

.capture-copy small {
	color: #667085;
}

.capture-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	height: 56px;
	padding: 0 24px;
	border: 0;
	border-radius: 999px;
	background: linear-gradient(135deg, #0f766e, #2563eb);
	color: #ffffff;
	font-size: 17px;
	font-weight: 900;
	cursor: pointer;
	box-shadow: 0 18px 36px rgba(37, 99, 235, 0.28);
	transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}

.capture-button:hover:not(:disabled) {
	transform: translateY(-1px);
}

.capture-button:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}

.button-icon {
	font-size: 20px;
	line-height: 1;
}

.photo-list-panel,
.upload-panel,
.manage-panel {
	padding: 16px;
}

.panel-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.panel-heading strong {
	font-size: 20px;
}

.photo-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 12px;
	margin-top: 14px;
}

.photo-card {
	position: relative;
	display: grid;
	gap: 10px;
	padding: 10px;
	border: 1px solid rgba(15, 23, 42, 0.08);
	border-radius: 8px;
	background: #ffffff;
}

.photo-card.upload-uploaded {
	border-color: rgba(22, 163, 74, 0.4);
}

.photo-card.upload-failed {
	border-color: rgba(220, 38, 38, 0.4);
}

.photo-checkbox {
	position: absolute;
	top: 16px;
	left: 16px;
	z-index: 1;
	display: inline-flex;
	padding: 4px;
	border-radius: 6px;
	background: rgba(255, 255, 255, 0.86);
}

.thumb-button {
	display: block;
	width: 100%;
	height: 150px;
	padding: 0;
	border: 0;
	border-radius: 8px;
	overflow: hidden;
	background: #0f172a;
	cursor: pointer;
}

.thumb-button img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.thumb-fallback {
	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
	color: #cbd5e1;
	font-weight: 800;
}

.photo-info {
	display: grid;
	gap: 5px;
}

.photo-info > strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.photo-meta-line {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	color: #667085;
	font-size: 12px;
}

.photo-location {
	color: #2563eb;
	font-weight: 600;
}

.upload-badge {
	justify-self: start;
	padding: 3px 8px;
	border-radius: 8px;
	background: #f1f5f9;
	color: #475569;
	font-size: 12px;
	font-weight: 800;
}

.upload-uploaded .upload-badge {
	background: #dcfce7;
	color: #15803d;
}

.upload-failed .upload-badge {
	background: #fee2e2;
	color: #b91c1c;
}

.photo-actions {
	display: flex;
	gap: 8px;
}

.photo-actions button {
	flex: 1;
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

.secondary-button {
	border: 1px solid rgba(37, 99, 235, 0.18);
	background: rgba(37, 99, 235, 0.08);
	color: #1d4ed8;
}

.ghost-button {
	background: #f8fafc;
	color: #475569;
	border: 1px solid rgba(15, 23, 42, 0.08);
}

.danger-button {
	background: #dc2626;
}

.upload-form {
	display: grid;
	grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
	gap: 12px;
	align-items: end;
	margin-top: 14px;
}

.field {
	display: grid;
	gap: 6px;
}

.field > span {
	color: #667085;
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.field input,
.field select {
	height: 40px;
	padding: 0 10px;
	border: 1px solid rgba(15, 23, 42, 0.15);
	border-radius: 8px;
	font: inherit;
	color: var(--ccs-text, #101828);
	background: #ffffff;
	outline: none;
}

.field input:focus,
.field select:focus {
	border-color: #2563eb;
	box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.upload-button {
	height: 40px;
}

.manage-panel {
	display: grid;
	gap: 12px;
}

.manage-stats {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;
}

.manage-stats div {
	display: grid;
	gap: 6px;
	padding: 12px;
	border-radius: 8px;
	background: #f8fafc;
}

.manage-stats strong {
	font-size: 18px;
}

.manage-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
}

.empty-state {
	display: grid;
	min-height: 200px;
	place-items: center;
	border-radius: 8px;
	padding: 12px;
	color: #667085;
	font-weight: 800;
	text-align: center;
}

.empty-state.small {
	min-height: 140px;
}

.page-message-popover {
	margin: 0;
	padding: 12px 20px;
	border: 0;
	border-radius: 8px;
	background: #1e293b;
	color: #f1f5f9;
	font-weight: 700;
	font-size: 14px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
	position: fixed;
	inset: auto;
	top: 16px;
	left: 50%;
	translate: -50% 0;
	animation: message-slide-in 0.25s ease-out;
}

.page-message-popover::backdrop {
	display: none;
}

@keyframes message-slide-in {
	from {
		opacity: 0;
		translate: -50% -12px;
	}
}

.camera-dialog,
.viewer-dialog {
	width: min(640px, 92vw);
	max-width: 92vw;
	margin: auto;
	padding: 0;
	border: 0;
	border-radius: 12px;
	background: #0f172a;
	color: #f8fafc;
	box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
}

.camera-dialog::backdrop,
.viewer-dialog::backdrop {
	background-color: rgba(2, 6, 23, 0.62);
	backdrop-filter: blur(2px);
}

.camera-body {
	display: grid;
	gap: 14px;
	padding: 18px;
}

.camera-body video {
	width: 100%;
	max-height: 60vh;
	border-radius: 8px;
	background: #000000;
	object-fit: contain;
}

.camera-error {
	margin: 0;
	color: #fca5a5;
	font-weight: 700;
}

.camera-controls {
	display: flex;
	justify-content: space-between;
	gap: 12px;
}

.viewer-dialog {
	background: #ffffff;
	color: #101828;
}

.viewer-body {
	display: grid;
	gap: 12px;
	padding: 16px;
}

.viewer-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.viewer-head strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.viewer-body img {
	width: 100%;
	max-height: 76vh;
	border-radius: 8px;
	object-fit: contain;
	background: #0f172a;
}

.viewer-location {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 10px 12px;
	border-radius: 8px;
	background: #eff6ff;
	color: #1d4ed8;
	font-weight: 700;
	font-size: 14px;
}

.viewer-location small {
	color: #64748b;
	font-weight: 500;
}

@media (max-width: 1100px) {
	.hero-metrics {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 760px) {
	.photo-hero,
	.capture-panel {
		flex-direction: column;
		align-items: stretch;
	}

	.hero-metrics,
	.manage-stats {
		grid-template-columns: 1fr;
	}

	.upload-form {
		grid-template-columns: 1fr;
	}

	.manage-actions {
		flex-wrap: wrap;
	}
}
</style>
