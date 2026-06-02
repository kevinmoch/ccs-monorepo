<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { AppLauncher } from '@capacitor/app-launcher';
import { Geolocation } from '@capacitor/geolocation';

type PunchType = 'checkIn' | 'checkOut';

type RuntimeKind = 'android' | 'electron' | 'web';

type RuntimeInfo = {
	kind: RuntimeKind;
	label: string;
	strategy: string;
	accuracy: string;
};

type LocationFix = {
	latitude: number;
	longitude: number;
	accuracy: number;
	timestamp: number;
	provider: string;
};

type PunchEntry = {
	time: string;
	label: string;
	location: LocationFix;
};

type AttendanceRecord = {
	date: string;
	checkIn?: PunchEntry;
	checkOut?: PunchEntry;
};

type CapacitorBridge = {
	getPlatform?: () => string;
	isNativePlatform?: () => boolean;
};

type ElectronBridge = {
	platform?: string;
	openMap?: (url: string) => Promise<boolean>;
};

type MapLink = {
	href: string;
	fallbackHref: string;
	label: string;
};

const CAPACITOR_LOCATION_TIMEOUT = 16000;
const BROWSER_LOCATION_TIMEOUT = 20000;

const runtimeOptions: RuntimeInfo[] = [
	{
		kind: 'web',
		label: 'Web 应用',
		strategy: '浏览器 Geolocation API + HTTPS 权限',
		accuracy: '优先 GPS / Wi-Fi / 蜂窝网络融合定位'
	},
	{
		kind: 'electron',
		label: 'Windows 应用',
		strategy: 'Electron 授权 Chromium Geolocation，地图用默认浏览器打开 Bing',
		accuracy: '优先系统位置服务和 Wi-Fi/IP 辅助定位'
	},
	{
		kind: 'android',
		label: '安卓应用',
		strategy: 'Capacitor 原生定位 + 外层超时保护，地图用浏览器打开 Bing',
		accuracy: '优先 GPS 高精度定位，超时或异常时回退 WebView 定位'
	}
];

const runtime = detectRuntime();
const now = ref(new Date());
const isLocating = ref(false);
const locationError = ref('');
const attendance = ref<AttendanceRecord>(loadAttendanceRecord());
const lastLocation = ref<LocationFix | null>(getLatestAttendanceLocation(attendance.value));

let clockTimer: number | undefined;

const formattedDate = computed(() => new Intl.DateTimeFormat('zh-CN', {
	month: 'long',
	day: 'numeric',
	weekday: 'long'
}).format(now.value));

const formattedTime = computed(() => new Intl.DateTimeFormat('zh-CN', {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false
}).format(now.value));

const todayStatus = computed(() => {
	if (attendance.value.checkIn && attendance.value.checkOut) return '今日已完成';
	if (attendance.value.checkIn) return '已上班，待下班打卡';
	return '待上班打卡';
});

const nextPunch = computed<PunchType>(() => attendance.value.checkIn ? 'checkOut' : 'checkIn');

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
	{ title: '下班', target: '18:00', entry: attendance.value.checkOut }
]);

onMounted(() => {
	clockTimer = window.setInterval(() => {
		now.value = new Date();
	}, 1000);
});

onUnmounted(() => {
	if (clockTimer) window.clearInterval(clockTimer);
});

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
		const location = await locate();
		const entry = {
			time: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
			label: type === 'checkIn' ? '上班打卡' : '下班打卡',
			location
		};

		lastLocation.value = location;
		attendance.value = { ...attendance.value, [type]: entry };
		saveAttendanceRecord(attendance.value);
	} catch (error) {
		locationError.value = normalizeLocationError(error);
	} finally {
		isLocating.value = false;
	}
}

async function openMapLocation() {
	if (!mapLink.value) return;

	if (runtime.kind === 'android') {
		try {
			await AppLauncher.openUrl({ url: mapLink.value.href });
			return;
		} catch {
			openExternalLink(mapLink.value.fallbackHref);
			return;
		}
	}

	if (runtime.kind === 'electron') {
		const electron = (window as Window & { ccsElectron?: ElectronBridge }).ccsElectron;
		if (electron?.openMap) {
			try {
				await electron.openMap(mapLink.value.href);
				return;
			} catch {
				openExternalLink(mapLink.value.fallbackHref);
				return;
			}
		}
		openExternalLink(mapLink.value.href);
		return;
	}

	openExternalLink(mapLink.value.href);
}

async function locate(): Promise<LocationFix> {
	if (runtime.kind === 'android') {
		try {
			return await withTimeout(
				locateWithCapacitor(),
				CAPACITOR_LOCATION_TIMEOUT,
				'Android 原生定位超时，已切换到 WebView 定位'
			);
		} catch (error) {
			console.warn('Capacitor geolocation failed, falling back to browser geolocation.', error);
		}
	}

	return locateWithBrowser(runtime.kind === 'electron' ? 25000 : BROWSER_LOCATION_TIMEOUT);
}

async function locateWithCapacitor(): Promise<LocationFix> {
	const permissions = await Geolocation.checkPermissions();
	if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
		const requested = await Geolocation.requestPermissions({ permissions: ['location'] });
		if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
			throw new Error('请允许安卓精确定位权限后再打卡');
		}
	}

	const position = await Geolocation.getCurrentPosition({
		enableHighAccuracy: true,
		maximumAge: 0,
		timeout: 18000
	});

	return normalizePosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp, 'Android 原生定位');
}

function locateWithBrowser(timeout: number): Promise<LocationFix> {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error('当前环境不支持定位服务'));
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve(normalizePosition(
					position.coords.latitude,
					position.coords.longitude,
					position.coords.accuracy,
					position.timestamp,
					getBrowserLocationProvider()
				));
			},
			(error) => reject(error),
			{ enableHighAccuracy: true, maximumAge: 0, timeout }
		);
	});
}

function normalizePosition(latitude: number, longitude: number, accuracy: number | null, timestamp: number, provider: string): LocationFix {
	return {
		latitude,
		longitude,
		accuracy: Math.round(accuracy ?? 0),
		timestamp,
		provider
	};
}

function buildMapLink(location: LocationFix): MapLink {
	const latitude = location.latitude.toFixed(6);
	const longitude = location.longitude.toFixed(6);
	const bingWebUrl = new URL('https://www.bing.com/maps');
	bingWebUrl.searchParams.set('q', `${latitude},${longitude}`);
	const href = bingWebUrl.toString();
	const label = runtime.kind === 'web' ? '在 Bing 地图中查看' : '在浏览器中查看地图';

	return { href, fallbackHref: href, label };
}

function getBrowserLocationProvider() {
	if (runtime.kind === 'electron') return 'Windows 系统定位';
	if (runtime.kind === 'android') return 'Android WebView 定位';
	return '浏览器定位';
}

function openExternalLink(url: string) {
	const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
	if (newWindow) return;

	try {
		const topWindow = window.top?.open(url, '_blank', 'noopener,noreferrer') ?? null;
		if (topWindow) return;
	} catch {
		// Cross-origin top is inaccessible; do nothing.
	}

	// All popup attempts failed — keep the user on this page.
	// The link is still available for right-click / copy.
}

function withTimeout<T>(promise: Promise<T>, timeout: number, message: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error(message)), timeout);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				window.clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function detectRuntime(): RuntimeInfo {
	const capacitor = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
	const electron = (window as Window & { ccsElectron?: ElectronBridge }).ccsElectron;

	try {
		if (capacitor?.getPlatform?.() === 'android' || (capacitor?.isNativePlatform?.() && /Android/i.test(navigator.userAgent))) {
			return runtimeOptions[2];
		}
	} catch {
		// Continue with shell checks below.
	}

	if (electron?.platform || /Electron/i.test(navigator.userAgent)) return runtimeOptions[1];
	if (window.location.protocol === 'https:' && window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent)) return runtimeOptions[2];
	return runtimeOptions[0];
}

function loadAttendanceRecord(): AttendanceRecord {
	const date = getTodayKey();
	try {
		const stored = window.localStorage.getItem(getStorageKey(date));
		if (stored) return JSON.parse(stored) as AttendanceRecord;
	} catch {
		// Ignore corrupt local records and start a fresh day.
	}

	return { date };
}

function saveAttendanceRecord(record: AttendanceRecord) {
	window.localStorage.setItem(getStorageKey(record.date), JSON.stringify(record));
}

function getLatestAttendanceLocation(record: AttendanceRecord) {
	return record.checkOut?.location ?? record.checkIn?.location ?? null;
}

function getStorageKey(date: string) {
	return `ccs-demo-attendance:${date}`;
}

function getTodayKey() {
	return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function normalizeLocationError(error: unknown) {
	if (typeof error === 'object' && error && 'code' in error) {
		const code = Number((error as GeolocationPositionError).code);
		if (code === 1) return '定位权限被拒绝，请在系统或浏览器设置中允许位置权限';
		if (code === 2) return '暂时无法获取位置，请确认网络、GPS 或系统位置服务已开启';
		if (code === 3) return '定位超时，请移动到开阔区域后重试';
	}

	if (error instanceof Error && error.message) return error.message;
	return '定位失败，请稍后重试';
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
			<div class="platform-card" v-for="option in runtimeOptions" :key="option.kind" :class="{ active: option.kind === runtime.kind }">
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