import { BRIDGE_SOURCE } from '@/shared/constants';
import { createId, parseRawHeaders, safeJsonParse, summarizeJson, toPlainHeaders, truncateText } from '@/shared/utils';
import type { NetworkRecord } from '@/shared/types';

function emitRecord(record: NetworkRecord): void {
  window.postMessage(
    {
      source: BRIDGE_SOURCE,
      type: 'NETWORK_EVENT',
      payload: record,
    },
    '*',
  );
}

async function buildRecordFromFetch(
  request: RequestInfo | URL,
  init: RequestInit | undefined,
  response: Response,
): Promise<NetworkRecord> {
  const cloned = response.clone();
  const contentType = response.headers.get('content-type') ?? undefined;
  const responseText = contentType?.includes('application/json') || contentType?.includes('text/')
    ? await cloned.text().catch(() => '')
    : '';
  const parsedJson = contentType?.includes('application/json') ? safeJsonParse(responseText) : undefined;

  return {
    id: createId('net'),
    url: typeof request === 'string' ? request : request instanceof URL ? request.toString() : request.url,
    method:
      init?.method ?? (request instanceof Request ? request.method : undefined) ?? 'GET',
    status: response.status,
    contentType,
    requestHeaders:
      init?.headers instanceof Headers
        ? toPlainHeaders(init.headers)
        : undefined,
    requestBodyPreview:
      typeof init?.body === 'string' ? truncateText(init.body) : undefined,
    responseHeaders: toPlainHeaders(response.headers),
    responsePreview: truncateText(responseText),
    responseJsonSample: parsedJson ? summarizeJson(parsedJson) : undefined,
    timestamp: Date.now(),
  };
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await originalFetch(input, init);
  buildRecordFromFetch(input, init, response)
    .then(emitRecord)
    .catch(() => undefined);
  return response;
};

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function open(
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null,
): void {
  Reflect.set(this, '__offlineCaptureMethod', method);
  Reflect.set(this, '__offlineCaptureUrl', String(url));

  if (async === undefined && username === undefined && password === undefined) {
    return originalOpen.call(this, method, url, true);
  }

  return originalOpen.call(this, method, url, async ?? true, username, password);
};

XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null): void {
  const requestBodyPreview = typeof body === 'string' ? truncateText(body) : undefined;
  this.addEventListener('loadend', () => {
    const contentType = this.getResponseHeader('content-type') ?? undefined;
    const responseText =
      typeof this.responseText === 'string' && (contentType?.includes('application/json') || contentType?.includes('text/'))
        ? this.responseText
        : '';
    const parsedJson = contentType?.includes('application/json') ? safeJsonParse(responseText) : undefined;

    emitRecord({
      id: createId('net'),
      url: String(Reflect.get(this, '__offlineCaptureUrl') ?? ''),
      method: String(Reflect.get(this, '__offlineCaptureMethod') ?? 'GET'),
      status: this.status,
      contentType,
      requestHeaders: undefined,
      requestBodyPreview,
      responseHeaders: parseRawHeaders(this.getAllResponseHeaders()),
      responsePreview: truncateText(responseText),
      responseJsonSample: parsedJson ? summarizeJson(parsedJson) : undefined,
      timestamp: Date.now(),
    });
  });

  return originalSend.call(this, body ?? null);
};
