<template>
  <CardShell>
    <div class="geo-card">
      <div class="geo-card__topline">
        <span>{{ t('currentTime') }}</span>
        <strong :class="accuracyClass">{{ accuracyLabel }}</strong>
      </div>

      <div class="geo-card__clock">{{ formattedTime }}</div>

      <button class="geo-card__btn" type="button" :disabled="store.isLocating" @click="handlePrimaryAction">
        <span class="geo-card__btn-icon">⌖</span>
        {{ primaryActionText }}
      </button>

      <div class="geo-card__location" :class="{ 'has-error': store.locationError }">
        <span>{{ locationProvider }}</span>
        <div class="geo-card__loc-row">
          <strong>{{ locationSummary }}</strong>
          <a v-if="mapLink && store.runtime.kind === 'web'" class="geo-card__map-link" :href="mapLink.href" target="_blank" rel="noreferrer">{{ mapLink.label }}</a>
          <button v-else-if="mapLink" type="button" class="geo-card__map-link" @click="store.openMap()">{{ mapLink.label }}</button>
        </div>
        <small v-if="store.lastLocation">{{ t('accuracyPrefix') }} {{ store.lastLocation.accuracy }} {{ t('meter') }}</small>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { CardShell } from '@ccs/ui-vue';
import { getRuntimeOptions } from '@ccs/shared';
import { useAttendanceStore } from '../stores/attendance';
import { useScopedT } from '@ccs/shared';

const t = useScopedT('attendance');

const store = useAttendanceStore();

const locationProvider = computed(() => {
  if (store.lastLocation?.provider) return t(store.lastLocation.provider);
  const options = getRuntimeOptions();
  const option = options.find((o) => o.kind === store.runtime.kind);
  return option?.strategy ?? '';
});

const now = ref(new Date());
let clockTimer: number | undefined;

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer);
});

const formattedTime = computed(() =>
  new Intl.DateTimeFormat(t('locale'), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now.value)
);

const primaryActionText = computed(() => {
  if (store.isLocating) return t('locating');
  if (store.attendance.checkIn && store.attendance.checkOut) return t('updateLocation');
  return store.nextPunch === 'checkIn' ? t('checkIn') : t('checkOut');
});

const locationSummary = computed(() => {
  if (store.locationError) return store.locationError;
  if (!store.lastLocation) return t('waitingLocation');
  return `${store.lastLocation.latitude.toFixed(6)}, ${store.lastLocation.longitude.toFixed(6)}`;
});

const mapLink = computed(() => store.mapLink);

const accuracyClass = computed(() => {
  const level = store.accuracyLevel;
  return {
    'geo-card__acc--high': level === 'high',
    'geo-card__acc--ok': level === 'ok',
    'geo-card__acc--warn': level === 'warn'
  };
});

const accuracyLabel = computed(() => {
  const map: Record<string, string> = {
    high: t('accuracyHigh'),
    ok: t('accuracyOk'),
    warn: t('accuracyReview'),
    none: t('accuracyNone')
  };
  return map[store.accuracyLevel] ?? store.accuracyLevel;
});

function handlePrimaryAction() {
  if (store.attendance.checkIn && store.attendance.checkOut) {
    store.refreshLocation();
  } else {
    store.punch(store.nextPunch);
  }
}
</script>

<style scoped>
.geo-card {
  height: 100%;
  display: grid;
  align-content: space-between;
  gap: 16px;
}

.geo-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 16px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 50%, transparent));
}

.geo-card__topline strong {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 14px;
}

.geo-card__acc--high {
  background: color-mix(in srgb, #16a34a 14%, transparent);
  color: #15803d;
}
.geo-card__acc--ok {
  background: color-mix(in srgb, #ca8a04 14%, transparent);
  color: #a16207;
}
.geo-card__acc--warn {
  background: color-mix(in srgb, #dc2626 14%, transparent);
  color: #b91c1c;
}

.geo-card__clock {
  font-variant-numeric: tabular-nums;
  font-size: clamp(40px, 10vw, 80px);
  font-weight: 900;
  line-height: 0.92;
  letter-spacing: 0;
  color: var(--ccs-text, #0f172a);
}

.geo-card__btn {
  width: min(200px, 100%);
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--ccs-primary, #2563eb), color-mix(in srgb, var(--ccs-primary, #2563eb) 60%, #0f766e));
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ccs-primary, #2563eb) 32%, transparent);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    opacity 160ms ease;
}

.geo-card__btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 34px color-mix(in srgb, var(--ccs-primary, #2563eb) 38%, transparent);
}

.geo-card__btn:disabled {
  cursor: wait;
  opacity: 0.7;
}

.geo-card__btn-icon {
  font-size: 18px;
  line-height: 1;
}

.geo-card__location {
  display: grid;
  gap: 4px;
  padding: 12px;
  margin-top: 20px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ccs-bg, #f8fafc) 92%, transparent);
  font-size: 12px;
  color: var(--ccs-text-muted, color-mix(in srgb, var(--ccs-text, #0f172a) 55%, transparent));
}

.geo-card__location.has-error {
  background: color-mix(in srgb, #f97316 8%, transparent);
}

.geo-card__location strong {
  font-size: 14px;
  line-height: 1.35;
  color: var(--ccs-text, #0f172a);
  word-break: break-word;
}

.geo-card__loc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.geo-card__map-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 10%, transparent);
  color: var(--ccs-primary, #2563eb);
  font-size: 12px;
  font-weight: 800;
  font-family: inherit;
  line-height: 1.4;
  text-decoration: none;
  cursor: pointer;
}

.geo-card__map-link:hover {
  background: color-mix(in srgb, var(--ccs-primary, #2563eb) 18%, transparent);
}

@media (max-width: 640px) {
  .geo-card__clock {
    font-size: 40px;
  }
  .geo-card__btn {
    width: 100%;
  }
  .geo-card__loc-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
