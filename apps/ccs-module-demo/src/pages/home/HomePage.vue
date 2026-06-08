<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Geolocation } from '@capacitor/geolocation';
import {
	createAttendanceService,
	RUNTIME_OPTIONS,
	getElectron,
} from '@ccs/shared';
import type {
	PunchType,
	LocationFix,
	AttendanceRecord,
	MapLink,
} from '@ccs/shared';

// ---------------------------------------------------------------------------
// 考勤服务（注入 Capacitor Geolocation 插件和 Electron 桥接）
// ---------------------------------------------------------------------------

const attendanceService = createAttendanceService({
	Geolocation: Geolocation as unknown as import('@ccs/shared').CapacitorGeolocation,
	electronOpenMap: getElectron()?.openMap,
});

const {
	runtime,
	loadAttendanceRecord,
	saveAttendanceRecord,
	getLatestAttendanceLocation,
	buildMapLink,
	openMapLocation: serviceOpenMapLocation,
	normalizeLocationError,
	locate,
	punch: servicePunch,
} = attendanceService;

// ---------------------------------------------------------------------------
// 响应式状态
// ---------------------------------------------------------------------------

const now = ref(new Date());
const isLocating = ref(false);
const locationError = ref('');
const attendance = ref<AttendanceRecord>(loadAttendanceRecord());
const lastLocation = ref<LocationFix | null>(getLatestAttendanceLocation(attendance.value));

let clockTimer: number | undefined;

// ---------------------------------------------------------------------------
// 计算属性
// ---------------------------------------------------------------------------

const formattedDate = computed(() => new Intl.DateTimeFormat('zh-CN', {
	month: 'long',
	day: 'numeric',
	weekday: 'long',
}).format(now.value));

const formattedTime = computed(() => new Intl.DateTimeFormat('zh-CN', {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
}).format(now.value));

const todayStatus = computed(() => {
	if (attendance.value.checkIn && attendance.value.checkOut) return '今日已完成';
	if (attendance.value.checkIn) return '已上班，待下班打卡';
	return '待上班打卡';
});

const nextPunch = computed<PunchType>(() =>
	attendance.value.checkIn ? 'checkOut' : 'checkIn',
);

const primaryActionText = computed(() => {
	if (isLocating.value) return '定位中...';
	if (attendance.value.checkIn && attendance.value.checkOut) return '更新定位';
	return nextPunch.value === 'checkIn' ? '上班打卡' : '下班打卡';
});

const locationSummary = computed(() => {
	if (locationError.value) return locationError.value;
	if (!lastLocation.value) return '等待获取当前位置';
	return `${lastLocation.value.latitude.toFixed(6)}, ${lastLocation.value.longitude.toFixed(6)}`;
});

const mapLink = computed<MapLink | null>(() => {
	if (!lastLocation.value) return null;
	return buildMapLink(lastLocation.value);
});

const accuracyLevel = computed(() => {
	const accuracy = lastLocation.value?.accuracy;
	if (!accuracy) return '未定位';
	if (accuracy <= 50) return '高精度';
	if (accuracy <= 150) return '可用';
	return '需复核';
});

const timelineItems = computed(() => [
	{ title: '上班', target: '09:00', entry: attendance.value.checkIn },
	{ title: '下班', target: '18:00', entry: attendance.value.checkOut },
]);

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------

onMounted(() => {
	clockTimer = window.setInterval(() => {
		now.value = new Date();
	}, 1000);
});

onUnmounted(() => {
	if (clockTimer) window.clearInterval(clockTimer);
});

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

async function handlePrimaryAction() {
	if (attendance.value.checkIn && attendance.value.checkOut) {
		await refreshLocation();
		return;
	}

	await punch(nextPunch.value);
}

async function refreshLocation() {
	try {
		locationError.value = '';
		isLocating.value = true;
		lastLocation.value = await locate();
	} catch (error) {
		locationError.value = normalizeLocationError(error);
	} finally {
		isLocating.value = false;
	}
}

async function punch(type: PunchType) {
	try {
		locationError.value = '';
		isLocating.value = true;

		const result = await servicePunch(type, attendance.value);
		lastLocation.value = result.location;
		attendance.value = result.record;
		saveAttendanceRecord(result.record);
	} catch (error) {
		locationError.value = normalizeLocationError(error);
	} finally {
		isLocating.value = false;
	}
}

async function openMapLocation() {
	if (!mapLink.value) return;
	await serviceOpenMapLocation(mapLink.value);
}
</script>

<template>
	<section class="attendance-page">
		<header class="attendance-hero">
			<div>
				<p class="eyebrow">ccs-module-demo</p>
				<h1>考勤打卡</h1>
				<span>{{ formattedDate }} · {{ todayStatus }}</span>
			</div>
			<div class="runtime-pill">{{ runtime.label }}</div>
		</header>

		<div class="attendance-grid">
			<section class="clock-panel">
				<div class="clock-topline">
					<span>当前时间</span>
					<strong>{{ accuracyLevel }}</strong>
				</div>
				<div class="clock-time">{{ formattedTime }}</div>
				<button class="punch-button" type="button" :disabled="isLocating" @click="handlePrimaryAction">
					<span class="button-icon">⌖</span>
					{{ primaryActionText }}
				</button>
				<div class="location-strip" :class="{ 'has-error': locationError }">
					<span>{{ lastLocation?.provider ?? runtime.strategy }}</span>
					<div class="location-row">
						<strong>{{ locationSummary }}</strong>
						<a v-if="mapLink && runtime.kind === 'web'" class="map-link" :href="mapLink.href" target="_blank" rel="noreferrer">
							{{ mapLink.label }}
						</a>
						<button v-else-if="mapLink" type="button" class="map-link" @click="openMapLocation">
							{{ mapLink.label }}
						</button>
					</div>
					<small v-if="lastLocation">定位精度约 {{ lastLocation.accuracy }} 米</small>
				</div>
			</section>

			<section class="shift-panel">
				<div class="panel-heading">
					<span>今日班次</span>
					<strong>09:00 - 18:00</strong>
				</div>
				<div class="shift-metrics">
					<div>
						<span>弹性窗口</span>
						<strong>30 分钟</strong>
					</div>
					<div>
						<span>考勤范围</span>
						<strong>移动打卡</strong>
					</div>
				</div>
				<div class="timeline">
					<div v-for="item in timelineItems" :key="item.title" class="timeline-item" :class="{ done: item.entry }">
						<div class="timeline-dot"></div>
						<div>
							<span>{{ item.title }} · 目标 {{ item.target }}</span>
							<strong>{{ item.entry?.time ?? '未打卡' }}</strong>
							<small v-if="item.entry">{{ item.entry.location.provider }} · {{ item.entry.location.accuracy }} 米</small>
						</div>
					</div>
				</div>
			</section>
		</div>

		<section class="platform-panel">
			<div class="platform-card" v-for="option in RUNTIME_OPTIONS" :key="option.kind" :class="{ active: option.kind === runtime.kind }">
				<span>{{ option.label }}</span>
				<strong>{{ option.strategy }}</strong>
				<small>{{ option.accuracy }}</small>
			</div>
		</section>
	</section>
</template>

<style scoped>
.attendance-page {
	min-height: calc(100vh - 2rem);
	display: grid;
	gap: 18px;
	color: #101828;
}

.attendance-hero {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 18px;
	padding: 24px;
	border: 1px solid rgba(15, 23, 42, 0.08);
	border-radius: 8px;
	background:
		linear-gradient(135deg, rgba(20, 184, 166, 0.18), rgba(37, 99, 235, 0.1) 48%, rgba(245, 158, 11, 0.13)),
		#ffffff;
	box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.attendance-hero h1,
.attendance-hero p,
.attendance-hero span {
	margin: 0;
}

.attendance-hero h1 {
	margin-top: 6px;
	font-size: clamp(32px, 5vw, 56px);
	line-height: 1;
	letter-spacing: 0;
}

.attendance-hero span,
.eyebrow,
.clock-topline span,
.panel-heading span,
.shift-metrics span,
.timeline-item span,
.platform-card span,
.location-strip span,
.location-strip small,
.timeline-item small,
.platform-card small {
	color: #667085;
}

.eyebrow,
.clock-topline span,
.panel-heading span,
.shift-metrics span,
.timeline-item span,
.platform-card span {
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.runtime-pill {
	flex: 0 0 auto;
	padding: 8px 12px;
	border: 1px solid rgba(37, 99, 235, 0.22);
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.72);
	color: #1d4ed8;
	font-size: 13px;
	font-weight: 800;
}

.attendance-grid {
	display: grid;
	grid-template-columns: minmax(0, 1.16fr) minmax(320px, 0.84fr);
	gap: 18px;
}

.clock-panel,
.shift-panel,
.platform-panel {
	border: 1px solid rgba(15, 23, 42, 0.08);
	border-radius: 8px;
	background: #ffffff;
	box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.clock-panel {
	display: grid;
	align-content: space-between;
	gap: 24px;
	min-height: 430px;
	padding: 24px;
}

.clock-topline,
.panel-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
}

.clock-topline strong {
	padding: 6px 10px;
	border-radius: 999px;
	background: rgba(22, 163, 74, 0.12);
	color: #15803d;
	font-size: 13px;
}

.clock-time {
	font-variant-numeric: tabular-nums;
	font-size: clamp(52px, 12vw, 112px);
	font-weight: 900;
	line-height: 0.92;
	letter-spacing: 0;
}

.punch-button {
	width: min(240px, 100%);
	height: 64px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	border: 0;
	border-radius: 999px;
	background: linear-gradient(135deg, #0f766e, #2563eb);
	color: #ffffff;
	font-size: 18px;
	font-weight: 900;
	cursor: pointer;
	box-shadow: 0 18px 36px rgba(37, 99, 235, 0.28);
	transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}

.punch-button:hover:not(:disabled) {
	transform: translateY(-1px);
	box-shadow: 0 22px 42px rgba(37, 99, 235, 0.34);
}

.punch-button:disabled {
	cursor: wait;
	opacity: 0.72;
}

.button-icon {
	font-size: 22px;
	line-height: 1;
}

.location-strip {
	display: grid;
	gap: 6px;
	padding: 16px;
	border-radius: 8px;
	background: #f8fafc;
}

.location-strip.has-error {
	background: #fff7ed;
}

.location-strip strong {
	font-size: 16px;
	line-height: 1.35;
	word-break: break-word;
}

.location-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.map-link {
	flex: 0 0 auto;
	display: inline-flex;
	align-items: center;
	padding: 7px 10px;
	border: 0;
	border-radius: 999px;
	background: rgba(37, 99, 235, 0.1);
	color: #1d4ed8;
	font-size: 13px;
	font-weight: 800;
	font-family: inherit;
	line-height: 1.4;
	text-decoration: none;
	cursor: pointer;
}

.map-link:hover {
	background: rgba(37, 99, 235, 0.16);
}

.shift-panel {
	display: grid;
	gap: 18px;
	padding: 22px;
}

.panel-heading strong {
	font-size: 24px;
}

.shift-metrics {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.shift-metrics div {
	display: grid;
	gap: 8px;
	padding: 16px;
	border-radius: 8px;
	background: #f8fafc;
}

.shift-metrics strong {
	font-size: 20px;
}

.timeline {
	display: grid;
	gap: 14px;
}

.timeline-item {
	display: grid;
	grid-template-columns: 18px minmax(0, 1fr);
	gap: 12px;
	padding: 14px 0;
	border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.timeline-dot {
	width: 12px;
	height: 12px;
	margin-top: 4px;
	border-radius: 999px;
	background: #cbd5e1;
	box-shadow: 0 0 0 5px #f1f5f9;
}

.timeline-item.done .timeline-dot {
	background: #14b8a6;
	box-shadow: 0 0 0 5px rgba(20, 184, 166, 0.14);
}

.timeline-item div:last-child {
	display: grid;
	gap: 5px;
}

.timeline-item strong {
	font-size: 24px;
}

.platform-panel {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1px;
	overflow: hidden;
}

.platform-card {
	display: grid;
	gap: 8px;
	min-height: 128px;
	padding: 18px;
	background: #ffffff;
}

.platform-card.active {
	background: #ecfeff;
}

.platform-card strong {
	font-size: 16px;
	line-height: 1.35;
}

@media (max-width: 900px) {
	.attendance-grid,
	.platform-panel {
		grid-template-columns: 1fr;
	}

	.clock-panel {
		min-height: 0;
	}
}

@media (max-width: 640px) {
	.attendance-page {
		min-height: calc(100vh - 2rem);
	}

	.attendance-hero {
		flex-direction: column;
		padding: 20px;
	}

	.clock-panel,
	.shift-panel {
		padding: 18px;
	}

	.clock-time {
		font-size: 48px;
	}

	.location-row {
		align-items: flex-start;
		flex-direction: column;
	}

	.shift-metrics {
		grid-template-columns: 1fr;
	}
}
</style>