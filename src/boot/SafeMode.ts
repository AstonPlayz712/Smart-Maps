const SAFE_MODE_KEY = 'smartmaps.safe-mode';
const CRASH_COUNT_KEY = 'smartmaps.boot-crash-count';
/** Two back-to-back boot crashes flip Safe Mode on automatically. */
const CRASH_THRESHOLD = 2;

function safeRead(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function safeRemove(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function isSafeMode(): boolean {
  return safeRead(SAFE_MODE_KEY) === '1';
}

export function enterSafeMode(): void {
  safeWrite(SAFE_MODE_KEY, '1');
}

export function exitSafeMode(): void {
  safeRemove(SAFE_MODE_KEY);
  clearCrashCount();
}

export function recordBootCrash(): number {
  const cur = Number(safeRead(CRASH_COUNT_KEY) ?? '0');
  const next = Number.isFinite(cur) ? cur + 1 : 1;
  safeWrite(CRASH_COUNT_KEY, String(next));
  if (next >= CRASH_THRESHOLD) enterSafeMode();
  return next;
}

export function clearCrashCount(): void {
  safeRemove(CRASH_COUNT_KEY);
}
