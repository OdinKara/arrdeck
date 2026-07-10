/**
 * browser.ts — open an external URL (the deep-link key helper).
 *
 * On device this opens the service's settings page in the system browser via
 * Capacitor Browser; on web it falls back to window.open.
 */

import { Browser } from '@capacitor/browser';
import { isNative } from './env.js';

export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
