/**
 * Document Picture-in-Picture gives a genuinely always-on-top window, which a
 * normal popup does not. It is Chromium-only, so callers fall back to
 * window.open where it is missing.
 *
 * Note on transparency: a browser cannot make its window background
 * transparent - there is no web API for OS-level window compositing. The
 * closest available is a flat, borderless-looking surface.
 */

interface PipOptions {
  width?: number;
  height?: number;
}

/** Narrow shape of the API, which TypeScript's lib does not yet declare. */
interface DocumentPipApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

function pipApi(): DocumentPipApi | null {
  const candidate = (window as unknown as { documentPictureInPicture?: DocumentPipApi })
    .documentPictureInPicture;
  return candidate && typeof candidate.requestWindow === 'function' ? candidate : null;
}

export function pipSupported(): boolean {
  return pipApi() !== null;
}

/** Copies the page's styles into the new document, which starts empty. */
function copyStyles(target: Window): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const text = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      const style = target.document.createElement('style');
      style.textContent = text;
      target.document.head.appendChild(style);
    } catch {
      // A cross-origin sheet cannot be read; link it instead.
      if (sheet.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }
}

/**
 * Opens the always-on-top window and returns the element to render into,
 * or null when the API is unavailable or the user dismissed it.
 */
export async function openPipContainer(options: PipOptions = {}): Promise<{
  window: Window;
  container: HTMLElement;
} | null> {
  const api = pipApi();
  if (!api) return null;

  try {
    const pip = await api.requestWindow({
      width: options.width ?? 240,
      height: options.height ?? 250,
    });

    copyStyles(pip);
    // Carry the current palette across, or the widget renders in light mode
    // inside a dark dashboard.
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) pip.document.documentElement.setAttribute('data-theme', theme);

    pip.document.body.classList.add('pip-body');

    const container = pip.document.createElement('div');
    pip.document.body.appendChild(container);
    return { window: pip, container };
  } catch {
    // Requires a user gesture and can be refused; falling back is the caller's job.
    return null;
  }
}
