/**
 * webOnboarding.test.ts — the web add-service fixes (v1.0.5), tested at the
 * helper level (no DOM needed). Covers A1 (clear key on kind-switch), B1
 * (verify-before-save navigate gate), and Addr2 (multi-address passthrough).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  freshKindState,
  normalizeAddress,
  buildAddresses,
  verifyThenSave,
  isFirstRunWeb,
  wizardReducer,
  WIZARD_ORDER,
} from './webOnboarding.js';

describe('freshKindState — A1: clear key on kind switch', () => {
  it('clears the apiKey and secondary address', () => {
    const f = freshKindState('radarr');
    expect(f.apiKey).toBe('');
    expect(f.addr2).toBe('');
  });
  it('sets the new kind default port', () => {
    expect(freshKindState('radarr').port).toBe('7878');
    expect(freshKindState('sonarr').port).toBe('8989');
    expect(freshKindState('prowlarr').port).toBe('9696');
  });
});

describe('buildAddresses / normalizeAddress — Addr2: multi-address', () => {
  it('single address when no secondary is given', () => {
    expect(buildAddresses('192.168.1.50', '8989', '', 8989)).toEqual(['http://192.168.1.50:8989']);
  });
  it('primary LAN IP + secondary container name → two addresses, primary first', () => {
    expect(buildAddresses('192.168.1.50', '8989', 'sonarr', 8989)).toEqual([
      'http://192.168.1.50:8989',
      'http://sonarr:8989',
    ]);
  });
  it('normalizes host:port and full URLs', () => {
    expect(normalizeAddress('sonarr:8989', 8989)).toBe('http://sonarr:8989');
    expect(normalizeAddress('http://sonarr:8989/', 8989)).toBe('http://sonarr:8989');
    expect(normalizeAddress('sonarr', 8989)).toBe('http://sonarr:8989'); // bare host → default port
    expect(normalizeAddress('   ', 8989)).toBeNull();
  });
  it('drops a duplicate secondary', () => {
    expect(buildAddresses('sonarr', '8989', 'sonarr', 8989)).toEqual(['http://sonarr:8989']);
  });
});

describe('verifyThenSave — B1: verify before save, navigate gate', () => {
  it('does NOT persist and signals no-navigate when verify fails', async () => {
    const put = vi.fn(async () => ({}));
    const verify = vi.fn(async () => ({ ok: false, error: 'no address answered' }));
    const r = await verifyThenSave('sonarr', ['http://x:8989'], 'KEY', verify, put);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no address answered');
    expect(put).not.toHaveBeenCalled(); // nothing persisted → caller must not onDone()
  });

  it('persists and signals navigate on success, passing ALL addresses through', async () => {
    const put = vi.fn(async () => ({}));
    const verify = vi.fn(async () => ({ ok: true }));
    const addrs = ['http://192.168.1.50:8989', 'http://sonarr:8989'];
    const r = await verifyThenSave('sonarr', addrs, 'KEY', verify, put);
    expect(r.ok).toBe(true);
    expect(verify).toHaveBeenCalledWith('sonarr', { addresses: addrs, apiKey: 'KEY' });
    expect(put).toHaveBeenCalledWith('sonarr', { addresses: addrs, apiKey: 'KEY' });
  });
});

describe('first-run wizard', () => {
  it('detects first-run (no onCancel = wizard) vs add-another (onCancel = single form)', () => {
    expect(isFirstRunWeb(undefined)).toBe(true); // zero services → wizard
    expect(isFirstRunWeb(() => {})).toBe(false); // services exist → single form, NOT wizard
  });

  it('steps in the fixed order Sonarr → Radarr → SABnzbd → Prowlarr', () => {
    expect(WIZARD_ORDER).toEqual(['sonarr', 'radarr', 'sabnzbd', 'prowlarr']);
  });

  it('a successful save advances to the next step', () => {
    expect(wizardReducer({ step: 0, done: false }, { type: 'saved' })).toEqual({ step: 1, done: false });
    expect(wizardReducer({ step: 2, done: false }, { type: 'saved' })).toEqual({ step: 3, done: false });
  });

  it('Skip advances without adding (no persistence in the reducer)', () => {
    expect(wizardReducer({ step: 0, done: false }, { type: 'skip' })).toEqual({ step: 1, done: false });
    expect(wizardReducer({ step: 1, done: false }, { type: 'skip' })).toEqual({ step: 2, done: false });
  });

  it('save OR skip on the last step (Prowlarr) auto-exits (done)', () => {
    expect(wizardReducer({ step: 3, done: false }, { type: 'saved' })).toEqual({ step: 4, done: true });
    expect(wizardReducer({ step: 3, done: false }, { type: 'skip' })).toEqual({ step: 4, done: true });
  });

  it('Finish exits immediately from any step (saved services already persisted per-step)', () => {
    expect(wizardReducer({ step: 0, done: false }, { type: 'finish' }).done).toBe(true);
    expect(wizardReducer({ step: 2, done: false }, { type: 'finish' }).done).toBe(true);
  });

  it('a FAILED verify does not advance (component only dispatches saved on ok)', async () => {
    const put = vi.fn(async () => ({}));
    const r = await verifyThenSave('sonarr', ['http://x:8989'], 'k', async () => ({ ok: false, error: 'x' }), put);
    const wouldAdvance = r.ok; // component: if (r.ok) dispatch({type:'saved'})
    expect(wouldAdvance).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });
});
