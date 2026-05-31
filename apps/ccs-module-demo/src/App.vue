<template>
  <div class="module-shell">
    <header class="module-header">
      <div>
        <span>ccs-module-demo</span>
        <h2>{{ $t('demoModule') }}</h2>
      </div>
      <nav>
        <RouterLink to="/">{{ $t('demoModule') }}</RouterLink>
        <RouterLink to="/dashboard">{{ $t('demoDashboard') }}</RouterLink>
        <!-- ccs-cli:nav -->
      </nav>
    </header>
    <RouterView />
  </div>
</template>
