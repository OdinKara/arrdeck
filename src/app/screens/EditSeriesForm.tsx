/**
 * EditSeriesForm — native in-app replica of Sonarr's series edit dialog.
 * Monitored, Monitor New Seasons, Season Folder, Quality Profile, Series Type,
 * Path, Tags, and Delete (with "also delete files?" confirm). Save writes back
 * via updateSeries (full-object PUT), Cancel discards.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  buildSeriesUpdatePayload,
  folderNameFrom,
  joinPath,
  matchRoot,
  type SonarrClient,
  type SonarrQualityProfile,
  type SonarrRootFolder,
  type SonarrTag,
} from '../../engine/index.js';
import { Button } from '../components/ui.tsx';
import { SponsorHeart } from '../components/SponsorHeart.tsx';
import { Field, RootFolderList, SelectChips, TagPicker, TextField, ToggleRow } from '../components/form.tsx';

interface FormState {
  monitored: boolean;
  monitorNewItems: 'all' | 'none';
  seasonFolder: boolean;
  qualityProfileId: number;
  seriesType: 'standard' | 'daily' | 'anime';
  /** Selected root folder, or null when the current path matches no known root. */
  rootPath: string | null;
  /** Folder-name portion under the root (editable for renames). */
  folderName: string;
  /** The original full path (fallback display when no root matched). */
  origPath: string;
  tags: Set<number>;
}

export function EditSeriesForm({
  client,
  seriesId,
  seriesTitle,
  onCancel,
  onSaved,
  onDeleted,
}: {
  client: SonarrClient;
  seriesId: number;
  seriesTitle: string;
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [profiles, setProfiles] = useState<SonarrQualityProfile[]>([]);
  const [tags, setTags] = useState<SonarrTag[]>([]);
  const [roots, setRoots] = useState<SonarrRootFolder[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, ps, ts, rf] = await Promise.all([
          client.getSeriesRaw(seriesId),
          client.getQualityProfiles().catch(() => []),
          client.getTags().catch(() => []),
          client.getRootFolders().catch(() => []),
        ]);
        if (cancelled) return;
        setRaw(r);
        setProfiles(ps);
        setTags(ts);
        setRoots(rf);
        const origPath = String(r.path ?? '');
        const matchedRoot = matchRoot(origPath, rf.map((x) => x.path));
        setForm({
          monitored: Boolean(r.monitored),
          monitorNewItems: (r.monitorNewItems === 'none' ? 'none' : 'all'),
          seasonFolder: Boolean(r.seasonFolder),
          qualityProfileId: Number(r.qualityProfileId ?? ps[0]?.id ?? 0),
          seriesType: ((): 'standard' | 'daily' | 'anime' => {
            const t = String(r.seriesType ?? 'standard');
            return t === 'daily' || t === 'anime' ? t : 'standard';
          })(),
          rootPath: matchedRoot,
          folderName: matchedRoot ? folderNameFrom(origPath, matchedRoot) : '',
          origPath,
          tags: new Set((Array.isArray(r.tags) ? (r.tags as number[]) : []).map(Number)),
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, seriesId]);

  // The effective full path when a root is chosen (root + folder name).
  const effectivePath = useMemo(
    () => (form?.rootPath ? joinPath(form.rootPath, form.folderName) : (form?.origPath ?? '')),
    [form],
  );
  // Invalid only when a root is selected but the folder name is blank.
  const pathInvalid = useMemo(
    () => !!form && form.rootPath !== null && form.folderName.trim().length < 1,
    [form],
  );

  async function save() {
    if (!raw || !form || pathInvalid) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildSeriesUpdatePayload(raw, {
        monitored: form.monitored,
        monitorNewItems: form.monitorNewItems,
        seasonFolder: form.seasonFolder,
        qualityProfileId: form.qualityProfileId,
        seriesType: form.seriesType,
        // Only rewrite path/root when a root is selected; otherwise leave the
        // original path untouched (no-match edge case — nothing silently lost).
        ...(form.rootPath
          ? { rootFolderPath: form.rootPath, path: effectivePath }
          : {}),
        tags: [...form.tags],
      });
      // NOTE: PUT /series has no moveFiles param here → Sonarr defaults it to
      // false, so this is a CONFIG-ONLY path change (no files are moved on disk).
      await client.updateSeries(payload);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function doDelete(deleteFiles: boolean) {
    setDeleting(true);
    setError(null);
    try {
      await client.deleteSeries(seriesId, deleteFiles);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid var(--divider)',
        }}
      >
        <button
          onClick={onCancel}
          aria-label="Cancel"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'inline-flex' }}
        >
          <X size={20} />
        </button>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Edit — {seriesTitle}
        </span>
        <SponsorHeart />
      </header>

      <div className="ad-col" style={{ flex: 1, overflowY: 'auto', padding: 16, width: '100%' }}>
        {!form ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
            <Loader2 size={16} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} /> Loading…
          </div>
        ) : (
          <>
            <Field label="Monitoring">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ToggleRow label="Monitored" on={form.monitored} onToggle={() => setForm({ ...form, monitored: !form.monitored })} />
                <ToggleRow label="Use season folders" on={form.seasonFolder} onToggle={() => setForm({ ...form, seasonFolder: !form.seasonFolder })} />
              </div>
            </Field>

            <Field label="Monitor new seasons">
              <SelectChips
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'none', label: 'None' },
                ]}
                value={form.monitorNewItems}
                onChange={(v) => setForm({ ...form, monitorNewItems: v })}
              />
            </Field>

            <Field label="Quality profile">
              <SelectChips
                options={profiles.map((p) => ({ value: p.id, label: p.name }))}
                value={form.qualityProfileId}
                onChange={(v) => setForm({ ...form, qualityProfileId: v })}
              />
            </Field>

            <Field label="Series type">
              <SelectChips
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'anime', label: 'Anime' },
                ]}
                value={form.seriesType}
                onChange={(v) => setForm({ ...form, seriesType: v })}
              />
            </Field>

            <Field label="Root folder">
              {roots.length > 0 ? (
                <RootFolderList
                  roots={roots}
                  selected={form.rootPath}
                  onSelect={(path) => setForm({ ...form, rootPath: path })}
                />
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No root folders reported by Sonarr.</div>
              )}
              {form.rootPath === null && (
                <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 8 }}>
                  Current path{' '}
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>{form.origPath}</span>{' '}
                  doesn’t match a known root — pick one to move it, or leave as-is.
                </div>
              )}
            </Field>

            <Field label="Series folder name">
              <TextField
                value={form.folderName}
                onChange={(v) => setForm({ ...form, folderName: v })}
                invalid={pathInvalid}
                placeholder={form.rootPath ? 'Folder name' : 'Select a root folder first'}
              />
              {pathInvalid && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>Enter a folder name.</div>}
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
                Full path:{' '}
                <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--amber)' }}>
                  {effectivePath || '—'}
                </span>
              </div>
            </Field>

            <Field label="Tags">
              <TagPicker
                tags={tags}
                selected={form.tags}
                onToggle={(id) => {
                  const next = new Set(form.tags);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  setForm({ ...form, tags: next });
                }}
              />
            </Field>

            {error && (
              <div style={{ color: 'var(--red)', fontSize: 13, margin: '4px 0 12px' }}>{error}</div>
            )}

            {/* Danger zone */}
            <div style={{ marginTop: 6, marginBottom: 20 }}>
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  border: '1px solid color-mix(in srgb, var(--red) 45%, transparent)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--red)',
                  padding: '10px 14px',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={15} /> Delete series
              </button>
            </div>
          </>
        )}
      </div>

      {/* Sticky action bar */}
      {form && (
        <div style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid var(--divider)' }}>
          <Button variant="ghost" onClick={onCancel} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || pathInvalid} style={{ flex: 2 }}>
            {saving ? <Loader2 size={16} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} /> : <Save size={16} />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in srgb, var(--bg) 75%, transparent)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 18,
              maxWidth: 380,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <AlertTriangle size={18} color="var(--red)" />
              <span style={{ fontSize: 16, fontWeight: 500 }}>Delete “{seriesTitle}”?</span>
            </div>
            <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
              Remove the series from Sonarr. You can optionally also delete its downloaded files
              from disk (this cannot be undone).
            </p>
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                onClick={() => doDelete(true)}
                disabled={deleting}
                style={{ background: 'var(--red)', color: '#1a0808' }}
              >
                {deleting ? <Loader2 size={16} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} /> : <Trash2 size={16} />}
                Delete series AND files
              </Button>
              <Button variant="ghost" onClick={() => doDelete(false)} disabled={deleting}>
                Delete series only (keep files)
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
