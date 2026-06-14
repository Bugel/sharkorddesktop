import path from 'node:path';

type AudioSession = { pid: number; name: string; exePath: string };

interface NativeAddon {
  listAudioSessions: () => AudioSession[];
  ProcessCapture: new (
    opts: { pid: number; sampleRate: number; channels: number },
    onData: (buf: Float32Array) => void
  ) => { start(): void; stop(): void };
}

let addon: NativeAddon | null = null;
let activeCapture: { stop(): void } | null = null;

function loadAddon(): boolean {
  if (addon) return true;
  if (process.platform !== 'win32') return false;
  try {
    addon = require(
      path.join(__dirname, '..', 'native', 'build', 'Release', 'process_audio_capture.node')
    );
    return true;
  } catch {
    return false;
  }
}

export function isAvailable(): boolean {
  return process.platform === 'win32' && loadAddon();
}

export function listAudioSessions(): AudioSession[] {
  if (!loadAddon() || !addon) return [];
  try {
    return addon.listAudioSessions();
  } catch {
    return [];
  }
}

export function startCapture(
  pid: number,
  onData: (buf: Float32Array) => void
): void {
  if (!loadAddon() || !addon) throw new Error('Native addon not available');
  stopCapture();
  const capture = new addon.ProcessCapture(
    { pid, sampleRate: 48000, channels: 2 },
    onData
  );
  capture.start();
  activeCapture = capture;
}

export function stopCapture(): void {
  if (activeCapture) {
    try { activeCapture.stop(); } catch { /* ignore */ }
    activeCapture = null;
  }
}
