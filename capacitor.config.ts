import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartmaps.os',
  appName: 'Smart Maps OS',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
