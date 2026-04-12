import {
  createMessage,
  type MessageResponse,
  type RuntimeMessage,
  type SnapshotResponse,
} from '@/shared/messages';
import type { PickerMode } from '@/shared/types';
import { exportProjectBundle } from './exportService';
import {
  appendNetworkRecord,
  attachDataDependency,
  attachPickedElement,
  clearActivePicking,
  createProject,
  createRequirement,
  deleteRequirement,
  ensurePageCapture,
  getAppSnapshotForTab,
  removeDataDependency,
  removeDataDependencyField,
  removeRequirementElement,
  setActivePicking,
  updateRequirement,
} from './sessionStore';

async function sendStateChanged(
  tabId?: number,
  options: { deactivatePicker?: boolean } = {},
): Promise<void> {
  try {
    await chrome.runtime.sendMessage(
      createMessage('background', 'sidepanel', 'STATE_CHANGED', { reason: 'sync' }),
    );
  } catch {
    // Side panel may not be open.
  }

  if (!tabId || !options.deactivatePicker) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(
      tabId,
      createMessage('background', 'content', 'PICKER_DEACTIVATE', {}),
    );
  } catch {
    // Tab may not have content script ready yet.
  }
}

async function activatePicker(
  tabId: number,
  pageId: string,
  requirementId: string,
  mode: Exclude<PickerMode, 'idle'>,
): Promise<void> {
  await setActivePicking(tabId, {
    pageId,
    requirementId,
    mode,
  });

  await chrome.tabs.sendMessage(
    tabId,
    createMessage('background', 'content', 'PICKER_ACTIVATE', {
      pageId,
      requirementId,
      mode,
    }),
  );
}

async function deactivatePicker(tabId: number): Promise<void> {
  await clearActivePicking(tabId);
  await chrome.tabs.sendMessage(
    tabId,
    createMessage('background', 'content', 'PICKER_DEACTIVATE', {}),
  );
}

async function bootstrapForTab(tabId: number): Promise<SnapshotResponse> {
  const tab = await chrome.tabs.get(tabId);
  const page = await ensurePageCapture(tabId, tab.url ?? '', tab.title ?? 'Untitled');
  const snapshot = await getAppSnapshotForTab(tabId);

  return {
    ok: true,
    data: {
      ...snapshot,
      page,
    },
  };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void (async () => {
    try {
      switch (message.type) {
        case 'APP_BOOTSTRAP': {
          const response = await bootstrapForTab(message.payload.tabId);
          sendResponse(response);
          return;
        }

        case 'PROJECT_CREATE': {
          const project = await createProject(message.payload.name);
          sendResponse({ ok: true, data: project });
          return;
        }

        case 'REQUIREMENT_CREATE': {
          const requirement = await createRequirement(
            message.payload.pageId,
            message.payload.name,
            message.payload.description,
          );
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: requirement });
          return;
        }

        case 'REQUIREMENT_UPDATE': {
          const requirement = await updateRequirement(
            message.payload.pageId,
            message.payload.requirementId,
            message.payload.patch,
          );
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: requirement });
          return;
        }

        case 'REQUIREMENT_DELETE': {
          await deleteRequirement(message.payload.pageId, message.payload.requirementId);
          await clearActivePicking(message.payload.tabId);
          await sendStateChanged(message.payload.tabId, { deactivatePicker: true });
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'REQUIREMENT_REMOVE_ELEMENT': {
          const requirement = await removeRequirementElement(
            message.payload.pageId,
            message.payload.requirementId,
            message.payload.elementId,
          );
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: requirement });
          return;
        }

        case 'PICKER_START': {
          await activatePicker(
            message.payload.tabId,
            message.payload.pageId,
            message.payload.requirementId,
            message.payload.mode,
          );
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'PICKER_STOP': {
          await deactivatePicker(message.payload.tabId);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'ELEMENT_PICKED': {
          await attachPickedElement(
            message.payload.pageId,
            message.payload.requirementId,
            message.payload.mode,
            message.payload.element,
          );
          if (sender.tab?.id) {
            await clearActivePicking(sender.tab.id);
          }
          await sendStateChanged(sender.tab?.id, { deactivatePicker: true });
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'NETWORK_OBSERVED': {
          const tabId = sender.tab?.id;
          if (!tabId) {
            sendResponse({ ok: true, data: { success: true } });
            return;
          }
          const snapshot = await getAppSnapshotForTab(tabId).catch(() => undefined);
          if (!snapshot) {
            sendResponse({ ok: true, data: { success: true } });
            return;
          }
          await appendNetworkRecord(snapshot.page.id, message.payload.record);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'REQUIREMENT_ATTACH_FIELDS': {
          const requirement = await attachDataDependency(
            message.payload.pageId,
            message.payload.requirementId,
            message.payload.networkRecordId,
            message.payload.fields,
          );
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: requirement });
          return;
        }

        case 'REQUIREMENT_REMOVE_DATA_DEPENDENCY': {
          const requirement = await removeDataDependency(
            message.payload.pageId,
            message.payload.requirementId,
            message.payload.networkRecordId,
          );
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: requirement });
          return;
        }

        case 'REQUIREMENT_REMOVE_FIELD': {
          const requirement = await removeDataDependencyField(
            message.payload.pageId,
            message.payload.requirementId,
            message.payload.networkRecordId,
            message.payload.fieldPath,
          );
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: requirement });
          return;
        }

        case 'PROJECT_EXPORT': {
          await exportProjectBundle(message.payload.projectId);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        default: {
          sendResponse({ ok: false, error: `Unhandled message type: ${message.type}` });
          return;
        }
      }
    } catch (error) {
      const response: MessageResponse<never> = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      sendResponse(response);
    }
  })();

  return true;
});
