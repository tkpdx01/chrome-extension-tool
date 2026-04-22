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
      func: () => {
        const root = document.documentElement.cloneNode(true) as HTMLElement;
        const originalFields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
        const clonedFields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');

        originalFields.forEach((field, index) => {
          const clone = clonedFields[index];
          if (!clone) return;

          if (field instanceof HTMLInputElement) {
            if (field.type === 'checkbox' || field.type === 'radio') {
              if (field.checked) clone.setAttribute('checked', 'checked');
              else clone.removeAttribute('checked');
            } else {
              clone.setAttribute('value', field.value);
            }
          }

          if (field instanceof HTMLTextAreaElement) {
            clone.textContent = field.value;
          }

          if (field instanceof HTMLSelectElement) {
            const clonedOptions = clone.querySelectorAll('option');
            Array.from(field.options).forEach((option, optionIndex) => {
              const clonedOption = clonedOptions[optionIndex];
              if (!clonedOption) return;
              if (option.selected) clonedOption.setAttribute('selected', 'selected');
              else clonedOption.removeAttribute('selected');
            });
          }
        });

        root.querySelectorAll('[data-offline-capture-overlay="1"]').forEach((node) => node.remove());
        return `<!DOCTYPE html>\n${root.outerHTML}`;
      },
    });
    return results?.[0]?.result ?? undefined;
  } catch {
    return undefined;
  }
}

async function capturePageMhtml(tabId: number): Promise<Blob | undefined> {
  if (!chrome.pageCapture?.saveAsMHTML) {
    return undefined;
  }

  try {
    return await chrome.pageCapture.saveAsMHTML({ tabId });
  } catch {
    return undefined;
  }
}

function buildExportFilename(project: { pages: Array<{ url: string }> }): string {
  const page = project.pages[0];
  if (!page?.url) {
    return 'capture-export.zip';
  }

  try {
    const url = new URL(page.url);
    const domain = url.hostname.replace(/^www\./, '');
    const path = url.pathname
      .replace(/^\/|\/$/g, '')
      .replace(/\//g, '_')
      .slice(0, 60);
    const slug = sanitizeFilename(path ? `${domain}_${path}` : domain);
    return `${slug}-offline-snapshot.zip`;
  } catch {
    return 'capture-export.zip';
  }
}

export async function exportProjectBundle(projectId: string, tabId?: number): Promise<void> {
  const project = await getProject(projectId);
  const screenshots = await captureCurrentPageScreenshot();
  const focusPageId = tabId ? project.pages.find((page) => page.tabId === tabId)?.id : project.pages[0]?.id;

  let pageHtml: string | undefined;
  let pageMhtml: Blob | undefined;
  if (tabId) {
    [pageHtml, pageMhtml] = await Promise.all([
      capturePageHtml(tabId),
      capturePageMhtml(tabId),
    ]);
  }

  const zipBlob = await buildExportZip(projectId, {
    screenshots,
    focusPageId,
    pageHtml,
    pageMhtml,
  });
  const dataUrl = await blobToDataUrl(zipBlob);

  await chrome.downloads.download({
    url: dataUrl,
    filename: buildExportFilename(project),
    saveAs: true,
  });
}
