import { defineStore } from 'pinia';
import { createAttendanceService, getElectron } from '@ccs/shared';
import type { AttendanceRecord, LocationFix, PunchType, MapLink } from '@ccs/shared';

const attendanceService = createAttendanceService({
  electronOpenMap: getElectron()?.openMap
});

export const useAttendanceStore = defineStore('attendance', {
  state: () => ({
    attendance: attendanceService.loadAttendanceRecord() as AttendanceRecord,
    lastLocation: attendanceService.getLatestAttendanceLocation(attendanceService.loadAttendanceRecord()) as LocationFix | null,
    isLocating: false,
    locationError: ''
  }),

  getters: {
    runtime: () => attendanceService.runtime,

    todayStatus(state): string {
      if (state.attendance.checkIn && state.attendance.checkOut) return '今日已完成';
      if (state.attendance.checkIn) return '已上班，待下班打卡';
      return '待上班打卡';
    },

    nextPunch(state): PunchType {
      return state.attendance.checkIn ? 'checkOut' : 'checkIn';
    },

    mapLink(state): MapLink | null {
      if (!state.lastLocation) return null;
      return attendanceService.buildMapLink(state.lastLocation);
    },

    accuracyLevel(state): string {
      const accuracy = state.lastLocation?.accuracy;
      if (!accuracy) return '未定位';
      if (accuracy <= 50) return '高精度';
      if (accuracy <= 150) return '可用';
      return '需复核';
    }
  },

  actions: {
    async punch(type: PunchType) {
      try {
        this.locationError = '';
        this.isLocating = true;
        const result = await attendanceService.punch(type, this.attendance);
        this.lastLocation = result.location;
        this.attendance = result.record;
        attendanceService.saveAttendanceRecord(result.record);
      } catch (error) {
        this.locationError = attendanceService.normalizeLocationError(error);
      } finally {
        this.isLocating = false;
      }
    },

    async refreshLocation() {
      try {
        this.locationError = '';
        this.isLocating = true;
        this.lastLocation = await attendanceService.locate();
      } catch (error) {
        this.locationError = attendanceService.normalizeLocationError(error);
      } finally {
        this.isLocating = false;
      }
    },

    async openMap() {
      if (!this.mapLink) return;
      await attendanceService.openMapLocation(this.mapLink);
    }
  }
});
