import { BRIDGE_SOURCE } from '@/shared/constants';
import { byteSize, createId, parseRawHeaders, safeJsonParse, summarizeJson, toPlainHeaders, truncateText } from '@/shared/utils';
import type { NetworkRecord } from '@/shared/types';

/** Only record HTTP(S) requests — skip chrome-extension://, edge://, etc. */
function shouldRecord(url: string): boolean {
  try {
    const { protocol } = new URL(url, location.href);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

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

function normalizeInitHeaders(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return toPlainHeaders(headers);
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key.toLowerCase(), String(value)]));
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
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
    requestHeaders: normalizeInitHeaders(init?.headers),
    requestBodyPreview:
      typeof init?.body === 'string' ? truncateText(init.body) : undefined,
    requestBodySize:
      typeof init?.body === 'string' ? byteSize(init.body) : undefined,
    responseHeaders: toPlainHeaders(response.headers),
    responsePreview: truncateText(responseText),
    responseBodySize: responseText ? byteSize(responseText) : undefined,
    responseJsonSample: parsedJson ? summarizeJson(parsedJson) : undefined,
    captureSource: 'injected',
    mirrorStored: false,
    timestamp: Date.now(),
  };
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await originalFetch(input, init);

  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (shouldRecord(url)) {
    buildRecordFromFetch(input, init, response)
      .then(emitRecord)
      .catch(() => undefined);
  }

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
  const url = String(Reflect.get(this, '__offlineCaptureUrl') ?? '');

  if (shouldRecord(url)) {
    const requestBodyPreview = typeof body === 'string' ? truncateText(body) : undefined;
    this.addEventListener('loadend', () => {
      try {
        const contentType = this.getResponseHeader('content-type') ?? undefined;
        // responseText is only accessible when responseType is '' or 'text'
        const canReadText = this.responseType === '' || this.responseType === 'text';
        const responseText =
          canReadText && (contentType?.includes('application/json') || contentType?.includes('text/'))
            ? this.responseText
            : '';
        const parsedJson = contentType?.includes('application/json') ? safeJsonParse(responseText) : undefined;

        emitRecord({
          id: createId('net'),
          url,
          method: String(Reflect.get(this, '__offlineCaptureMethod') ?? 'GET'),
          status: this.status,
          contentType,
          requestHeaders: undefined,
          requestBodyPreview,
          requestBodySize: requestBodyPreview ? byteSize(requestBodyPreview) : undefined,
          responseHeaders: parseRawHeaders(this.getAllResponseHeaders()),
          responsePreview: truncateText(responseText),
          responseBodySize: responseText ? byteSize(responseText) : undefined,
          responseJsonSample: parsedJson ? summarizeJson(parsedJson) : undefined,
          captureSource: 'injected',
          mirrorStored: false,
          timestamp: Date.now(),
        });
      } catch {
        // Silently skip if response cannot be read.
      }
    });
  }

  return originalSend.call(this, body ?? null);
};
