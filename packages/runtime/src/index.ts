import type { Language, MicroModuleManifest, ThemeMode } from '@ccs/shared';
export interface CcsRuntimeProps {
  theme: ThemeMode;
  language: Language;
  routePath: string;
  user?: { id: string; name: string; roles: string[]; permissions: string[] };
}
export type RegisteredMicroApp = MicroModuleManifest;
