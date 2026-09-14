/**
 * Pick a single file on web (native <input type="file">).
 * Avoids expo-document-picker which can hang in embedded browsers.
 */

export type PickedLocalFile = {
  uri: string;
  name: string;
  mimeType: string | null;
  size?: number;
  /** Original File — use for upload without fetch(blob:). */
  file?: File;
};

export function pickLocalFileWeb(opts: {
  accept: string;
}): Promise<PickedLocalFile | null> {
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.width = '0';
    input.style.height = '0';
    input.style.opacity = '0';

    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (value: PickedLocalFile | null) => {
      if (settled) return;
      settled = true;
      if (cancelTimer) clearTimeout(cancelTimer);
      window.removeEventListener('focus', onWindowFocus);
      clearTimeout(safetyTimer);
      try {
        input.remove();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    const onWindowFocus = () => {
      // Dialog closed without `change` yet — wait so `change` can fire first (Windows/Chrome).
      if (cancelTimer) clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finish(null);
        }
      }, 1500);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      finish({
        uri: URL.createObjectURL(file),
        name: file.name || 'document',
        mimeType: file.type || null,
        size: file.size,
        file,
      });
    });

    input.addEventListener('cancel', () => {
      finish(null);
    });

    const safetyTimer = setTimeout(() => finish(null), 180_000);

    document.body.appendChild(input);
    window.addEventListener('focus', onWindowFocus);
    input.click();
  });
}
