<template>
  <CardShell>
    <div class="op-upload-card">
      <div class="op-upload-card__head">
        <span class="op-upload-card__label">{{ t('uploadPhoto') }}</span>
      </div>

      <div class="op-upload-card__form">
        <label class="op-upload-card__field">
          <span>{{ t('uploadUrl') }}</span>
          <input v-model="store.uploadUrl" type="text" placeholder="https://..." />
        </label>
        <button type="button" class="op-upload-card__btn" :disabled="store.isUploading || !store.checkedIds.length" @click="store.handleUpload()">
          {{ uploadButtonText }}
        </button>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CardShell } from '@ccs/card';
import { useOfflinePhotoStore } from '../stores/offline-photo';
import { useScopedT } from '@ccs/shared';

const t = useScopedT('offlinePhoto');

const store = useOfflinePhotoStore();

const uploadButtonText = computed(() => {
  if (store.isUploading) return t('uploading');
  const n = store.checkedIds.length;
  if (n > 1) return `${t('upload')}（${n}）`;
  return t('upload');
});
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
}

.op-upload-card__form {
  display: grid;
  grid-template-columns: 1fr auto;
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
  border-color: var(--ccs-primary, #006fd6);
}

.op-upload-card__btn {
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: var(--ccs-primary, #006fd6);
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
