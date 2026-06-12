<template>
  <CardShell>
    <div class="shift-card">
      <div class="shift-card__heading">
        <span>{{ __('shiftInfo') }}</span>
        <strong>09:00 - 18:00</strong>
      </div>

      <div class="shift-card__metrics">
        <div>
          <span>{{ __('flexWindow') }}</span>
          <strong>30 {{ __('minutes') }}</strong>
        </div>
        <div>
          <span>{{ __('attendanceRange') }}</span>
          <strong>{{ __('mobilePunch') }}</strong>
        </div>
      </div>

      <div class="shift-card__timeline">
        <div v-for="item in timelineItems" :key="item.titleKey" class="shift-card__tli" :class="{ done: item.entry }">
          <div class="shift-card__tli-dot"></div>
          <div>
            <span>{{ __(item.titleKey) }} · {{ __('target') }} {{ item.target }}</span>
            <strong>{{ item.entry?.time ?? __('notPunched') }}</strong>
            <small v-if="item.entry">{{ item.entry.location.provider }} · {{ item.entry.location.accuracy }} {{ __('meter') }}</small>
          </div>
        </div>
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
    shiftInfo: '今日班次',
    flexWindow: '弹性窗口',
    minutes: '分钟',
    attendanceRange: '考勤范围',
    mobilePunch: '移动打卡',
    checkInTitle: '上班',
    checkOutTitle: '下班',
    target: '目标',
    notPunched: '未打卡',
    meter: '米'
  },
  'en-US': {
    shiftInfo: 'Shift Info',
    flexWindow: 'Flex Window',
    minutes: 'min',
    attendanceRange: 'Range',
    mobilePunch: 'Mobile Punch',
    checkInTitle: 'Check-in',
    checkOutTitle: 'Check-out',
    target: 'Target',
    notPunched: 'Not punched',
    meter: 'm'
  }
} as const;

const __ = createCardTranslator(msgs);

const store = useAttendanceStore();

const timelineItems = computed(() => [
  {
    titleKey: 'checkInTitle',
    target: '09:00',
    entry: store.attendance.checkIn
  },
  {
    titleKey: 'checkOutTitle',
    target: '18:00',
    entry: store.attendance.checkOut
  }
]);
</script>

<style scoped>
.shift-card {
  height: 100%;
  display: grid;
  gap: 14px;
  align-content: start;
}

.shift-card__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.shift-card__heading span {
  font-size: 16px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.shift-card__heading strong {
  font-size: 20px;
  color: var(--ccs-text, #0f172a);
}

.shift-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.shift-card__metrics div {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-bg, #f8fafc) 92%, transparent);
}

.shift-card__metrics span {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.shift-card__metrics strong {
  font-size: 18px;
  color: var(--ccs-text, #0f172a);
}

.shift-card__timeline {
  display: grid;
  gap: 10px;
}

.shift-card__tli {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid color-mix(in srgb, var(--ccs-text, #0f172a) 8%, transparent);
}

.shift-card__tli-dot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 999px;
  background: var(--ccs-text-muted, #cbd5e1);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ccs-text, #0f172a) 6%, transparent);
}

.shift-card__tli.done .shift-card__tli-dot {
  background: #14b8a6;
  box-shadow: 0 0 0 4px color-mix(in srgb, #14b8a6 16%, transparent);
}

.shift-card__tli div:last-child {
  display: grid;
  gap: 3px;
}

.shift-card__tli span {
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.shift-card__tli strong {
  font-size: 20px;
  color: var(--ccs-text, #0f172a);
}

.shift-card__tli small {
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

@media (max-width: 400px) {
  .shift-card__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
