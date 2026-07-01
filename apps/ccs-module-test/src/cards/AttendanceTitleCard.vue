<template>
  <CardShell>
    <div class="title-card">
      <div class="title-card__main">
        <div class="title-card__text">
          <div style="display: flex; align-items: center; gap: 8px">
            <h2 class="title-card__heading">{{ t('attendance') }} {{ localProject ? ` - ${localProject.name}` : '' }}</h2>
            <button class="refresh-btn" @click="handleRefreshProject">{{ t('refreshProject') }}</button>
          </div>
          <span class="title-card__sub">{{ formattedDate }} · {{ billCodeDisplay }}</span>
        </div>
        <div class="title-card__pill">{{ runtimeLabel }}</div>
      </div>
    </div>
  </CardShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { CardShell } from '@ccs/card';
import { useRuntimeOptions, type RuntimeInfo, globalStore } from '@ccs/shared';
import { useAttendanceStore } from '../stores/attendance';
import { useScopedT } from '@ccs/shared';

const props = defineProps<{
  project?: any;
}>();

const localProject = ref(props.project);
const localBillCode = ref<string | null>(null);

watch(
  () => props.project,
  (newVal) => {
    localProject.value = newVal;
  },
  { deep: true }
);

const handleRefreshProject = async () => {
  try {
    const p = await globalStore.get('project');
    localProject.value = p;
  } catch (err) {
    console.error('Failed to refresh project', err);
  }
};

const fetchBillCode = async () => {
  try {
    const code = await globalStore.get<string>('selectedBillCode');
    localBillCode.value = code || null;
  } catch (err) {
    console.error('Failed to fetch bill code', err);
  }
};

onMounted(() => {
  fetchBillCode();
});

watch(localBillCode, (newVal) => {
  // Re-fetch when needed (e.g., on visibility change)
});

const t = useScopedT('attendance');

const store = useAttendanceStore();

const runtimeOptions = useRuntimeOptions();

const runtimeLabel = computed(() => {
  const option = runtimeOptions.value.find((o: RuntimeInfo) => o.kind === store.runtime.kind);
  return option?.label ?? '';
});

const now = computed(() => new Date());

const formattedDate = computed(() =>
  new Intl.DateTimeFormat(t('locale'), {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(now.value)
);

const billCodeDisplay = computed(() => {
  return localBillCode.value || '所有单据';
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
  font-size: clamp(20px, 3vw, 20px);
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

.refresh-btn {
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
</style>
