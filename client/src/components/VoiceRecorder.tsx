import { useEffect, useRef, useState } from 'react';

export interface AudioClip {
  id: string;
  blob: Blob;
  url: string;
  mime: string;
  seconds: number;
}

interface Props {
  clips: AudioClip[];
  onChange: (clips: AudioClip[]) => void;
}

function pickMime(): string {
  const candidates = ['audio/webm', 'audio/ogg', 'audio/mp4'];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceRecorder({ clips, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const actualMime = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        const clip: AudioClip = {
          id: crypto.randomUUID(),
          blob,
          url: URL.createObjectURL(blob),
          mime: actualMime,
          seconds: elapsed,
        };
        onChange([...clips, clip]);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : 'Could not access microphone.'
      );
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function remove(id: string) {
    const target = clips.find((c) => c.id === id);
    if (target) URL.revokeObjectURL(target.url);
    onChange(clips.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-3">
      {!recording ? (
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-200 bg-brand-50 py-4 text-base font-semibold text-brand-700 active:scale-[0.99] transition"
        >
          <span className="text-xl">🎙️</span> Record voice memo
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 py-4 text-base font-semibold text-white active:scale-[0.99] transition"
        >
          <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
          Stop - {fmt(elapsed)}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {clips.length > 0 && (
        <ul className="space-y-2">
          {clips.map((clip: AudioClip, i: number) => (
            <li
              key={clip.id}
              className="flex items-center gap-3 rounded-xl bg-gray-50 p-3"
            >
              <span className="text-lg">🎵</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700">
                  Memo {i + 1} - {fmt(clip.seconds)}
                </p>
                <audio src={clip.url} controls className="mt-1 h-8 w-full" />
              </div>
              <button
                type="button"
                onClick={() => remove(clip.id)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                aria-label="Delete memo"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
