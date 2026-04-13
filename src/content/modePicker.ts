let container: HTMLDivElement | undefined;
let dismissHandler: ((e: MouseEvent) => void) | undefined;

const PANEL_STYLE = `
  position: fixed;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  font-family: system-ui, sans-serif;
  pointer-events: auto;
`;

function createModeButton(
  text: string,
  color: string,
  bg: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = `
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    color: ${color};
    background: ${bg};
    border: 1px solid ${color}33;
    border-radius: 6px;
    cursor: pointer;
    font-family: system-ui, sans-serif;
    white-space: nowrap;
    transition: opacity 0.15s;
  `;
  btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.75'; });
  btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function showModePicker(
  element: Element,
  callback: (mode: 'anchor' | 'related') => void,
): void {
  hideModePicker();

  const rect = element.getBoundingClientRect();

  container = document.createElement('div');
  container.style.cssText = PANEL_STYLE;

  // Position below the element, centered
  const top = Math.min(rect.bottom + 8, window.innerHeight - 44);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8));
  container.style.top = `${top}px`;
  container.style.left = `${left}px`;
  container.style.transform = 'translateX(-50%)';

  const anchorBtn = createModeButton('设为锚点', '#fff', '#2563eb', () => {
    callback('anchor');
    hideModePicker();
  });

  const relatedBtn = createModeButton('添加为相关', '#374151', '#f3f4f6', () => {
    callback('related');
    hideModePicker();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '\u00d7';
  cancelBtn.style.cssText = `
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: #9ca3af;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
  `;
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideModePicker();
  });

  container.append(anchorBtn, relatedBtn, cancelBtn);
  document.documentElement.append(container);

  // Dismiss on click outside (delayed to avoid catching the context menu click itself)
  dismissHandler = (e: MouseEvent) => {
    if (!container?.contains(e.target as Node)) {
      hideModePicker();
    }
  };
  setTimeout(() => {
    if (dismissHandler) document.addEventListener('click', dismissHandler, true);
  }, 150);
}

export function hideModePicker(): void {
  if (dismissHandler) {
    document.removeEventListener('click', dismissHandler, true);
    dismissHandler = undefined;
  }
  container?.remove();
  container = undefined;
}
