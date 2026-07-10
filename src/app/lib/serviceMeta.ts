/**
 * serviceMeta.ts — per-kind display metadata (label + which icon), driven by
 * the engine's DEFAULT_PORTS so the app never re-lists ports.
 */

import { DEFAULT_PORTS, type ServiceKind } from '../../engine/index.js';
import { Download, Film, Radar, Tv, Clapperboard, type LucideIcon } from 'lucide-react';

export interface ServiceMeta {
  kind: ServiceKind;
  label: string;
  port: number;
  icon: LucideIcon;
}

export const SERVICE_META: Record<ServiceKind, ServiceMeta> = {
  sonarr: { kind: 'sonarr', label: 'Sonarr', port: DEFAULT_PORTS.sonarr, icon: Tv },
  radarr: { kind: 'radarr', label: 'Radarr', port: DEFAULT_PORTS.radarr, icon: Film },
  sabnzbd: { kind: 'sabnzbd', label: 'SABnzbd', port: DEFAULT_PORTS.sabnzbd, icon: Download },
  prowlarr: { kind: 'prowlarr', label: 'Prowlarr', port: DEFAULT_PORTS.prowlarr, icon: Radar },
  plex: { kind: 'plex', label: 'Plex', port: DEFAULT_PORTS.plex, icon: Clapperboard },
};

/** Ordered list for rendering (the four *arr services first, then Plex). */
export const SERVICE_ORDER: ServiceKind[] = [
  'sonarr',
  'radarr',
  'sabnzbd',
  'prowlarr',
  'plex',
];
