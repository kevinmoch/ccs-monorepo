<template>
	<CcsCardShell :title="title">
		<div class="generated-card">
			<span>{{ label }}</span>
			<strong>{{ value }}</strong>
			<small>{{ trend }}</small>
		</div>
	</CcsCardShell>
</template>

<script setup lang="ts">
import { CcsCardShell } from '@ccs/ui-vue';

withDefaults(defineProps<{ title?: string; label?: string; value?: string | number; trend?: string }>(), {
	title: '__CARD_TITLE__',
	label: '__CARD_NAME__',
	value: '--',
	trend: ''
});
</script>

<style scoped>
.generated-card {
	display: grid;
	align-content: center;
	gap: 10px;
	min-height: 112px;
}
.generated-card span {
	font-size: 12px;
	font-weight: 700;
	color: color-mix(in srgb, var(--ccs-text, #0f172a) 62%, transparent);
}
.generated-card strong {
	font-size: clamp(30px, 5vw, 46px);
	line-height: 1;
	color: var(--ccs-primary, #2563eb);
}
.generated-card small {
	font-size: 13px;
	font-weight: 700;
	color: #16a34a;
}
</style>
