<template>
  <CardShell>
    <div class="op-upload-card">
      <div class="op-upload-card__head">
        <span class="op-upload-card__label">{{ __('uploadPhoto') }}</span>
        <strong>{{ __('selectOne') }}</strong>
      </div>

      <div class="op-upload-card__form">
        <label class="op-upload-card__field">
          <span>{{ __('uploadUrl') }}</span>
          <input v-model="store.uploadUrl" type="text" placeholder="https://..." />
        </label>
        <label class="op-upload-card__field">
          <span>{{ __('selectPhoto') }}</span>
          <select v-model="store.uploadTargetId" :disabled="!store.uploadablePhotos.length">
            <option v-if="!store.uploadablePhotos.length" value="">{{ __('noPhotos') }}</option>
            <option v-for="photo in store.uploadablePhotos" :key="photo.id" :value="photo.id">{{ photo.name }}（{{ store.uploadStatusLabel(photo.uploadStatus) }}）</option>
          </select>
        </label>
        <button type="button" class="op-upload-card__btn" :disabled="store.isUploading || !store.uploadTargetId" @click="store.handleUpload()">
          {{ store.isUploading ? __('uploading') : __('upload') }}
        </button>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { CardShell } from '@ccs/ui-vue';
import { useOfflinePhotoStore } from '../stores/offline-photo';
import { createCardTranslator } from '../lib/card-i18n';

const msgs = {
  'zh-CN': {
    uploadPhoto: '上传图片',
    selectOne: '选择一张上传',
    uploadUrl: '上传地址',
    selectPhoto: '选择照片',
    noPhotos: '暂无照片',
    uploading: '上传中...',
    upload: '上传所选'
  },
  'en-US': {
    uploadPhoto: 'Upload Photo',
    selectOne: 'Select one to upload',
    uploadUrl: 'Upload URL',
    selectPhoto: 'Select Photo',
    noPhotos: 'No photos',
    uploading: 'Uploading...',
    upload: 'Upload'
  }
} as const;
const __ = createCardTranslator(msgs);

const store = useOfflinePhotoStore();
</script>

<style scoped>
.op-upload-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.op-upload-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.op-upload-card__head strong {
  font-size: 16px;
  color: var(--ccs-text, #0f172a);
}

.op-upload-card__label {
  font-size: 16px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.op-upload-card__form {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.op-upload-card__field {
  display: grid;
  gap: 4px;
}

.op-upload-card__field span {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.op-upload-card__field input,
.op-upload-card__field select {
  height: 36px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 15%, transparent);
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  color: var(--ccs-text, #0f172a);
  background: var(--ccs-card-background, #fff);
  outline: none;
}

.op-upload-card__field input:focus,
.op-upload-card__field select:focus {
  border-color: var(--ccs-primary, #2563eb);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ccs-primary, #2563eb) 15%, transparent);
}

.op-upload-card__btn {
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: var(--ccs-primary, #2563eb);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.op-upload-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 640px) {
  .op-upload-card__form {
    grid-template-columns: 1fr;
  }
}
</style>
