import {
  createMessage,
  type EmptyResponse,
  type MessageResponse,
  type RuntimeMessage,
  type SnapshotResponse,
} from '@/shared/messages';
import type { InsertPosition } from '@/shared/types';
import { getSupportedPageError, isSupportedPageUrl } from '@/shared/utils';
import { exportProjectBundle } from './exportService';
import {
  appendNetworkRecord,
  attachDataDependency,
  attachPickedElement,
  createProject,
  createRequirement,
  deleteRequirement,
  ensurePageCapture,
  getAppSnapshotForTab,
  getState,
  removeDataDependency,
  removeDataDependencyField,
  removeRequirementElement,
  updateRequirement,
} from './sessionStore';

// ---------------------------------------------------------------------------
// Tab tracking
// ---------------------------------------------------------------------------

let lastActiveTabId: number | undefined;

async function resolveActiveTabId(providedTabId?: number): Promise<number> {
  if (providedTabId) return providedTabId;
  if (lastActiveTabId) return lastActiveTabId;

  for (const query of [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
  ] as const) {
    const [tab] = await chrome.tabs.query(query);
    if (tab?.id) {
      lastActiveTabId = tab.id;
      return tab.id;
    }
  }

  throw new Error('未找到活动标签页。');
}

// ---------------------------------------------------------------------------
// Active context (side panel reports which requirement is active)
// ---------------------------------------------------------------------------

const activeContextByTab: Record<number, { pageId: string; requirementId: string }> = {};

// ---------------------------------------------------------------------------
// Content script management
// ---------------------------------------------------------------------------

async function isContentScriptReady(tabId: number): Promise<boolean> {
  try {
    const r = (await chrome.tabs.sendMessage(
      tabId,
      createMessage('background', 'content', 'CONTENT_PING', {}),
    )) as EmptyResponse;
    return r.ok;
  } catch {
    return false;
  }
}

async function injectManifestContentScripts(tabId: number): Promise<void> {
  for (const script of chrome.runtime.getManifest().content_scripts ?? []) {
    const files = script.js ?? [];
    if (files.length === 0) continue;
    await chrome.scripting.executeScript({
      target: { tabId },
      files,
      injectImmediately: true,
      world: (script as { world?: 'ISOLATED' | 'MAIN' }).world ?? 'ISOLATED',
    });
  }
}

async function ensureContentScriptReady(tabId: number, tabUrl?: string): Promise<void> {
  if (!isSupportedPageUrl(tabUrl)) throw new Error(getSupportedPageError(tabUrl));
  if (await isContentScriptReady(tabId)) return;

  try {
    await injectManifestContentScripts(tabId);
  } catch (error) {
    throw new Error(`无法注入扩展脚本：${error instanceof Error ? error.message : 'Unknown'}`);
  }

  if (!(await isContentScriptReady(tabId))) {
    throw new Error('页面脚本尚未就绪。请刷新页面后重试。');
  }
}

// ---------------------------------------------------------------------------
// State push
// ---------------------------------------------------------------------------

async function sendStateChanged(tabId?: number): Promise<void> {
  try {
    await chrome.runtime.sendMessage(
      createMessage('background', 'sidepanel', 'STATE_CHANGED', { reason: 'sync' }),
    );
  } catch {
    // Side panel may not be open.
  }
}

// ---------------------------------------------------------------------------
// Insert position indicators
// ---------------------------------------------------------------------------

async function showInsertIndicatorsForAnchor(
  tabId: number,
  pageId: string,
  requirementId: string,
): Promise<void> {
  try {
    const state = await getState();
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    const page = project?.pages.find((p) => p.id === pageId);
    const req = page?.requirements.find((r) => r.id === requirementId);
    if (!req?.anchorElementId) return;

    const anchor = page?.elements.find((e) => e.id === req.anchorElementId);
    const selector = anchor?.selectorCandidates.primaryCss ?? anchor?.selectorCandidates.css[0];
    if (!selector) return;

    await chrome.tabs.sendMessage(
      tabId,
      createMessage('background', 'content', 'SHOW_INSERT_INDICATORS', {
        selector,
        currentPosition: req.insertPosition,
      }),
    );
  } catch {
    // Content script may not be ready.
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrapForTab(tabId: number): Promise<SnapshotResponse> {
  const tab = await chrome.tabs.get(tabId);
  const page = await ensurePageCapture(tabId, tab.url ?? '', tab.title ?? 'Untitled');

  if (isSupportedPageUrl(tab.url)) {
    void ensureContentScriptReady(tabId, tab.url).catch(() => undefined);
  }

  const snapshot = await getAppSnapshotForTab(tabId);
  return { ok: true, data: { ...snapshot, page } };
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'capture-anchor',
      title: 'Capture: 设为锚点元素',
      contexts: ['all'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
    chrome.contextMenus.create({
      id: 'capture-related',
      title: 'Capture: 添加为相关元素',
      contexts: ['all'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const tabId = tab.id;
  const menuId = info.menuItemId;
  if (menuId !== 'capture-anchor' && menuId !== 'capture-related') return;

  const mode: 'anchor' | 'related' = menuId === 'capture-anchor' ? 'anchor' : 'related';

  void (async () => {
    try {
      // Auto-open side panel
      try {
        await (chrome.sidePanel as { open?: (opts: { tabId: number }) => Promise<void> }).open?.({ tabId });
      } catch {
        // May not be supported in older browsers.
      }

      let ctx = activeContextByTab[tabId];
      if (!ctx) {
        // Auto-create requirement if none active
        const snapshot = await getAppSnapshotForTab(tabId).catch(() => undefined);
        if (!snapshot) return;

        const req = await createRequirement(
          snapshot.page.id,
          `需求点 ${snapshot.page.requirements.length + 1}`,
        );
        ctx = { pageId: snapshot.page.id, requirementId: req.id };
        activeContextByTab[tabId] = ctx;
        await sendStateChanged();
      }

      await ensureContentScriptReady(tabId, tab.url);
      await chrome.tabs.sendMessage(
        tabId,
        createMessage('background', 'content', 'CONTEXT_MENU_PICK', {
          pageId: ctx.pageId,
          requirementId: ctx.requirementId,
          mode,
        }),
      );
    } catch {
      // Content script may not be ready or page is restricted.
    }
  })();
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch { /* Edge compat */ }
  setupContextMenus();
});

setupContextMenus();

chrome.tabs.onActivated.addListener(({ tabId }) => {
  lastActiveTabId = tabId;
  void (async () => {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (isSupportedPageUrl(tab.url)) {
        await ensurePageCapture(tabId, tab.url!, tab.title ?? 'Untitled');
        void ensureContentScriptReady(tabId, tab.url).catch(() => undefined);
      }
    } catch { /* Tab closed */ }
    await sendStateChanged();
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== lastActiveTabId || changeInfo.status !== 'complete') return;
  void (async () => {
    try {
      if (isSupportedPageUrl(tab.url)) {
        await ensurePageCapture(tabId, tab.url!, tab.title ?? 'Untitled');
        void ensureContentScriptReady(tabId, tab.url).catch(() => undefined);
      }
    } catch { /* Tab closed */ }
    await sendStateChanged();
  })();
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void (async () => {
    try {
      switch (message.type) {
        case 'APP_BOOTSTRAP': {
          const tabId = await resolveActiveTabId(message.payload.tabId);
          sendResponse(await bootstrapForTab(tabId));
          return;
        }

        case 'PROJECT_CREATE': {
          sendResponse({ ok: true, data: await createProject(message.payload.name) });
          return;
        }

        case 'REQUIREMENT_CREATE': {
          const req = await createRequirement(message.payload.pageId, message.payload.name, message.payload.description);
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: req });
          return;
        }

        case 'REQUIREMENT_UPDATE': {
          const req = await updateRequirement(message.payload.pageId, message.payload.requirementId, message.payload.patch);
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: req });
          return;
        }

        case 'REQUIREMENT_DELETE': {
          await deleteRequirement(message.payload.pageId, message.payload.requirementId);
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'REQUIREMENT_REMOVE_ELEMENT': {
          const req = await removeRequirementElement(message.payload.pageId, message.payload.requirementId, message.payload.elementId);
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: req });
          return;
        }

        case 'ELEMENT_PICKED': {
          await attachPickedElement(message.payload.pageId, message.payload.requirementId, message.payload.mode, message.payload.element);
          await sendStateChanged(sender.tab?.id);

          // Show insert position arrows after setting anchor
          if (message.payload.mode === 'anchor' && sender.tab?.id) {
            void showInsertIndicatorsForAnchor(sender.tab.id, message.payload.pageId, message.payload.requirementId);
          }
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'SIDEPANEL_CONTEXT_UPDATE': {
          activeContextByTab[message.payload.tabId] = {
            pageId: message.payload.pageId,
            requirementId: message.payload.requirementId,
          };
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'INSERT_POSITION_SELECTED': {
          const tabId = sender.tab?.id ?? lastActiveTabId;
          const ctx = tabId ? activeContextByTab[tabId] : undefined;
          if (!ctx) { sendResponse({ ok: false, error: 'No active context.' }); return; }

          await updateRequirement(ctx.pageId, ctx.requirementId, { insertPosition: message.payload.position as InsertPosition });
          if (tabId) {
            try { await chrome.tabs.sendMessage(tabId, createMessage('background', 'content', 'HIDE_INSERT_INDICATORS', {})); } catch {}
          }
          await sendStateChanged(tabId);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        // Cancel anchor from on-page button
        case 'CANCEL_ANCHOR': {
          const tabId = sender.tab?.id ?? lastActiveTabId;
          const ctx = tabId ? activeContextByTab[tabId] : undefined;
          if (ctx) {
            const state = await getState();
            const project = state.projects.find((p) => p.id === state.activeProjectId);
            const page = project?.pages.find((p) => p.id === ctx.pageId);
            const req = page?.requirements.find((r) => r.id === ctx.requirementId);
            if (req?.anchorElementId) {
              await removeRequirementElement(ctx.pageId, ctx.requirementId, req.anchorElementId);
            }
          }
          await sendStateChanged(tabId);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'NETWORK_OBSERVED': {
          const tabId = sender.tab?.id;
          if (!tabId) { sendResponse({ ok: true, data: { success: true } }); return; }
          const snapshot = await getAppSnapshotForTab(tabId).catch(() => undefined);
          if (!snapshot) { sendResponse({ ok: true, data: { success: true } }); return; }
          await appendNetworkRecord(snapshot.page.id, message.payload.record);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        case 'REQUIREMENT_ATTACH_FIELDS': {
          const req = await attachDataDependency(message.payload.pageId, message.payload.requirementId, message.payload.networkRecordId, message.payload.fields);
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: req });
          return;
        }

        case 'REQUIREMENT_REMOVE_DATA_DEPENDENCY': {
          const req = await removeDataDependency(message.payload.pageId, message.payload.requirementId, message.payload.networkRecordId);
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: req });
          return;
        }

        case 'REQUIREMENT_REMOVE_FIELD': {
          const req = await removeDataDependencyField(message.payload.pageId, message.payload.requirementId, message.payload.networkRecordId, message.payload.fieldPath);
          await sendStateChanged(message.payload.tabId);
          sendResponse({ ok: true, data: req });
          return;
        }

        case 'PROJECT_EXPORT': {
          await exportProjectBundle(message.payload.projectId, message.payload.tabId ?? lastActiveTabId);
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        // Forward highlight to content script
        case 'HIGHLIGHT_ELEMENT':
        case 'UNHIGHLIGHT_ELEMENT': {
          const tabId = lastActiveTabId;
          if (tabId) {
            try { await chrome.tabs.sendMessage(tabId, message); } catch {}
          }
          sendResponse({ ok: true, data: { success: true } });
          return;
        }

        default:
          sendResponse({ ok: false, error: `Unhandled: ${message.type}` });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' } as MessageResponse<never>);
    }
  })();

  return true;
});
