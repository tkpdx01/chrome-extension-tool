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

export async function exportProjectBundle(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  const screenshots = await captureCurrentPageScreenshot();
  const zipBlob = await buildExportZip(projectId, screenshots);
  const dataUrl = await blobToDataUrl(zipBlob);

  await chrome.downloads.download({
    url: dataUrl,
    filename: `${sanitizeFilename(project.name)}.zip`,
    saveAs: true,
  });
}
