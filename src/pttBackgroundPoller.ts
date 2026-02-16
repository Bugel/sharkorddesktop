/**
 * Windows-only: PTT when app is in background by polling GetAsyncKeyState.
 * No global hooks—just periodic state read. Less likely to trigger keylogger detection
 * than SetWindowsHookEx-based packages.
 */

const POLL_MS = 50;

/** Map pttBinding string (e.g. "KeyP", "Mouse4") to Windows virtual key code. Returns null if unsupported. */
export function pttBindingToVk(binding: string): number | null {
  if (!binding || typeof binding !== 'string') return null;
  const s = binding.trim();
  if (s.startsWith('Mouse')) {
    const n = parseInt(s.slice(5), 10);
    // Windows VK: LBUTTON=0x01, RBUTTON=0x02, MBUTTON=0x04, XBUTTON1=0x05, XBUTTON2=0x06
    // DOM button: 0=left, 1=middle, 2=right, 3=back (X1), 4=forward (X2)
    if (n === 0) return 0x01; // VK_LBUTTON
    if (n === 1) return 0x04; // VK_MBUTTON
    if (n === 2) return 0x02; // VK_RBUTTON
    if (n === 3) return 0x05; // VK_XBUTTON1 (back)
    if (n === 4) return 0x06; // VK_XBUTTON2 (forward)
    return null;
  }
  if (s.startsWith('Key')) {
    const key = s.slice(3);
    if (key.length === 1) {
      const upper = key.toUpperCase();
      if (upper >= 'A' && upper <= 'Z') return upper.charCodeAt(0); // 0x41-0x5A
      if (upper >= '0' && upper <= '9') return upper.charCodeAt(0); // 0x30-0x39
    }
    const special: Record<string, number> = {
      Space: 0x20,
      Enter: 0x0d,
      Tab: 0x09,
      Escape: 0x1b,
      Backspace: 0x08,
      ShiftLeft: 0xa0,
      ShiftRight: 0xa1,
      ControlLeft: 0xa2,
      ControlRight: 0xa3,
      AltLeft: 0xa4,
      AltRight: 0xa5,
      CapsLock: 0x14,
      ArrowLeft: 0x25,
      ArrowUp: 0x26,
      ArrowRight: 0x27,
      ArrowDown: 0x28,
      Home: 0x24,
      End: 0x23,
      PageUp: 0x21,
      PageDown: 0x22,
      Insert: 0x2d,
      Delete: 0x2e
    };
    if (key in special) return special[key];
    if (key.startsWith('Digit') && key.length === 6) return 0x30 + parseInt(key.slice(5), 10);
    if (key.startsWith('Numpad')) {
      const num = parseInt(key.slice(6), 10);
      if (num >= 0 && num <= 9) return 0x60 + num; // VK_NUMPAD0-9
    }
    if (key.startsWith('F') && key.length >= 2) {
      const n = parseInt(key.slice(1), 10);
      if (n >= 1 && n <= 12) return 0x70 + (n - 1);
    }
  }
  return null;
}

let loaded = false;
let getAsyncKeyState: (vk: number) => number = () => 0;

function ensureLoaded(): boolean {
  if (loaded) return true;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    // GetAsyncKeyState(int vKey) -> SHORT. High bit (0x8000) = key is currently down.
    getAsyncKeyState = user32.func('int __stdcall GetAsyncKeyState(int)');
    loaded = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Start polling the given VK. When key state changes, calls onState(pressed).
 * Returns a function to stop polling.
 */
export function startPttBackgroundPoll(vk: number, onState: (pressed: boolean) => void): () => void {
  if (!ensureLoaded()) return () => {};
  const DOWN = 0x8000;
  let lastPressed: boolean | null = null;
  const id = setInterval(() => {
    try {
      const state = getAsyncKeyState(vk);
      const pressed = (state & DOWN) !== 0;
      if (lastPressed !== pressed) {
        lastPressed = pressed;
        onState(pressed);
      }
    } catch {
      /* ignore */
    }
  }, POLL_MS);
  return () => {
    clearInterval(id);
  };
}
