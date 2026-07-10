import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor native shell (Android), not a browser. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Human label for the current runtime surface (for debug display). */
export function platformName(): string {
  return Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
}
