import { createMessage } from '@/shared/messages';
import { inspectElement } from './domInspector';

type CaptureMode = 'anchor' | 'related';

type CaptureSession = {
  pageId: string;
  requirementId: string;
  requirementName: string;
  mode: CaptureMode;
  addedCount: number;
  currentTarget?: Element;
  hud: HTMLDivElement;
  highlight: HTMLDivElement;
  status: HTMLDivElement;
  title: HTMLDivElement;
  modeButtons: Record<CaptureMode, HTMLButtonElement>;
  doneButton: HTMLButtonElement;
  moveHandler: (event: MouseEvent) => void;
  clickHandler: (event: MouseEvent) => void;
  keyHandler: (event: KeyboardEvent) => void;
  refreshHandler: () => void;
  previousCursor: string;
};

type StartCaptureOptions = {
  pageId: string;
  requirementId: string;
  requirementName: string;
  mode: CaptureMode;
};

const OVERLAY_ROOT_ATTR = 'data-offline-capture-overlay';

let session: CaptureSession | undefined;

function isOverlayElement(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(`[${OVERLAY_ROOT_ATTR}="1"]`);
}

function createActionButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.style.cssText = [
    'border: 1px solid #d1d5db',
    'background: #fff',
    'color: #374151',
    'font-size: 12px',
    'font-weight: 600',
    'padding: 6px 10px',
    'border-radius: 999px',
    'cursor: pointer',
    'font-family: system-ui, sans-serif',
    'transition: all 120ms ease',
  ].join(';');
  button.addEventListener('mouseenter', () => { button.style.opacity = '0.8'; });
  button.addEventListener('mouseleave', () => { button.style.opacity = '1'; });
  return button;
}

function updateModeStyles(): void {
  if (!session) return;

  (Object.entries(session.modeButtons) as Array<[CaptureMode, HTMLButtonElement]>).forEach(([mode, button]) => {
    const active = session?.mode === mode;
    button.style.background = active ? '#111827' : '#fff';
    button.style.color = active ? '#fff' : '#374151';
    button.style.borderColor = active ? '#111827' : '#d1d5db';
  });
}

function updateStatus(): void {
  if (!session) return;

  const targetText = session.currentTarget instanceof Element
    ? `<${session.currentTarget.tagName.toLowerCase()}>`
    : '移动到目标元素上';
  const modeText = session.mode === 'anchor' ? '当前模式：锚点' : `当前模式：相关元素，已添加 ${session.addedCount} 个`;

  session.title.textContent = `正在采集：${session.requirementName}`;
  session.status.textContent = `${modeText} · ${targetText} · Esc 退出`;
}

function positionHighlight(): void {
  if (!session) return;

  const target = session.currentTarget;
  if (!(target instanceof Element) || !document.contains(target)) {
    session.highlight.style.display = 'none';
    return;
  }

  const rect = target.getBoundingClientRect();
  session.highlight.style.display = 'block';
  session.highlight.style.top = `${rect.top}px`;
  session.highlight.style.left = `${rect.left}px`;
  session.highlight.style.width = `${rect.width}px`;
  session.highlight.style.height = `${rect.height}px`;
}

function setCurrentTarget(target?: Element): void {
  if (!session) return;

  if (target && isOverlayElement(target)) {
    return;
  }

  session.currentTarget = target;
  positionHighlight();
  updateStatus();
}

function elementFromPointer(clientX: number, clientY: number): Element | undefined {
  const element = document.elementFromPoint(clientX, clientY);
  if (!(element instanceof Element) || isOverlayElement(element)) {
    return undefined;
  }

  return element;
}

function buildHud(): Pick<CaptureSession, 'hud' | 'highlight' | 'status' | 'title' | 'modeButtons' | 'doneButton'> {
  const hud = document.createElement('div');
  hud.setAttribute(OVERLAY_ROOT_ATTR, '1');
  hud.style.cssText = [
    'position: fixed',
    'top: 16px',
    'right: 16px',
    'z-index: 2147483647',
    'width: min(320px, calc(100vw - 32px))',
    'background: rgba(255,255,255,0.97)',
    'backdrop-filter: blur(10px)',
    'border: 1px solid rgba(17,24,39,0.08)',
    'border-radius: 16px',
    'box-shadow: 0 18px 48px rgba(15,23,42,0.18)',
    'padding: 12px',
    'font-family: system-ui, sans-serif',
    'color: #111827',
  ].join(';');

  const badge = document.createElement('div');
  badge.textContent = '页面采集模式';
  badge.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'padding: 3px 8px',
    'border-radius: 999px',
    'background: #f3f4f6',
    'color: #6b7280',
    'font-size: 11px',
    'font-weight: 700',
  ].join(';');

  const title = document.createElement('div');
  title.style.cssText = 'margin-top: 8px; font-size: 15px; font-weight: 700; color: #111827;';

  const subtitle = document.createElement('div');
  subtitle.textContent = '悬停查看高亮，点击页面元素即可采集。';
  subtitle.style.cssText = 'margin-top: 4px; font-size: 12px; line-height: 1.5; color: #6b7280;';

  const modeRow = document.createElement('div');
  modeRow.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';

  const anchorButton = createActionButton('锚点');
  const relatedButton = createActionButton('相关');
  modeRow.append(anchorButton, relatedButton);

  const status = document.createElement('div');
  status.style.cssText = [
    'margin-top: 10px',
    'padding: 10px 12px',
    'border-radius: 12px',
    'background: #f9fafb',
    'font-size: 12px',
    'line-height: 1.6',
    'color: #4b5563',
  ].join(';');

  const footer = document.createElement('div');
  footer.style.cssText = 'display: flex; justify-content: flex-end; margin-top: 12px;';

  const doneButton = createActionButton('完成');
  doneButton.style.color = '#b91c1c';
  doneButton.style.borderColor = '#fecaca';
  doneButton.style.background = '#fff';
  footer.append(doneButton);

  hud.append(badge, title, subtitle, modeRow, status, footer);

  const highlight = document.createElement('div');
  highlight.setAttribute(OVERLAY_ROOT_ATTR, '1');
  highlight.style.cssText = [
    'position: fixed',
    'display: none',
    'z-index: 2147483646',
    'pointer-events: none',
    'border-radius: 10px',
    'border: 2px solid #111827',
    'background: rgba(17,24,39,0.08)',
    'box-shadow: 0 0 0 4px rgba(255,255,255,0.72)',
    'transition: all 80ms ease',
  ].join(';');

  document.documentElement.append(highlight, hud);

  return {
    hud,
    highlight,
    status,
    title,
    modeButtons: {
      anchor: anchorButton,
      related: relatedButton,
    },
    doneButton,
  };
}

async function captureCurrentTarget(): Promise<void> {
  if (!session?.currentTarget) return;

  const target = session.currentTarget;
  const element = inspectElement(target);
  const mode = session.mode;

  try {
    await chrome.runtime.sendMessage(
      createMessage('content', 'background', 'ELEMENT_PICKED', {
        pageId: session.pageId,
        requirementId: session.requirementId,
        mode,
        element,
      }),
    );
    session.addedCount += 1;
    updateStatus();
    if (mode === 'anchor') {
      stopCaptureMode();
    }
  } catch {
    session.status.textContent = '采集失败，请重试。';
  }
}

export function startCaptureMode(options: StartCaptureOptions): void {
  stopCaptureMode();

  const overlay = buildHud();
  const nextSession: CaptureSession = {
    ...options,
    addedCount: 0,
    ...overlay,
    moveHandler: (event) => {
      const target = elementFromPointer(event.clientX, event.clientY);
      setCurrentTarget(target);
    },
    clickHandler: (event) => {
      if (isOverlayElement(event.target)) {
        return;
      }

      const target = elementFromPointer(event.clientX, event.clientY);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setCurrentTarget(target);
      void captureCurrentTarget();
    },
    keyHandler: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        stopCaptureMode();
      }
    },
    refreshHandler: () => positionHighlight(),
    previousCursor: document.documentElement.style.cursor,
  };

  session = nextSession;
  document.documentElement.style.cursor = 'crosshair';

  session.modeButtons.anchor.addEventListener('click', () => {
    if (!session) return;
    session.mode = 'anchor';
    updateModeStyles();
    updateStatus();
  });

  session.modeButtons.related.addEventListener('click', () => {
    if (!session) return;
    session.mode = 'related';
    updateModeStyles();
    updateStatus();
  });

  session.doneButton.addEventListener('click', () => stopCaptureMode());

  document.addEventListener('mousemove', session.moveHandler, true);
  document.addEventListener('click', session.clickHandler, true);
  document.addEventListener('keydown', session.keyHandler, true);
  window.addEventListener('scroll', session.refreshHandler, true);
  window.addEventListener('resize', session.refreshHandler);

  updateModeStyles();
  updateStatus();
}

export function stopCaptureMode(): void {
  if (!session) return;

  document.removeEventListener('mousemove', session.moveHandler, true);
  document.removeEventListener('click', session.clickHandler, true);
  document.removeEventListener('keydown', session.keyHandler, true);
  window.removeEventListener('scroll', session.refreshHandler, true);
  window.removeEventListener('resize', session.refreshHandler);
  document.documentElement.style.cursor = session.previousCursor;
  session.highlight.remove();
  session.hud.remove();
  session = undefined;
}
