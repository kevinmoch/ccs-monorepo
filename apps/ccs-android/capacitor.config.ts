import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.huawei.ccps',
  appName: '基建-云解决方案',
  webDir: '../../dist/web',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: ['localhost'],
    cleartext: true
  }
};

export default config;
