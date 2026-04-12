import { sanitizeFilename } from '@/shared/utils';
import { buildExportZip, getProject } from './sessionStore';

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function captureCurrentPageScreenshot(): Promise<Array<{ name: string; dataUrl: string }>> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, {
      format: 'png',
    });
    if (!dataUrl) {
      return [];
    }

    return [{ name: 'current-page.png', dataUrl }];
  } catch {
    return [];
  }
}

async function capturePageHtml(tabId: number): Promise<string | undefined> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });
    return results?.[0]?.result ?? undefined;
  } catch {
    return undefined;
  }
}

export async function exportProjectBundle(projectId: string, tabId?: number): Promise<void> {
  const project = await getProject(projectId);
  const screenshots = await captureCurrentPageScreenshot();

  let pageHtml: string | undefined;
  if (tabId) {
    pageHtml = await capturePageHtml(tabId);
  }

  const zipBlob = await buildExportZip(projectId, screenshots, pageHtml);
  const dataUrl = await blobToDataUrl(zipBlob);

  await chrome.downloads.download({
    url: dataUrl,
    filename: `${sanitizeFilename(project.name)}.zip`,
    saveAs: true,
  });
}
