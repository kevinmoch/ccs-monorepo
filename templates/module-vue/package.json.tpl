{
  "name": "__MODULE_NAME__",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port __MODULE_DEV_PORT__",
    "build": "vue-tsc -p tsconfig.json --noEmit && vite build",
    "build:cards": "node scripts/build-cards.mjs",
    "preview": "vite preview --port 4174",
    "lint": "vue-tsc -p tsconfig.json --noEmit",
    "clean": "rm -rf dist .ccs-card-build"
  },
  "dependencies": {
    "@ccs/runtime": "workspace:*",
    "@ccs/shared": "workspace:*",
    "@ccs/ui-vue": "workspace:*",
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-vue": "latest",
    "i18next": "latest",
    "pinia": "latest",
    "vite": "latest",
    "vue": "latest",
    "vue-i18n": "latest",
    "vue-router": "latest"
  },
  "devDependencies": {
    "tailwindcss": "^4.1.14",
    "typescript": "latest",
    "vue-tsc": "latest"
  }
}
