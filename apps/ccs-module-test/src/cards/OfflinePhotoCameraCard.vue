<template>
  <CardShell>
    <div class="op-camera-card">
      <div class="op-camera-card__copy">
        <span class="op-camera-card__label">{{ __('photoCapture') }}</span>
        <strong>{{ __('allPhotosOffline') }}</strong>
        <small>{{ store.runtime.strategy }}</small>
      </div>

      <button class="op-camera-card__btn" type="button" :disabled="!store.storageAvailable || store.isCapturing" @click="handleCapture">
        <span class="op-camera-card__btn-icon">◎</span>
        {{ captureLabel }}
      </button>

      <!-- Web camera dialog -->
      <dialog ref="cameraDialog" class="op-camera-card__dialog" @close="stopCamera">
        <div class="op-camera-card__dialog-body">
          <video ref="cameraVideo" playsinline muted></video>
          <p v-if="cameraError" class="op-camera-card__dialog-error">{{ cameraError }}</p>
          <div class="op-camera-card__dialog-actions">
            <button type="button" class="op-camera-card__btn ghost" @click="closeCamera">取消</button>
            <button type="button" class="op-camera-card__btn" :disabled="store.isCapturing" @click="takeWebPhoto">
              {{ store.isCapturing ? '保存中...' : '拍照' }}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { CardShell } from '@ccs/ui-vue';
import { useOfflinePhotoStore } from '../stores/offline-photo';
import { createCardTranslator } from '../lib/card-i18n';

const msgs = {
  'zh-CN': {
    photoCapture: '拍照采集',
    allPhotosOffline: '照片先离线保存，再按需上传',
    capturing: '处理中...',
    nativeCapture: '调用相机拍照',
    webCapture: '打开相机拍照'
  },
  'en-US': {
    photoCapture: 'Photo Capture',
    allPhotosOffline: 'Photos are saved offline first',
    capturing: 'Processing...',
    nativeCapture: 'Open Camera',
    webCapture: 'Open Camera'
  }
} as const;
const __ = createCardTranslator(msgs);

const store = useOfflinePhotoStore();

const cameraDialog = ref<HTMLDialogElement | null>(null);
const cameraVideo = ref<HTMLVideoElement | null>(null);
const cameraError = ref('');
let cameraStream: MediaStream | null = null;

const captureLabel = computed(() => {
  if (store.isCapturing) return __('capturing');
  return store.runtime.kind === 'android' ? __('nativeCapture') : __('webCapture');
});

async function handleCapture() {
  if (!store.storageAvailable || store.isCapturing) return;

  if (store.runtime.kind === 'android') {
    await store.handleNativeCapture();
    return;
  }
  await openWebCamera();
}

async function openWebCamera() {
  cameraError.value = '';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 8000 }, height: { ideal: 8000 }, facingMode: 'environment' },
      audio: false
    });
  } catch {
    store.pageMessage = '无法打开相机';
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
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    cameraError.value = '相机尚未就绪';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cameraError.value = '不支持画布抓帧';
    return;
  }
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) {
    cameraError.value = '抓帧失败';
    return;
  }

  const location = await store.getCurrentLocation();
  await store.saveWebPhoto(blob, location ?? undefined);
  closeCamera();
}

function closeCamera() {
  stopCamera();
  cameraDialog.value?.close();
}
function stopCamera() {
  if (cameraVideo.value) cameraVideo.value.srcObject = null;
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
}
</script>

<style scoped>
.op-camera-card {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.op-camera-card__copy {
  display: grid;
  gap: 4px;
}

.op-camera-card__label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.op-camera-card__copy strong {
  font-size: 18px;
  color: var(--ccs-text, #0f172a);
}

.op-camera-card__copy small {
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.op-camera-card__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #0f766e, var(--ccs-primary, #2563eb));
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ccs-primary, #2563eb) 32%, transparent);
  transition: transform 160ms ease;
}

.op-camera-card__btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.op-camera-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.op-camera-card__btn.ghost {
  background: transparent;
  color: var(--ccs-text, #0f172a);
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 12%, transparent);
  box-shadow: none;
}

.op-camera-card__btn-icon {
  font-size: 18px;
  line-height: 1;
}

.op-camera-card__dialog {
  width: min(480px, 90vw);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: var(--ccs-text, #0f172a);
  color: var(--ccs-card-background, #f8fafc);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
}
.op-camera-card__dialog::backdrop {
  background: rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(2px);
}

.op-camera-card__dialog-body {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.op-camera-card__dialog-body video {
  width: 100%;
  max-height: 50vh;
  border-radius: 8px;
  background: #000;
  object-fit: contain;
}

.op-camera-card__dialog-error {
  margin: 0;
  color: #fca5a5;
  font-weight: 700;
}

.op-camera-card__dialog-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

@media (max-width: 480px) {
  .op-camera-card {
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .op-camera-card__copy {
    text-align: center;
  }
}
</style>
