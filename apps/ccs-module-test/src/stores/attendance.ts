import { defineStore } from 'pinia';
import { createAttendanceService, getElectron } from '@ccs/shared';
import type { AttendanceRecord, LocationFix, PunchType, MapLink } from '@ccs/shared';

const attendanceService = createAttendanceService({
  electronOpenMap: getElectron()?.openMap
});

export type AccuracyKey = 'high' | 'ok' | 'warn' | 'none';

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
      if (state.attendance.checkIn && state.attendance.checkOut) return 'done';
      if (state.attendance.checkIn) return 'in';
      return 'pending';
    },

    nextPunch(state): PunchType {
      return state.attendance.checkIn ? 'checkOut' : 'checkIn';
    },

    mapLink(state): MapLink | null {
      if (!state.lastLocation) return null;
      return attendanceService.buildMapLink(state.lastLocation);
    },

    accuracyLevel(state): AccuracyKey {
      const accuracy = state.lastLocation?.accuracy;
      if (!accuracy) return 'none';
      if (accuracy <= 50) return 'high';
      if (accuracy <= 150) return 'ok';
      return 'warn';
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
