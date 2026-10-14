"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The best container the browser can record speech in (Chrome/Firefox: WebM/Opus; Safari: MP4/AAC). */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/**
 * Record a voice note with the microphone. `stop()` resolves with the recording as a File (type without
 * codec parameters, as the server checks it) and its length; `cancel()` throws it away.
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    setRecording(false);
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    setError(null);
    const mimeType = pickMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.start(250);
      recorder.current = rec;
      started.current = Date.now();
      setElapsed(0);
      timer.current = setInterval(() => setElapsed(Date.now() - started.current), 250);
      setRecording(true);
    } catch {
      setError("Allow microphone access to record a voice note.");
    }
  }, []);

  const stop = useCallback(
    () =>
      new Promise<{ file: File; durationMs: number } | null>((resolve) => {
        const rec = recorder.current;
        if (!rec) return resolve(null);
        const durationMs = Date.now() - started.current;
        rec.onstop = () => {
          const type = rec.mimeType.split(";")[0] || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const file = new File(chunks.current, `voice-note.${ext}`, { type });
          release();
          resolve(durationMs < 500 || file.size === 0 ? null : { file, durationMs });
        };
        rec.stop();
      }),
    [release],
  );

  const cancel = useCallback(() => {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    chunks.current = [];
    release();
  }, [release]);

  return { recording, elapsed, error, start, stop, cancel };
}

export function formatDuration(ms: number | null | undefined) {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
