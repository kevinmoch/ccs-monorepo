<template>
  <CardShell>
    <div class="op-camera-card">
      <div class="op-camera-card__copy">
        <span class="op-camera-card__label">{{ t('photoCapture') }}</span>
        <strong>{{ t('allPhotosOffline') }}</strong>
        <small>{{ runtimeStrategy }}</small>
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
            <button type="button" class="op-camera-card__btn ghost" @click="closeCamera">{{ t('cancel') }}</button>
            <button type="button" class="op-camera-card__btn" :disabled="store.isCapturing" @click="takeWebPhoto">
              {{ store.isCapturing ? t('saving') : t('takePhoto') }}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { CardShell } from '@ccs/card';
import { useRuntimeOptions, type RuntimeInfo } from '@ccs/shared';
import { useOfflinePhotoStore } from '../stores/offline-photo';
import { useScopedT } from '@ccs/shared';

const t = useScopedT('offlinePhoto');

const store = useOfflinePhotoStore();

const runtimeOptions = useRuntimeOptions();

const runtimeStrategy = computed(() => {
  const option = runtimeOptions.value.find((o: RuntimeInfo) => o.kind === store.runtime.kind);
  return option?.strategy ?? '';
});

const cameraDialog = ref<HTMLDialogElement | null>(null);
const cameraVideo = ref<HTMLVideoElement | null>(null);
const cameraError = ref('');
let cameraStream: MediaStream | null = null;

const captureLabel = computed(() => {
  if (store.isCapturing) return t('capturing');
  return store.runtime.kind === 'android' ? t('nativeCapture') : t('webCapture');
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
    store.pageMessage = t('cannotOpenCamera');
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
    cameraError.value = t('cameraNotReady');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cameraError.value = t('canvasUnsupported');
    return;
  }
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) {
    cameraError.value = t('captureFailed');
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
  background: var(--ccs-primary, #006fd6);
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  font-family: inherit;
  cursor: pointer;
  transition: transform 160ms ease;
  white-space: nowrap;
}

.op-camera-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.op-camera-card__btn.ghost {
  border: 1px solid color-mix(in srgb, var(--ccs-primary, #006fd6) 22%, transparent);
  background: color-mix(in srgb, var(--ccs-primary, #006fd6) 2%, transparent);
  color: var(--ccs-link-color, #2563eb);
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
