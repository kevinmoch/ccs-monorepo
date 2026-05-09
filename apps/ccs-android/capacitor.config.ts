import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ccs.framework',
  appName: 'CCS Framework',
  webDir: '../../dist/web',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: ['localhost'],
    cleartext: true,
  },
};

export default config;
