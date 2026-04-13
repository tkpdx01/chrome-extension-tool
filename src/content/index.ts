import { inspectElement } from './domInspector';
import { hideInsertIndicators, showInsertIndicators } from './insertIndicators';
import { hideModePicker, showModePicker } from './modePicker';
import { createMessage, type RuntimeMessage } from '@/shared/messages';
import type { InsertPosition } from '@/shared/types';
import { emitObservedNetworkRecord, listenForInjectedNetworkEvents } from './pageBridge';

// ---------------------------------------------------------------------------
// Context menu: track last right-clicked element
// ---------------------------------------------------------------------------

let lastRightClickedElement: Element | undefined;

document.addEventListener('contextmenu', (event) => {
  if (event.target instanceof Element) {
    lastRightClickedElement = event.target;
  }
}, true);

// ---------------------------------------------------------------------------
// Bidirectional highlight: side panel ↔ page element
// ---------------------------------------------------------------------------

let highlightOverlay: HTMLDivElement | undefined;

function showHighlight(selector: string): void {
  hideHighlight();
  const el = document.querySelector(selector);
  if (!el) {
    return;
  }

  const rect = el.getBoundingClientRect();
  highlightOverlay = document.createElement('div');
  highlightOverlay.style.cssText = [
    'position: fixed',
    `top: ${rect.top}px`,
    `left: ${rect.left}px`,
    `width: ${rect.width}px`,
    `height: ${rect.height}px`,
    'background: rgba(37, 99, 235, 0.12)',
    'border: 2px solid #2563eb',
    'border-radius: 4px',
    'pointer-events: none',
    'z-index: 2147483647',
    'transition: all 150ms ease',
  ].join(';');
  document.documentElement.append(highlightOverlay);
}

function hideHighlight(): void {
  highlightOverlay?.remove();
  highlightOverlay = undefined;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void (async () => {
    switch (message.type) {
      case 'CONTENT_PING':
        sendResponse({ ok: true, data: { success: true } });
        return;

      // Context menu: inspect the last right-clicked element, then show mode picker
      case 'CONTEXT_MENU_PICK': {
        if (!lastRightClickedElement || !document.contains(lastRightClickedElement)) {
          sendResponse({ ok: false, error: '未找到右键点击的元素，请重试。' });
          return;
        }

        const targetEl = lastRightClickedElement;
        const element = inspectElement(targetEl);

        showModePicker(targetEl, async (mode) => {
          try {
            await chrome.runtime.sendMessage(
              createMessage('content', 'background', 'ELEMENT_PICKED', {
                pageId: message.payload.pageId,
                requirementId: message.payload.requirementId,
                mode,
                element,
              }),
            );
          } catch { /* Background may not be ready */ }
        });

        sendResponse({ ok: true, data: { success: true } });
        return;
      }

      // Insert position arrows
      case 'SHOW_INSERT_INDICATORS': {
        showInsertIndicators(
          message.payload.selector,
          message.payload.currentPosition,
          async (position: InsertPosition) => {
            try {
              // pageId/requirementId resolved by background from activeContextByTab
              await chrome.runtime.sendMessage(
                createMessage('content', 'background', 'INSERT_POSITION_SELECTED', {
                  pageId: '_from_context',
                  requirementId: '_from_context',
                  position,
                }),
              );
            } catch { /* Background may not be ready */ }
          },
          async () => {
            try {
              await chrome.runtime.sendMessage(
                createMessage('content', 'background', 'CANCEL_ANCHOR', {}),
              );
            } catch { /* Background may not be ready */ }
          },
        );
        sendResponse({ ok: true, data: { success: true } });
        return;
      }

      case 'HIDE_INSERT_INDICATORS':
        hideInsertIndicators();
        sendResponse({ ok: true, data: { success: true } });
        return;

      // Bidirectional highlight
      case 'HIGHLIGHT_ELEMENT':
        showHighlight(message.payload.selector);
        sendResponse({ ok: true, data: { success: true } });
        return;

      case 'UNHIGHLIGHT_ELEMENT':
        hideHighlight();
        sendResponse({ ok: true, data: { success: true } });
        return;

      default:
        sendResponse({ ok: true, data: { success: true } });
    }
  })();

  return true;
});

listenForInjectedNetworkEvents((record) => {
  void emitObservedNetworkRecord(record);
});
