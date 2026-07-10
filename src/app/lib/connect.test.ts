import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the two collaborators so this is a pure logic test (no engine clients,
// no Capacitor storage).
vi.mock('./verify.js', () => ({ verifyService: vi.fn() }));
vi.mock('../platform/storage.js', () => ({ upsertService: vi.fn() }));

import { connectService } from './connect.js';
import { verifyService } from './verify.js';
import { upsertService } from '../platform/storage.js';

describe('connectService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists the config (upsert by kind) when verification succeeds', async () => {
    (verifyService as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, version: '4.3.0' });

    const result = await connectService('sabnzbd', 'http://192.168.0.100:8085', 'KEY123');

    expect(result).toEqual({ ok: true, version: '4.3.0' });
    expect(upsertService).toHaveBeenCalledTimes(1);
    expect(upsertService).toHaveBeenCalledWith({
      kind: 'sabnzbd',
      addresses: ['http://192.168.0.100:8085'],
      apiKey: 'KEY123',
    });
  });

  it('does NOT persist when verification fails', async () => {
    (verifyService as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'bad key' });

    const result = await connectService('sonarr', 'http://10.0.0.5:8989', 'WRONG');

    expect(result.ok).toBe(false);
    expect(upsertService).not.toHaveBeenCalled();
  });
});
