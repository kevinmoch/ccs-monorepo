@import 'tailwindcss';
@import '@ccs/card/card.css';

@custom-variant dark (&:where(.dark, .dark *));

body {
  margin: 0;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

::-webkit-scrollbar,
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
::-webkit-scrollbar-track,
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb,
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #CBD5E1;
  border-radius: 4px;
}
::-webkit-scrollbar-corner,
.custom-scrollbar::-webkit-scrollbar-corner {
  background: transparent;
}

.dark ::-webkit-scrollbar-thumb,
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #475569;
}

.module-shell {
  min-height: 100%;
  padding: 1rem;
  color: var(--ccs-text, #0f172a);
}
.module-home {
  min-height: 280px;
  display: grid;
  align-content: center;
  gap: 10px;
  padding: 24px;
  border: var(--ccs-card-border-width) solid var(--ccs-card-border-color);
  border-radius: var(--ccs-card-radius);
  background: var(--ccs-card-background);
  box-shadow: var(--ccs-card-shadow);
}
.module-home p {
  margin: 0;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 58%, transparent);
  font-weight: 700;
}
.module-home h1 {
  margin: 0;
  font-size: clamp(30px, 6vw, 48px);
}
.module-home span {
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 68%, transparent);
}
.module-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}
.module-header span {
  color: #64748b;
  font-size: 12px;
}
.module-header h2 {
  margin: 4px 0 0;
}
.module-header nav {
  display: flex;
  gap: 10px;
}
.module-header a {
  padding: 8px 12px;
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
}
.module-header a.router-link-active {
  background: color-mix(in srgb, var(--ccs-primary, #006fd6) 14%, transparent);
  color: var(--ccs-primary, #006fd6);
}
.metric-value {
  font-size: clamp(34px, 5vw, 52px);
  font-weight: 800;
}
.metric-card {
  min-height: 112px;
  display: grid;
  align-content: center;
  gap: 10px;
}
.metric-card span {
  font-size: 12px;
  font-weight: 700;
  color: color-mix(in srgb, var(--ccs-text, #0f172a) 62%, transparent);
}
.metric-card strong {
  font-size: clamp(30px, 5vw, 46px);
  line-height: 1;
  color: var(--ccs-primary, #006fd6);
}
.metric-card small {
  font-size: 13px;
  font-weight: 700;
  color: #16a34a;
}
.metric-up {
  margin: 12px 0 0;
  color: #16a34a;
}
