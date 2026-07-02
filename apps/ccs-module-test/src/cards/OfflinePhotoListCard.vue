<template>
  <CardShell>
    <div class="op-list-card">
      <div class="op-list-card__head">
        <span class="op-list-card__label">{{ t('offlinePhotos') }}</span>
        <strong>{{ store.photos.length }} {{ t('photos') }}</strong>
      </div>

      <div v-if="store.isLoading" class="op-list-card__empty">{{ t('loading') }}</div>
      <div v-else-if="!store.photos.length" class="op-list-card__empty">{{ t('noPhotosHint') }}</div>

      <div v-else class="op-list-card__grid">
        <article v-for="photo in store.photos" :key="photo.id" class="op-list-card__item" :class="`upload-${photo.uploadStatus}`">
          <label class="op-list-card__checkbox">
            <input v-model="store.checkedIds" type="checkbox" :value="photo.id" />
          </label>

          <button type="button" class="op-list-card__thumb" @click="openViewer(photo)">
            <img v-if="photo.thumbnailDataUrl" :src="photo.thumbnailDataUrl" :alt="photo.name" loading="lazy" />
            <span v-else class="op-list-card__thumb-fb">{{ t('noPreview') }}</span>
          </button>

          <div class="op-list-card__info">
            <strong :title="photo.name">{{ photo.name }}</strong>
            <div class="op-list-card__meta-line">
              <span>{{ store.formatDate(photo.capturedAt) }}</span>
              <span>{{ formatBytes(photo.sizeBytes) }}</span>
            </div>
            <div class="op-list-card__meta-line">
              <span>{{ store.dimensionLabel(photo) }}</span>
              <span>{{ store.sourceLabel(photo.source) }}</span>
            </div>
            <div v-if="store.locationLabel(photo)" class="op-list-card__meta-line op-list-card__loc">
              <span>📍 {{ store.locationLabel(photo) }}</span>
            </div>
            <span class="op-list-card__up-badge">{{ store.uploadStatusLabel(photo.uploadStatus) }}</span>
          </div>

          <div class="op-list-card__actions">
            <button type="button" @click="openViewer(photo)">{{ t('view') }}</button>
            <button type="button" class="ghost" @click="store.removeOne(photo.id)">{{ t('delete') }}</button>
          </div>
        </article>
      </div>

      <!-- viewer dialog -->
      <dialog ref="viewerDialog" class="op-list-card__viewer" @close="closeViewer">
        <div class="op-list-card__viewer-body">
          <div class="op-list-card__viewer-head">
            <strong>{{ viewerPhoto?.name }}</strong>
            <button type="button" class="ghost" @click="closeViewer">{{ t('close') }}</button>
          </div>
          <img v-if="viewerSrc" :src="viewerSrc" :alt="viewerPhoto?.name ?? ''" />
          <div v-if="viewerPhoto && store.locationLabel(viewerPhoto)" class="op-list-card__viewer-loc">
            <span>📍 {{ store.locationLabel(viewerPhoto) }}</span>
            <small v-if="viewerPhoto.locationProvider">{{ viewerPhoto.locationProvider }}</small>
          </div>
        </div>
      </dialog>

      <!-- toast -->
      <div ref="toastRef" popover="manual" class="op-list-card__toast">{{ store.pageMessage }}</div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { CardShell } from '@ccs/card';
import { formatBytes } from '@ccs/shared';
import type { OfflinePhoto } from '@ccs/shared';
import { useOfflinePhotoStore } from '../stores/offline-photo';
import { useScopedT } from '@ccs/shared';

const t = useScopedT('offlinePhoto');

const store = useOfflinePhotoStore();

// viewer
const viewerDialog = ref<HTMLDialogElement | null>(null);
const viewerSrc = ref('');
const viewerPhoto = ref<OfflinePhoto | null>(null);
let viewerObjectUrl = '';

async function openViewer(photo: OfflinePhoto) {
  try {
    releaseViewerUrl();
    const source = await store.viewPhoto(photo);
    viewerSrc.value = source.url;
    viewerObjectUrl = source.blob ? source.url : '';
    viewerPhoto.value = photo;
    viewerDialog.value?.showModal();
  } catch {
    /* error handled by store */
  }
}

function closeViewer() {
  viewerDialog.value?.close();
  releaseViewerUrl();
  viewerSrc.value = '';
  viewerPhoto.value = null;
}

function releaseViewerUrl() {
  if (viewerObjectUrl) {
    URL.revokeObjectURL(viewerObjectUrl);
    viewerObjectUrl = '';
  }
}

// toast
const toastRef = ref<HTMLElement | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => store.pageMessage,
  async (msg) => {
    if (msg && toastRef.value) {
      clearTimeout(toastTimer);
      await nextTick();
      toastRef.value.showPopover();
      toastTimer = setTimeout(() => toastRef.value?.hidePopover(), 3000);
    }
  }
);

onMounted(async () => {
  if (store.photos.length === 0) await store.initialize();
});
</script>

<style scoped>
.op-list-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.op-list-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
}

.op-list-card__head strong {
  font-size: 16px;
  color: var(--ccs-text, #0f172a);
}

.op-list-card__label {
  font-size: 16px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.op-list-card__empty {
  display: grid;
  place-items: center;
  flex: 1;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
  font-weight: 800;
  font-size: 14px;
}

.op-list-card__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
  flex: 1;
  overflow-y: auto;
  align-content: start;
}

.op-list-card__item {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 8%, transparent);
  border-radius: 8px;
  background: var(--ccs-card-background, #fff);
}

.op-list-card__item.upload-uploaded {
  border-color: color-mix(in srgb, #16a34a 40%, transparent);
}
.op-list-card__item.upload-failed {
  border-color: color-mix(in srgb, #dc2626 40%, transparent);
}

.op-list-card__checkbox {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1;
  padding: 3px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ccs-card-background, #fff) 86%, transparent);
  line-height: 1;
}

.op-list-card__thumb {
  display: block;
  width: 100%;
  height: 120px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--ccs-text, #0f172a);
  cursor: pointer;
}

.op-list-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.op-list-card__thumb-fb {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #cbd5e1;
  font-weight: 800;
  font-size: 12px;
}

.op-list-card__info {
  display: grid;
  gap: 4px;
}

.op-list-card__info > strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--ccs-text, #0f172a);
}

.op-list-card__meta-line {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.op-list-card__loc {
  color: var(--ccs-primary, #2563eb);
  font-weight: 600;
}

.op-list-card__up-badge {
  justify-self: start;
  padding: 2px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ccs-text, #0f172a) 8%, transparent);
  color: var(--ccs-text-muted, #475569);
  font-size: 11px;
  font-weight: 800;
}

.upload-uploaded .op-list-card__up-badge {
  background: color-mix(in srgb, #16a34a 14%, transparent);
  color: #15803d;
}
.upload-failed .op-list-card__up-badge {
  background: color-mix(in srgb, #dc2626 14%, transparent);
  color: #b91c1c;
}

.op-list-card__actions {
  display: flex;
  gap: 6px;
}

.op-list-card__actions button {
  flex: 1;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: var(--ccs-primary, #2563eb);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
}

.op-list-card__actions button.ghost {
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 12%, transparent);
  background: transparent;
  color: var(--ccs-text-muted, #475569);
}

/* viewer dialog */
.op-list-card__viewer {
  width: min(540px, 90vw);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: var(--ccs-card-background, #fff);
  color: var(--ccs-text, #0f172a);
}
.op-list-card__viewer::backdrop {
  background: rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(2px);
}

.op-list-card__viewer-body {
  display: grid;
  gap: 10px;
  padding: 14px;
}
.op-list-card__viewer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.op-list-card__viewer-head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.op-list-card__viewer-body img {
  width: 100%;
  max-height: 65vh;
  border-radius: 8px;
  object-fit: contain;
  background: var(--ccs-text, #0f172a);
}

.op-list-card__viewer-loc {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 10%, transparent);
  color: var(--ccs-primary, #2563eb);
  font-weight: 700;
  font-size: 13px;
}
.op-list-card__viewer-loc small {
  color: var(--ccs-text-muted, #64748b);
  font-weight: 500;
}

/* toast */
.op-list-card__toast {
  margin: 0;
  padding: 10px 18px;
  border: 0;
  border-radius: 8px;
  background: var(--ccs-text, #1e293b);
  color: var(--ccs-card-background, #f1f5f9);
  font-weight: 700;
  font-size: 13px;
  position: fixed;
  inset: auto;
  top: 16px;
  left: 50%;
  translate: -50% 0;
  animation: op-toast-in 0.25s ease-out;
}
.op-list-card__toast::backdrop {
  display: none;
}
@keyframes op-toast-in {
  from {
    opacity: 0;
    translate: -50% -12px;
  }
}

@media (max-width: 500px) {
  .op-list-card__grid {
    grid-template-columns: 1fr;
  }
}
</style>
