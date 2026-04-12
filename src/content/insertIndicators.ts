import type { InsertPosition } from '@/shared/types';

type IndicatorConfig = {
  position: InsertPosition;
  label: string;
  icon: string;
};

const INDICATORS: IndicatorConfig[] = [
  { position: 'before', label: '前面', icon: '↑' },
  { position: 'after', label: '后面', icon: '↓' },
  { position: 'inside-start', label: '内部开头', icon: '⤵' },
  { position: 'inside-end', label: '内部末尾', icon: '⤴' },
];

const BUTTON_STYLE = `
  position: absolute;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 12px;
  font-family: system-ui, sans-serif;
  color: #fff;
  background: #2563eb;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  transition: background 0.15s;
  pointer-events: auto;
`;

const HIGHLIGHT_STYLE = `
  position: absolute;
  z-index: 2147483645;
  border: 2px dashed #2563eb;
  background: rgba(37, 99, 235, 0.06);
  border-radius: 4px;
  pointer-events: none;
`;

const CANCEL_BUTTON_STYLE = `
  position: absolute;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 12px;
  font-family: system-ui, sans-serif;
  color: #b91c1c;
  background: #fff;
  border: 1px solid #fecaca;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: background 0.15s;
  pointer-events: auto;
`;

let container: HTMLDivElement | undefined;
let targetElement: Element | undefined;
let currentHighlight: HTMLDivElement | undefined;
let onSelect: ((position: InsertPosition) => void) | undefined;
let onCancel: (() => void) | undefined;
let scrollListener: (() => void) | undefined;

function createContainer(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = 'position: absolute; top: 0; left: 0; z-index: 2147483646; pointer-events: none;';
  document.documentElement.append(el);
  return el;
}

function positionButtons(): void {
  if (!container || !targetElement) {
    return;
  }

  const rect = targetElement.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Position highlight
  if (currentHighlight) {
    currentHighlight.style.top = `${rect.top + scrollY - 2}px`;
    currentHighlight.style.left = `${rect.left + scrollX - 2}px`;
    currentHighlight.style.width = `${rect.width + 4}px`;
    currentHighlight.style.height = `${rect.height + 4}px`;
  }

  const buttons = container.querySelectorAll<HTMLButtonElement>('[data-insert-pos]');
  buttons.forEach((btn) => {
    const pos = btn.dataset.insertPos as InsertPosition;
    switch (pos) {
      case 'before':
        btn.style.top = `${rect.top + scrollY - 28}px`;
        btn.style.left = `${rect.left + scrollX + rect.width / 2}px`;
        btn.style.transform = 'translateX(-50%)';
        break;
      case 'after':
        btn.style.top = `${rect.bottom + scrollY + 6}px`;
        btn.style.left = `${rect.left + scrollX + rect.width / 2}px`;
        btn.style.transform = 'translateX(-50%)';
        break;
      case 'inside-start':
        btn.style.top = `${rect.top + scrollY + 6}px`;
        btn.style.left = `${rect.left + scrollX + 6}px`;
        btn.style.transform = '';
        break;
      case 'inside-end':
        btn.style.top = `${rect.bottom + scrollY - 28}px`;
        btn.style.left = `${rect.right + scrollX - 6}px`;
        btn.style.transform = 'translateX(-100%)';
        break;
    }
  });

  // Position cancel button: top-right corner of the element
  const cancelBtn = container.querySelector<HTMLButtonElement>('[data-cancel]');
  if (cancelBtn) {
    cancelBtn.style.top = `${rect.top + scrollY - 28}px`;
    cancelBtn.style.left = `${rect.right + scrollX - 6}px`;
    cancelBtn.style.transform = 'translateX(-100%)';
  }
}

export function showInsertIndicators(
  selector: string,
  currentPosition: InsertPosition | undefined,
  callback: (position: InsertPosition) => void,
  cancelCallback?: () => void,
): void {
  hideInsertIndicators();

  const el = document.querySelector(selector);
  if (!el) {
    return;
  }

  targetElement = el;
  onSelect = callback;
  onCancel = cancelCallback;
  container = createContainer();

  // Highlight the anchor element
  currentHighlight = document.createElement('div');
  currentHighlight.style.cssText = HIGHLIGHT_STYLE;
  container.append(currentHighlight);

  // Create position buttons
  for (const indicator of INDICATORS) {
    const btn = document.createElement('button');
    btn.dataset.insertPos = indicator.position;
    btn.style.cssText = BUTTON_STYLE;
    btn.innerHTML = `<span>${indicator.icon}</span><span>${indicator.label}</span>`;

    if (indicator.position === currentPosition) {
      btn.style.background = '#1d4ed8';
      btn.style.boxShadow = '0 0 0 2px #fff, 0 0 0 4px #2563eb, 0 2px 8px rgba(0,0,0,0.18)';
    }

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#1d4ed8';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = indicator.position === currentPosition ? '#1d4ed8' : '#2563eb';
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(indicator.position);
    });

    container.append(btn);
  }

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.dataset.cancel = '1';
  cancelBtn.style.cssText = CANCEL_BUTTON_STYLE;
  cancelBtn.textContent = '× 取消锚点';
  cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#fef2f2'; });
  cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#fff'; });
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel?.();
    hideInsertIndicators();
  });
  container.append(cancelBtn);

  positionButtons();

  scrollListener = () => positionButtons();
  window.addEventListener('scroll', scrollListener, true);
  window.addEventListener('resize', scrollListener);
}

export function hideInsertIndicators(): void {
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener, true);
    window.removeEventListener('resize', scrollListener);
    scrollListener = undefined;
  }

  container?.remove();
  container = undefined;
  targetElement = undefined;
  currentHighlight = undefined;
  onSelect = undefined;
  onCancel = undefined;
}
