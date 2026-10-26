import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oxy.oxydoku',
  appName: 'oxyDoku',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    CapacitorUpdater: {
      autoUpdate: false,
      resetWhenUpdate: false
    }
  }
};

export default config;
