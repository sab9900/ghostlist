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
      // resize: 'none' + resizeOnFullScreen: true used to be combined here, but that's
      // a double application of the keyboard inset: resizeOnFullScreen makes Android
      // natively shrink the WebView's container by ~keyboardHeight, and on top of that
      // app.ts adds padding-bottom: var(--keyboard-height) to app-root. The two stack,
      // so the visible UI gets squeezed by roughly 2x the keyboard height, leaving a
      // large empty (black) gap above the keyboard. We rely solely on the JS-driven
      // --keyboard-height CSS variable for layout, so native resizing must stay off.
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
