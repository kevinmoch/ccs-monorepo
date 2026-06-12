import { defineStore } from 'pinia';
import {
  buildRuntimeUrl,
  captureAndroidPhoto,
  clearAllPhotos,
  detectRuntime,
  getPhotoStorageStats,
  getPhotoViewSource,
  isPhotoStorageAvailable,
  listPhotos,
  normalizeError,
  removeManyPhotos,
  removePhoto,
  savePhoto,
  uploadPhoto
} from '@ccs/shared';
import { createAttendanceService } from '@ccs/shared';
import type { OfflinePhoto, PhotoStorageStats } from '@ccs/shared';
import { i18n } from '../i18n/instance';

const t = (key: string, params?: Record<string, unknown>) => (params ? i18n.global.t(key, params) : i18n.global.t(key)) as string;

const runtime = detectRuntime();
const storageAvailable = isPhotoStorageAvailable();
const { locate } = createAttendanceService();

export const useOfflinePhotoStore = defineStore('offline-photo', {
  state: () => ({
    runtime,
    storageAvailable,
    photos: [] as OfflinePhoto[],
    checkedIds: [] as string[],
    uploadTargetId: '',
    uploadUrl: buildRuntimeUrl(8083, '/upload', { androidPort: 8082 }),
    isLoading: true,
    isCapturing: false,
    isUploading: false,
    pageMessage: '',
    stats: {
      count: 0,
      usedBytes: 0,
      photoBytes: 0,
      metadataBytes: 0,
      opfsAvailable: storageAvailable,
      storageKind: 'unavailable' as const,
      storageLabel: t('offlinePhoto.detecting')
    } as PhotoStorageStats
  }),

  getters: {
    totalSelectedBytes(state): number {
      return state.checkedIds.reduce((total, id) => {
        const photo = state.photos.find((item) => item.id === id);
        return total + (photo?.sizeBytes ?? 0);
      }, 0);
    },

    uploadablePhotos(state): OfflinePhoto[] {
      return state.photos;
    }
  },

  actions: {
    async initialize() {
      this.isLoading = true;
      try {
        if (!this.storageAvailable) {
          this.pageMessage = t('offlinePhoto.storageUnavailable');
          return;
        }
        await this.refresh();
      } catch (error) {
        this.pageMessage = normalizeError(error);
      } finally {
        this.isLoading = false;
      }
    },

    async refresh() {
      this.photos = await listPhotos();
      this.stats = await getPhotoStorageStats();
      if (!this.photos.some((p) => p.id === this.uploadTargetId)) {
        this.uploadTargetId = this.photos[0]?.id ?? '';
      }
    },

    async getCurrentLocation() {
      try {
        return await locate();
      } catch {
        return undefined;
      }
    },

    async handleNativeCapture() {
      try {
        this.isCapturing = true;
        const [result, location] = await Promise.all([captureAndroidPhoto(), this.getCurrentLocation()]);
        await savePhoto(result.blob, {
          source: 'camera',
          runtimeLabel: runtime.label,
          mimeType: result.mimeType,
          ...(location && {
            latitude: location.latitude,
            longitude: location.longitude,
            locationAccuracy: location.accuracy,
            locationProvider: location.provider
          })
        });
        await this.refresh();
        this.pageMessage = t('offlinePhoto.photoSavedOffline');
      } catch (error) {
        this.pageMessage = normalizeError(error);
      } finally {
        this.isCapturing = false;
      }
    },

    async saveWebPhoto(blob: Blob, location?: { latitude: number; longitude: number; accuracy: number; provider: string }) {
      try {
        this.isCapturing = true;
        await savePhoto(blob, {
          source: 'camera',
          runtimeLabel: runtime.label,
          mimeType: 'image/jpeg',
          ...(location && {
            latitude: location.latitude,
            longitude: location.longitude,
            locationAccuracy: location.accuracy,
            locationProvider: location.provider
          })
        });
        await this.refresh();
        this.pageMessage = t('offlinePhoto.photoSavedOffline');
      } catch (error) {
        this.pageMessage = normalizeError(error);
      } finally {
        this.isCapturing = false;
      }
    },

    async viewPhoto(photo: OfflinePhoto): Promise<{ url: string; blob?: Blob }> {
      this.pageMessage = '';
      try {
        const source = await getPhotoViewSource(photo.id);
        return source;
      } catch (error) {
        this.pageMessage = normalizeError(error);
        throw error;
      }
    },

    async removeOne(id: string) {
      try {
        await removePhoto(id);
        this.checkedIds = this.checkedIds.filter((cid) => cid !== id);
        await this.refresh();
      } catch (error) {
        this.pageMessage = normalizeError(error);
      }
    },

    async removeSelected() {
      if (!this.checkedIds.length) return;
      try {
        await removeManyPhotos(this.checkedIds);
        this.checkedIds = [];
        await this.refresh();
        this.pageMessage = t('offlinePhoto.selectedPhotosDeleted');
      } catch (error) {
        this.pageMessage = normalizeError(error);
      }
    },

    async removeAll() {
      if (!this.photos.length) return;
      try {
        await clearAllPhotos();
        this.checkedIds = [];
        await this.refresh();
        this.pageMessage = t('offlinePhoto.allPhotosCleared');
      } catch (error) {
        this.pageMessage = normalizeError(error);
      }
    },

    async handleUpload() {
      if (this.isUploading) return;
      this.pageMessage = '';

      if (!this.checkedIds.length) {
        this.pageMessage = t('offlinePhoto.selectPhotosFirst');
        return;
      }
      if (!this.uploadUrl.trim()) {
        this.pageMessage = t('offlinePhoto.enterUploadUrl');
        return;
      }

      const ids = [...this.checkedIds];
      try {
        this.isUploading = true;
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          this.pageMessage = t('offlinePhoto.uploadingProgress', { current: i + 1, total: ids.length });
          try {
            const result = await uploadPhoto(id, this.uploadUrl.trim());
            if (result.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
        }

        await this.refresh();
        this.checkedIds = [];

        const parts: string[] = [];
        if (successCount > 0) parts.push(t('offlinePhoto.photosUploaded', { count: successCount }));
        if (failCount > 0) parts.push(t('offlinePhoto.photosFailed', { count: failCount }));
        this.pageMessage = parts.length > 0 ? parts.join(', ') : t('offlinePhoto.uploadComplete');
      } catch (error) {
        this.pageMessage = normalizeError(error);
      } finally {
        this.isUploading = false;
      }
    },

    // display helpers
    uploadStatusLabel(status: OfflinePhoto['uploadStatus']): string {
      const labels: Record<OfflinePhoto['uploadStatus'], string> = {
        local: t('offlinePhoto.localOnly'),
        uploaded: t('offlinePhoto.uploaded'),
        failed: t('offlinePhoto.uploadFailed')
      };
      return labels[status];
    },

    sourceLabel(source: OfflinePhoto['source']): string {
      return source === 'camera' ? t('offlinePhoto.camera') : t('offlinePhoto.file');
    },

    formatDate(value?: string): string {
      if (!value) return t('offlinePhoto.notRecorded');
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat(i18n.global.locale.value as string, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    },

    dimensionLabel(photo: OfflinePhoto): string {
      if (!photo.width || !photo.height) return t('offlinePhoto.unknownDimension');
      return `${photo.width} × ${photo.height}`;
    },

    locationLabel(photo: OfflinePhoto): string {
      if (photo.latitude == null || photo.longitude == null) return '';
      const lat = photo.latitude.toFixed(6);
      const lng = photo.longitude.toFixed(6);
      const acc = photo.locationAccuracy != null ? ` ±${Math.round(photo.locationAccuracy)}m` : '';
      return `${lat}, ${lng}${acc}`;
    }
  }
});
