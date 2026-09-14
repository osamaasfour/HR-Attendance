/**
 * Open printable HTML in a new tab, or show an on-page print preview
 * when popups are blocked (Cursor Simple Browser / Safari blockers).
 * Avoids `noopener` (Chromium returns null → print appears to do nothing).
 */

function extractPreviewParts(html: string): { css: string; body: string } {
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const css = styleMatch?.[1] || '';
  const body = (bodyMatch?.[1] || html).replace(/<script[\s\S]*?<\/script>/gi, '');
  return { css, body };
}

function printViaHiddenIframe(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute(
    'style',
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;',
  );
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    try {
      frame.remove();
    } catch {
      /* ignore */
    }
  };
  window.setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(cleanup, 1000);
    }
  }, 250);
}

export function openPrintHtml(html: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let popup: Window | null = null;
  try {
    // Do NOT use noopener — Chromium returns null and print does nothing.
    popup = window.open('', '_blank', 'width=900,height=1100');
  } catch {
    popup = null;
  }

  if (popup) {
    try {
      popup.opener = null;
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      return;
    } catch {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
    }
  }

  // Popup blocked → on-page preview rendered as a DIV (iframes often paint blank
  // in embedded browsers even when contentDocument has text).
  const existing = document.getElementById('hr-print-preview-root');
  if (existing) existing.remove();

  const { css, body } = extractPreviewParts(html);

  const root = document.createElement('div');
  root.id = 'hr-print-preview-root';
  root.setAttribute(
    'style',
    [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'background:rgba(15,23,42,0.55)',
      'display:flex',
      'flex-direction:column',
      'padding:16px',
      'box-sizing:border-box',
    ].join(';'),
  );

  const toolbar = document.createElement('div');
  toolbar.setAttribute(
    'style',
    [
      'display:flex',
      'gap:8px',
      'justify-content:flex-end',
      'margin-bottom:10px',
      'flex-shrink:0',
    ].join(';'),
  );

  const mkBtn = (label: string, primary?: boolean) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute(
      'style',
      [
        'border:0',
        'border-radius:8px',
        'padding:10px 16px',
        'font:600 14px/1.2 system-ui,Segoe UI,sans-serif',
        'cursor:pointer',
        primary ? 'background:#0D9488;color:#fff' : 'background:#fff;color:#0F172A',
      ].join(';'),
    );
    return btn;
  };

  const printBtn = mkBtn('Print', true);
  const closeBtn = mkBtn('Close');

  const panel = document.createElement('div');
  panel.setAttribute(
    'style',
    [
      'flex:1 1 auto',
      'min-height:0',
      'overflow:auto',
      'background:#fff',
      'border-radius:12px',
      'box-shadow:0 10px 40px rgba(0,0,0,0.25)',
      'padding:20px',
      'color:#134E4A',
    ].join(';'),
  );

  const styleEl = document.createElement('style');
  styleEl.textContent = `${css}
    #hr-print-preview-root .no-print { display: none !important; }
  `;
  const content = document.createElement('div');
  content.innerHTML = body;

  panel.appendChild(styleEl);
  panel.appendChild(content);

  const cleanup = () => {
    try {
      root.remove();
    } catch {
      /* ignore */
    }
  };

  printBtn.onclick = () => printViaHiddenIframe(html);
  closeBtn.onclick = cleanup;

  toolbar.appendChild(closeBtn);
  toolbar.appendChild(printBtn);
  root.appendChild(toolbar);
  root.appendChild(panel);
  document.body.appendChild(root);
}
