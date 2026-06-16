import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {

  appId: 'com.norica_informatics.ghostlist',
  appName: 'Ghost List',
  webDir: 'dist/ghost-list-client/browser',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
  },
  android: {
    backgroundColor: '#0e0e10',
  },
  plugins: {
    Keyboard: {

      resize: 'none',
      style: 'dark',
      resizeOnFullScreen: false,
    },
    StatusBar: {
      style: 'default',
      overlaysWebView: true,
    },
  },
};

export default config;
