import { defineStore } from 'pinia';
import {
  captureAndroidPhoto,
  clearAllPhotos,
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
  uploadPhoto
} from '@ccs/shared';
import { createAttendanceService } from '@ccs/shared';
import type { OfflinePhoto, PhotoStorageStats } from '@ccs/shared';

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
    uploadUrl: 'https://192.168.43.232:8083/upload',
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
      storageLabel: '检测中'
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
          this.pageMessage = '当前环境不支持离线照片存储';
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
        this.pageMessage = '已离线保存照片';
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
        this.pageMessage = '已离线保存照片';
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
        this.pageMessage = '已删除所选照片';
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
        this.pageMessage = '已清空离线照片';
      } catch (error) {
        this.pageMessage = normalizeError(error);
      }
    },

    async handleUpload() {
      if (this.isUploading) return;
      this.pageMessage = '';

      if (!this.uploadTargetId) {
        this.pageMessage = '请选择要上传的照片';
        return;
      }
      if (!this.uploadUrl.trim()) {
        this.pageMessage = '请填写上传地址';
        return;
      }

      try {
        this.isUploading = true;
        const result = await uploadPhoto(this.uploadTargetId, this.uploadUrl.trim());
        await this.refresh();
        this.pageMessage = result.message;
      } catch (error) {
        this.pageMessage = normalizeError(error);
      } finally {
        this.isUploading = false;
      }
    },

    // display helpers
    uploadStatusLabel(status: OfflinePhoto['uploadStatus']): string {
      const labels: Record<OfflinePhoto['uploadStatus'], string> = {
        local: '仅本地',
        uploaded: '已上传',
        failed: '上传失败'
      };
      return labels[status];
    },

    sourceLabel(source: OfflinePhoto['source']): string {
      return source === 'camera' ? '相机' : '文件';
    },

    formatDate(value?: string): string {
      if (!value) return '未记录';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    },

    dimensionLabel(photo: OfflinePhoto): string {
      if (!photo.width || !photo.height) return '尺寸未知';
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
