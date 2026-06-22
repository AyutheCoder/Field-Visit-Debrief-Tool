import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { CreateVisitInput, VisitWithRelations, VoiceIntakeFields } from '../types';
import { enqueueVisit, type QueuedMedia } from '../lib/offline';
import { useToast } from './ui/Toast';
import VoiceRecorder, { type AudioClip } from './VoiceRecorder';
import VoiceAutoFill from './VoiceAutoFill';
import PhotoUploader, { type PhotoItem } from './PhotoUploader';

const PROGRAM_AREAS = [
  'Healthcare',
  'Education',
  'Water & Sanitation',
  'Nutrition',
  'Livelihoods',
  'Protection',
  'Agriculture',
];

const VISIT_TYPES = [
  'Clinic assessment',
  'School assessment',
  'Routine monitoring',
  'Follow-up',
  'Community meeting',
  'Distribution',
  'Other',
];

const DRAFT_KEY = 'fvd:capture-draft:v1';

interface StakeholderRow {
  id: string;
  name: string;
  role: string;
  organization: string;
}

interface DraftState {
  locationName: string;
  lat: string;
  lng: string;
  visitDate: string;
  programArea: string;
  visitType: string;
  notes: string;
  stakeholders: StakeholderRow[];
}

function nowLocalInput(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function emptyStakeholder(): StakeholderRow {
  return { id: crypto.randomUUID(), name: '', role: '', organization: '' };
}

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

const labelClass = 'mb-1.5 block text-sm font-semibold text-gray-700';

interface Props {
  onCreated?: (visit: VisitWithRelations) => void;
}

export default function CaptureScreen({ onCreated }: Props) {
  const toast = useToast();
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [visitDate, setVisitDate] = useState(nowLocalInput());
  const [programArea, setProgramArea] = useState('');
  const [visitType, setVisitType] = useState('');
  const [notes, setNotes] = useState('');
  const [stakeholders, setStakeholders] = useState<StakeholderRow[]>([emptyStakeholder()]);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [clips, setClips] = useState<AudioClip[]>([]);

  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<VisitWithRelations | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);

  const restored = useRef(false);

  // Restore draft once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as DraftState;
        setLocationName(d.locationName ?? '');
        setLat(d.lat ?? '');
        setLng(d.lng ?? '');
        setVisitDate(d.visitDate || nowLocalInput());
        setProgramArea(d.programArea ?? '');
        setVisitType(d.visitType ?? '');
        setNotes(d.notes ?? '');
        if (Array.isArray(d.stakeholders) && d.stakeholders.length) {
          setStakeholders(d.stakeholders);
        }
      }
    } catch {
      /* ignore corrupt draft */
    }
    restored.current = true;
  }, []);

  // Autosave draft (structured fields only - not files)
  useEffect(() => {
    if (!restored.current) return;
    const draft: DraftState = {
      locationName,
      lat,
      lng,
      visitDate,
      programArea,
      visitType,
      notes,
      stakeholders,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [locationName, lat, lng, visitDate, programArea, visitType, notes, stakeholders]);

  function applyVoiceFields(fields: VoiceIntakeFields, clip: AudioClip) {
    if (fields.locationName) setLocationName(fields.locationName);
    if (fields.programArea) setProgramArea(fields.programArea);
    if (fields.visitType) setVisitType(fields.visitType);
    if (fields.notes) {
      setNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${fields.notes}` : fields.notes));
    }
    
    if (fields.stakeholders?.length) {
      const rows: StakeholderRow[] = fields.stakeholders.map((s: any) => ({
        id: crypto.randomUUID(),
        name: s.name,
        role: s.role,
        organization: s.organization,
      }));
      // Replace the empty default row; otherwise append.
      setStakeholders((prev) => {
        const existing = prev.filter((r) => r.name.trim() !== '');
        return existing.length ? [...existing, ...rows] : rows;
      });
    }
    
    // Keep the recorded memo so it's uploaded and transcribed with the visit.
    setClips((prev) => [...prev, clip]);
  }

  function useGps() {
    if (!('geolocation' in navigator)) {
      setGpsStatus('error');
      return;
    }
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        setLat(la.toFixed(5));
        setLng(lo.toFixed(5));
        if (!locationName.trim()) {
          setLocationName(`Location @ ${la.toFixed(3)}, ${lo.toFixed(3)}`);
        }
        setGpsStatus('idle');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function updateStakeholder(id: string, patch: Partial<StakeholderRow>) {
    setStakeholders((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addStakeholder() {
    setStakeholders((rows) => [...rows, emptyStakeholder()]);
  }

  function removeStakeholder(id: string) {
    setStakeholders((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));
  }

  function resetForm() {
    setLocationName('');
    setLat('');
    setLng('');
    setVisitDate(nowLocalInput());
    setProgramArea('');
    setVisitType('');
    setNotes('');
    setStakeholders([emptyStakeholder()]);
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    clips.forEach((c) => URL.revokeObjectURL(c.url));
    setPhotos([]);
    setClips([]);
    localStorage.removeItem(DRAFT_KEY);
  }

  const canSubmit = locationName.trim() !== '' && programArea !== '' && !submitting;

  function buildMedia(): QueuedMedia[] {
    const media: QueuedMedia[] = photos.map((p) => ({
      blob: p.file,
      filename: p.file.name || 'photo.jpg',
    }));
    clips.forEach((c, i) => {
      const ext = c.mime.includes('ogg') ? 'ogg' : c.mime.includes('mp4') ? 'm4a' : 'webm';
      media.push({ blob: c.blob, filename: `memo-${i + 1}.${ext}` });
    });
    return media;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const input: CreateVisitInput = {
      locationName: locationName.trim(),
      programArea,
      visitDate: new Date(visitDate).toISOString(),
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      visitType: visitType || undefined,
      rawNotesText: notes.trim() || undefined,
      stakeholders: stakeholders
        .filter((s) => s.name.trim() !== '')
        .map((s) => ({
          name: s.name.trim(),
          role: s.role.trim() || undefined,
          organization: s.organization.trim() || undefined,
        })),
    };

    // Offline (or no connection): queue the visit + media for later sync.
    if (!navigator.onLine) {
      await queueOffline(input);
      return;
    }

    setProgress('Creating visit...');
    try {
      const visit = await api.createVisit(input);

      // Upload media after the visit exists
      const total = photos.length + clips.length;
      let done = 0;
      for (const p of photos) {
        setProgress(`Uploading media ${++done}/${total}...`);
        await api.uploadMedia(visit.id, p.file, p.file.name || 'photo.jpg');
      }
      for (let i = 0; i < clips.length; i++) {
        setProgress(`Uploading media ${++done}/${total}...`);
        const ext = clips[i].mime.includes('ogg') ? 'ogg' : clips[i].mime.includes('mp4') ? 'm4a' : 'webm';
        await api.uploadMedia(visit.id, clips[i].blob, `memo-${i + 1}.${ext}`);
      }

      resetForm();
      toast.success('Visit logged');
      if (onCreated) {
        onCreated(visit);
      } else {
        setCreated(visit);
      }
    } catch (err) {
      // Network failure mid-request - fall back to the offline queue.
      if (err instanceof TypeError || !navigator.onLine) {
        await queueOffline(input);
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
      setProgress('');
    }
  }

  async function queueOffline(input: CreateVisitInput) {
    try {
      await enqueueVisit({ input, media: buildMedia() });
      resetForm();
      setOfflineSaved(true);
      toast.info('Saved offline - will sync when you reconnect');
    } catch {
      setError('Could not save offline. Please try again.');
    } finally {
      setSubmitting(false);
      setProgress('');
    }
  }

  if (offlineSaved) {
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
            ☁️
          </div>
          <h2 className="text-xl font-bold text-gray-900">Saved offline</h2>
          <p className="mt-1 text-sm text-gray-500">
            This visit is queued on your device and will sync automatically when you reconnect.
          </p>
          <button
            onClick={() => setOfflineSaved(false)}
            className="mt-6 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white active:scale-[0.99]"
          >
            Log another visit
          </button>
        </div>
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✅
          </div>
          <h2 className="text-xl font-bold text-gray-900">Visit logged</h2>
          <p className="mt-1 text-sm text-gray-500">{created.locationName}</p>
          <p className="mt-1 text-xs text-gray-400">
            {created.stakeholders.length} stakeholder(s) · {created.media.length} media file(s)
          </p>
          <button
            onClick={() => setCreated(null)}
            className="mt-6 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white active:scale-[0.99]"
          >
            Log another visit
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md p-4 pb-28">
      <VoiceAutoFill onFilled={applyVoiceFields} />

      {/* Location */}
      <Section title="Location" required>
        <div className="flex gap-2">
          <input
            className={inputClass}
            placeholder="Village / ward / facility name"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
          />
          <button
            type="button"
            onClick={useGps}
            className="shrink-0 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white active:scale-95"
          >
            {gpsStatus === 'loading' ? '...' : '📍 GPS'}
          </button>
        </div>
        {(lat || lng) && (
          <p className="mt-2 text-xs text-gray-500">
            Coordinates: {lat || '-'}, {lng || '-'}
          </p>
        )}
        {gpsStatus === 'error' && (
          <p className="mt-2 text-xs text-red-600">Could not get GPS location. Enter manually.</p>
        )}
      </Section>

      {/* Date & program */}
      <Section title="Visit details">
        <label className={labelClass}>Date &amp; time</label>
        <input
          type="datetime-local"
          className={inputClass}
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
        />

        <label className={`${labelClass} mt-4`}>
          Program area <span className="text-red-500">*</span>
        </label>
        <select
          className={inputClass}
          value={programArea}
          onChange={(e) => setProgramArea(e.target.value)}
        >
          <option value="">Select a program area...</option>
          {PROGRAM_AREAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <label className={`${labelClass} mt-4`}>Visit type</label>
        <select
          className={inputClass}
          value={visitType}
          onChange={(e) => setVisitType(e.target.value)}
        >
          <option value="">Select a type...</option>
          {VISIT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Section>

      {/* Stakeholders */}
      <Section title="Stakeholders met">
        <div className="space-y-3">
          {stakeholders.map((s, i) => (
            <div key={s.id} className="rounded-xl bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Person {i + 1}
                </span>
                {stakeholders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStakeholder(s.id)}
                    className="text-xs font-medium text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                className={`${inputClass} mb-2`}
                placeholder="Name"
                value={s.name}
                onChange={(e) => updateStakeholder(s.id, { name: e.target.value })}
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className={inputClass}
                  placeholder="Role"
                  value={s.role}
                  onChange={(e) => updateStakeholder(s.id, { role: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="Organization"
                  value={s.organization}
                  onChange={(e) => updateStakeholder(s.id, { organization: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStakeholder}
          className="mt-3 w-full rounded-xl border border-brand-200 bg-brand-50 py-3 text-sm font-semibold text-brand-700 active:scale-[0.99]"
        >
          + Add another person
        </button>
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <textarea
          className={`${inputClass} min-h-[120px] resize-y`}
          placeholder="What did you observe? Key findings, blockers, sentiment..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Section>

      {/* Photos */}
      <Section title="Photos">
        <PhotoUploader photos={photos} onChange={setPhotos} />
      </Section>

      {/* Voice */}
      <Section title="Voice memos">
        <VoiceRecorder clips={clips} onChange={setClips} />
      </Section>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-brand-600 py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {submitting ? progress || 'Saving...' : 'Submit visit'}
          </button>
          {!canSubmit && !submitting && (
            <p className="mt-2 text-center text-xs text-gray-400">
              Location and program area are required
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <h2 className="mb-3 text-base font-bold text-gray-900">
        {title} {required && <span className="text-red-500">*</span>}
      </h2>
      {children}
    </section>
  );
}
