/**
 * Windows-only: PTT via GetAsyncKeyState polling (foreground and background).
 * Reads key state without intercepting input, so PTT keys still type normally in chat.
 */

const POLL_MS = 50;

const SPECIAL_VK: Record<string, number> = {
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
  MetaLeft: 0x5b,
  MetaRight: 0x5c,
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
  Delete: 0x2e,
  Semicolon: 0xba,
  Equal: 0xbb,
  Comma: 0xbc,
  Minus: 0xbd,
  Period: 0xbe,
  Slash: 0xbf,
  Backquote: 0xc0,
  BracketLeft: 0xdb,
  Backslash: 0xdc,
  BracketRight: 0xdd,
  Quote: 0xde
};

/** Map pttBinding (DOM e.code or MouseN) to Windows virtual key code. Returns null if unsupported. */
export function pttBindingToVk(binding: string): number | null {
  if (!binding || typeof binding !== 'string') return null;
  const s = binding.trim();

  if (s.startsWith('Mouse')) {
    const n = parseInt(s.slice(5), 10);
    // Windows VK: LBUTTON=0x01, RBUTTON=0x02, MBUTTON=0x04, XBUTTON1=0x05, XBUTTON2=0x06
    // DOM button: 0=left, 1=middle, 2=right, 3=back (X1), 4=forward (X2)
    if (n === 0) return 0x01;
    if (n === 1) return 0x04;
    if (n === 2) return 0x02;
    if (n === 3) return 0x05;
    if (n === 4) return 0x06;
    return null;
  }

  const fnMatch = /^F([1-9]|1[0-9]|2[0-4])$/.exec(s);
  if (fnMatch) {
    const n = parseInt(fnMatch[1], 10);
    return 0x70 + (n - 1);
  }

  if (s in SPECIAL_VK) return SPECIAL_VK[s];

  if (s.startsWith('Digit') && s.length === 6) {
    const d = parseInt(s.slice(5), 10);
    if (d >= 0 && d <= 9) return 0x30 + d;
  }

  if (s.startsWith('Numpad')) {
    const tail = s.slice(6);
    if (tail === 'Add') return 0x6b;
    if (tail === 'Subtract') return 0x6d;
    if (tail === 'Multiply') return 0x6a;
    if (tail === 'Divide') return 0x6f;
    if (tail === 'Enter') return 0x0d;
    if (tail === 'Decimal') return 0x6e;
    const num = parseInt(tail, 10);
    if (num >= 0 && num <= 9) return 0x60 + num;
  }

  if (s.startsWith('Key')) {
    const key = s.slice(3);
    if (key.length === 1) {
      const upper = key.toUpperCase();
      if (upper >= 'A' && upper <= 'Z') return upper.charCodeAt(0);
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
