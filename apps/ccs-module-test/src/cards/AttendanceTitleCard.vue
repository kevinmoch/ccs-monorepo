<template>
  <CardShell>
    <div class="title-card">
      <div class="title-card__main">
        <div class="title-card__text">
          <h2 class="title-card__heading">{{ __('attendance') }}</h2>
          <span class="title-card__sub">{{ formattedDate }} · {{ todayStatus }}</span>
        </div>
        <div class="title-card__pill">{{ store.runtime.label }}</div>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CardShell } from '@ccs/ui-vue';
import { useAttendanceStore } from '../stores/attendance';
import { createCardTranslator } from '../lib/card-i18n';

const msgs = {
  'zh-CN': {
    attendance: '考勤打卡',
    locale: 'zh-CN',
    statusDone: '今日已完成',
    statusIn: '已上班，待下班打卡',
    statusPending: '待上班打卡'
  },
  'en-US': {
    attendance: 'Attendance',
    locale: 'en-US',
    statusDone: 'Completed today',
    statusIn: 'Checked in, pending check-out',
    statusPending: 'Pending check-in'
  }
} as const;

const __ = createCardTranslator(msgs);

const store = useAttendanceStore();

const now = computed(() => new Date());

const formattedDate = computed(() =>
  new Intl.DateTimeFormat(__('locale'), {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(now.value)
);

const todayStatus = computed(() => {
  if (store.attendance.checkIn && store.attendance.checkOut) return __('statusDone');
  if (store.attendance.checkIn) return __('statusIn');
  return __('statusPending');
});
</script>

<style scoped>
.title-card {
  height: 100%;
}

.title-card__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title-card__text {
  display: grid;
  gap: 6px;
}

.title-card__eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.title-card__heading {
  margin: 0;
  font-size: clamp(20px, 3vw, 26px);
  font-weight: 900;
  line-height: 1;
  color: var(--ccs-text, #0f172a);
}

.title-card__sub {
  font-size: 13px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.title-card__pill {
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--ccs-primary, #2563eb) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 10%, transparent);
  color: var(--ccs-primary, #2563eb);
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
}
</style>
