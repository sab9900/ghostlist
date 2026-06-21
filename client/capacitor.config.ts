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
      // iOS only — Android ignores this and is driven entirely by
      // windowSoftInputMode in AndroidManifest.xml (see KeyboardInsetService,
      // which handles iOS padding manually via keyboardWillShow/Hide).
      resize: 'none',
      style: 'dark',
      // Android only. windowSoftInputMode="adjustResize" alone fails to
      // resize the WebView when the StatusBar plugin overlays it
      // (overlaysWebView: true below puts the app in edge-to-edge/full
      // screen mode) — a long-standing Android WebView bug. This flag is
      // the documented workaround; without it the WebView never actually
      // shrinks, so the keyboard floats over a stale, oversized layout and
      // the page becomes scrollable by exactly the keyboard's height.
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'default',
      overlaysWebView: true,
    },
  },
};

export default config;
