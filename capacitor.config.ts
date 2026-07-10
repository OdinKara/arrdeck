import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.grimnirworks.arrdeck',
  appName: 'ArrDeck',
  webDir: 'dist',
  plugins: {
    // THE networking fix: with CapacitorHttp enabled, the plugin patches
    // window.fetch on native so the engine's plain-HTTP LAN calls
    // (e.g. http://192.168.1.100:8989) run through the native HTTP stack,
    // bypassing the webview's CORS + cleartext restrictions. On web/Docker the
    // plugin is inert and the engine uses the browser's real fetch. The engine
    // stays 100% platform-agnostic — it just calls fetch().
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
