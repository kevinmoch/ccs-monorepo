<template>
  <div class="module-shell">
    <header class="module-header">
      <div>
        <span>ccs-module-demo</span>
        <h2>{{ $t('demoModule') }}</h2>
      </div>
      <nav>
        <RouterLink to="/dashboard">{{ $t('analytics') }}</RouterLink
        ><RouterLink to="/orders">{{ $t('orders') }}</RouterLink>
      </nav>
    </header>
    <RouterView />
  </div>
</template>
