import { inspectElement } from './domInspector';
import { hideOverlay, showOverlay } from './overlay';
import { createMessage, type RuntimeMessage } from '@/shared/messages';
import type { PickerMode } from '@/shared/types';
import { emitObservedNetworkRecord, listenForInjectedNetworkEvents } from './pageBridge';

type ActivePickerState = {
  pageId: string;
  requirementId: string;
  mode: Exclude<PickerMode, 'idle'>;
};

let activePicker: ActivePickerState | undefined;

function getModeLabel(mode: Exclude<PickerMode, 'idle'>): string {
  return mode === 'anchor' ? '选择锚点元素' : '选择相关元素';
}

function onMouseMove(event: MouseEvent): void {
  if (!activePicker) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    hideOverlay();
    return;
  }

  showOverlay(target, getModeLabel(activePicker.mode));
}

async function onClick(event: MouseEvent): Promise<void> {
  if (!activePicker) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const element = inspectElement(target);
  const payload = {
    pageId: activePicker.pageId,
    requirementId: activePicker.requirementId,
    mode: activePicker.mode,
    element,
  };

  await chrome.runtime.sendMessage(createMessage('content', 'background', 'ELEMENT_PICKED', payload));
  disablePicker();
}

function enablePicker(state: ActivePickerState): void {
  disablePicker();
  activePicker = state;
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
}

function disablePicker(): void {
  activePicker = undefined;
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  hideOverlay();
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void (async () => {
    switch (message.type) {
      case 'PICKER_ACTIVATE':
        enablePicker(message.payload);
        sendResponse({ ok: true, data: { success: true } });
        return;
      case 'PICKER_DEACTIVATE':
        disablePicker();
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
