import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { VoiceIntakeFields } from '../types';
import type { AudioClip } from './VoiceRecorder';

interface Props {
  onFilled: (fields: VoiceIntakeFields, clip: AudioClip) => void;
}

type Phase = 'idle' | 'recording' | 'processing' | 'done' | 'error';

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

function extFor(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

export default function VoiceAutoFill({ onFilled }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    setTranscript(null);
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
        const seconds = secondsRef.current;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void process(blob, actualMime, seconds);
      };
      recorderRef.current = recorder;
      recorder.start();
      secondsRef.current = 0;
      setElapsed(0);
      setPhase('recording');
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setElapsed(secondsRef.current);
      }, 1000);
    } catch {
      setError('Microphone access was denied.');
      setPhase('error');
    }
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
  }

  async function process(blob: Blob, mime: string, seconds: number) {
    setPhase('processing');
    try {
      const ext = extFor(mime);
      const res = await api.voiceIntake(blob, `memo.${ext}`);
      const clip: AudioClip = {
        id: crypto.randomUUID(),
        blob,
        url: URL.createObjectURL(blob),
        mime,
        seconds,
      };
      setTranscript(res.transcript);
      setPhase('done');
      onFilled(res.fields, clip);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process the recording.');
      setPhase('error');
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xl">✨</span>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-brand-800">One-tap voice logging</h2>
          <p className="text-xs text-brand-700/70">
            Record a memo and let AI fill in the whole form for you.
          </p>
        </div>
      </div>

      <div className="mt-3">
        {phase === 'recording' ? (
          <button
            type="button"
            onClick={stop}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 text-base font-bold text-white active:scale-[0.99]"
          >
            <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
            Stop &amp; auto-fill - {fmt(elapsed)}
          </button>
        ) : phase === 'processing' ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-100 py-3.5 text-base font-semibold text-brand-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
            Transcribing &amp; extracting...
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-bold text-white active:scale-[0.99]"
          >
            🎙️ {phase === 'done' ? 'Record again' : 'Record voice memo'}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {phase === 'done' && transcript && (
        <div className="mt-3 rounded-xl bg-green-50 p-3 text-xs text-green-800">
          <p className="font-semibold">Form auto-filled ✓ Review the fields below before submitting.</p>
          <p className="mt-1 line-clamp-3 text-green-700/80">"{transcript}"</p>
        </div>
      )}
    </div>
  );
}
