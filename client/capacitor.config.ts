import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Note: Android uses this appId (com.norica_informatics.ghostlist - underscores,
  // since Android package names can't contain hyphens). iOS already diverged to
  // com.norica-informatics.ghostlist (see ios/App/App.xcodeproj PRODUCT_BUNDLE_IDENTIFIER).
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
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'default',
      overlaysWebView: true,
    },
  },
};

export default config;
