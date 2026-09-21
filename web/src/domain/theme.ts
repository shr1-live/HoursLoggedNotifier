export type Theme = 'light' | 'dark' | 'system';

const KEY = 'hln.theme';

/** The stored choice, defaulting to following the operating system. */
export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not fatal - the theme still applies for this session.
  }
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  );
}

/** Which palette a choice resolves to right now. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

/**
 * Stamps the resolved palette on the root element. The stylesheet defines the
 * light palette on :root and overrides it under [data-theme="dark"], so a
 * missing attribute still renders correctly.
 */
export function applyTheme(theme: Theme): 'light' | 'dark' {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  }
  return resolved;
}

/** Calls back when the OS preference changes, for the "system" setting. */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
