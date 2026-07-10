/**
 * appInfo.ts — the app's own version, read at RUNTIME from the APK.
 *
 * On device, @capacitor/app's App.getInfo() returns the real versionName/Code
 * baked into the build by android/app/build.gradle — so the displayed version
 * is always correct and needs no manual sync when the version bumps.
 *
 * On web, getInfo() isn't implemented; we fall back to a build-time constant
 * (kept loosely current) rather than crash. The native value is authoritative.
 */

import { App } from '@capacitor/app';
import { isNative } from './env.js';

/** Fallback for non-native surfaces / plugin errors. Native getInfo() wins. */
const FALLBACK_VERSION = '1.0.3';

export interface AppVersion {
  version: string;
  build?: string;
}

/** Read the app version. Never throws — resolves to a best-effort value. */
export async function getAppVersion(): Promise<AppVersion> {
  if (isNative()) {
    try {
      const info = await App.getInfo();
      return { version: info.version, build: info.build };
    } catch {
      // Plugin hiccup — fall through to the constant rather than crash.
    }
  }
  return { version: FALLBACK_VERSION };
}
