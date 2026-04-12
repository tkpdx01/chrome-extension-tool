type OverlayElements = {
  box: HTMLDivElement;
  label: HTMLDivElement;
};

let overlay: OverlayElements | undefined;

function ensureOverlay(): OverlayElements {
  if (overlay) {
    return overlay;
  }

  const box = document.createElement('div');
  box.style.position = 'fixed';
  box.style.zIndex = '2147483647';
  box.style.pointerEvents = 'none';
  box.style.border = '2px solid #2563eb';
  box.style.background = 'rgba(37, 99, 235, 0.12)';
  box.style.borderRadius = '6px';
  box.style.display = 'none';

  const label = document.createElement('div');
  label.style.position = 'fixed';
  label.style.zIndex = '2147483647';
  label.style.pointerEvents = 'none';
  label.style.padding = '4px 8px';
  label.style.fontSize = '12px';
  label.style.fontFamily = 'system-ui, sans-serif';
  label.style.color = '#fff';
  label.style.background = '#111827';
  label.style.borderRadius = '999px';
  label.style.display = 'none';

  document.documentElement.append(box, label);
  overlay = { box, label };
  return overlay;
}

export function showOverlay(target: Element, modeLabel: string): void {
  const instance = ensureOverlay();
  const rect = target.getBoundingClientRect();

  instance.box.style.display = 'block';
  instance.box.style.top = `${rect.top}px`;
  instance.box.style.left = `${rect.left}px`;
  instance.box.style.width = `${rect.width}px`;
  instance.box.style.height = `${rect.height}px`;

  instance.label.style.display = 'block';
  instance.label.textContent = modeLabel;
  instance.label.style.top = `${Math.max(rect.top - 28, 8)}px`;
  instance.label.style.left = `${Math.max(rect.left, 8)}px`;
}

export function hideOverlay(): void {
  if (!overlay) {
    return;
  }

  overlay.box.style.display = 'none';
  overlay.label.style.display = 'none';
}
