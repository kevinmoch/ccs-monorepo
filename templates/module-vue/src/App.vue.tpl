<template>
	<div class="module-shell">
		<header class="module-header">
			<div>
				<span>__MODULE_NAME__</span>
				<h2>__MODULE_TITLE__</h2>
			</div>
			<nav>
				<RouterLink to="/">Home</RouterLink>
				<!-- ccs-cli:nav -->
			</nav>
		</header>
		<RouterView />
	</div>
</template>
