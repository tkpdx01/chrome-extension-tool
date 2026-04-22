import { createMessage } from '@/shared/messages';
import type { MirroredBody, NetworkMirrorPayload, NetworkRecord } from '@/shared/types';
import {
  byteSize,
  estimateBase64Size,
  mirroredBodyToText,
  safeJsonParse,
  summarizeJson,
  truncateText,
} from '@/shared/utils';
import { appendNetworkRecord } from './sessionStore';
import { saveMirrorPayload } from './mirrorStore';

type CdpHeaders = Record<string, string | number | boolean | undefined>;

type RequestWillBeSentParams = {
  requestId: string;
  wallTime?: number;
  type?: string;
  initiator?: { type?: string };
  request: {
    url: string;
    method: string;
    headers?: CdpHeaders;
    postData?: string;
    hasPostData?: boolean;
  };
  redirectResponse?: ResponsePayload;
};

type RequestWillBeSentExtraInfoParams = {
  requestId: string;
  headers?: CdpHeaders;
};

type ResponsePayload = {
  status: number;
  statusText?: string;
  headers?: CdpHeaders;
  mimeType?: string;
  protocol?: string;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
  encodedDataLength?: number;
};

type ResponseReceivedParams = {
  requestId: string;
  type?: string;
  response: ResponsePayload;
};

type ResponseReceivedExtraInfoParams = {
  requestId: string;
  headers?: CdpHeaders;
  statusCode?: number;
};

type LoadingFinishedParams = {
  requestId: string;
  encodedDataLength?: number;
};

type LoadingFailedParams = {
  requestId: string;
  errorText?: string;
  canceled?: boolean;
  blockedReason?: string;
  corsErrorStatus?: { corsError?: string } | string;
};

type MirrorSession = {
  tabId: number;
  pageId: string;
  attached: boolean;
  nextSequence: number;
  requests: Map<string, PartialMirrorEntry>;
};

type PartialMirrorEntry = {
  id: string;
  pageId: string;
  tabId: number;
  requestId: string;
  sequence: number;
  capturedAt: number;
  url?: string;
  method?: string;
  resourceType?: string;
  initiatorType?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: MirroredBody;
  hasPostData?: boolean;
  requestPostDataUnavailable?: boolean;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseContentType?: string;
  responseBody?: MirroredBody;
  responseBodyUnavailable?: boolean;
  protocol?: string;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
  encodedDataLength?: number;
  failedReason?: string;
  failedCanceled?: boolean;
  failedBlockedReason?: string;
  failedCorsErrorStatus?: string;
  finalized?: boolean;
};

const CDP_VERSION = '1.3';
const sessionsByTab = new Map<number, MirrorSession>();

function normalizeHeaders(headers?: CdpHeaders): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const entries = Object.entries(headers)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key.toLowerCase(), String(value)] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function mergeHeaders(
  base?: Record<string, string>,
  incoming?: Record<string, string>,
): Record<string, string> | undefined {
  if (!base && !incoming) {
    return undefined;
  }

  return {
    ...(base ?? {}),
    ...(incoming ?? {}),
  };
}

function bodyFromUtf8(value: string): MirroredBody {
  return {
    encoding: 'utf8',
    body: value,
    size: byteSize(value),
  };
}

function bodyFromCdpResponse(body: string, base64Encoded: boolean): MirroredBody {
  if (base64Encoded) {
    return {
      encoding: 'base64',
      body,
      size: estimateBase64Size(body),
    };
  }

  return bodyFromUtf8(body);
}

function ensureSession(tabId: number, pageId: string): MirrorSession {
  const existing = sessionsByTab.get(tabId);
  if (existing) {
    existing.pageId = pageId;
    return existing;
  }

  const next: MirrorSession = {
    tabId,
    pageId,
    attached: false,
    nextSequence: 1,
    requests: new Map<string, PartialMirrorEntry>(),
  };
  sessionsByTab.set(tabId, next);
  return next;
}

function ensureEntry(session: MirrorSession, requestId: string): PartialMirrorEntry {
  const existing = session.requests.get(requestId);
  if (existing) {
    return existing;
  }

  const created: PartialMirrorEntry = {
    id: crypto.randomUUID(),
    pageId: session.pageId,
    tabId: session.tabId,
    requestId,
    sequence: session.nextSequence++,
    capturedAt: Date.now(),
  };
  session.requests.set(requestId, created);
  return created;
}

function applyResponse(entry: PartialMirrorEntry, response: ResponsePayload): void {
  entry.responseStatus = response.status;
  entry.responseStatusText = response.statusText;
  entry.responseHeaders = mergeHeaders(entry.responseHeaders, normalizeHeaders(response.headers));
  entry.responseContentType = entry.responseHeaders?.['content-type'] ?? response.mimeType;
  entry.protocol = response.protocol ?? entry.protocol;
  entry.fromDiskCache = response.fromDiskCache ?? entry.fromDiskCache;
  entry.fromServiceWorker = response.fromServiceWorker ?? entry.fromServiceWorker;
  entry.encodedDataLength = response.encodedDataLength ?? entry.encodedDataLength;
}

async function notifyStateChanged(): Promise<void> {
  try {
    await chrome.runtime.sendMessage(
      createMessage('background', 'sidepanel', 'STATE_CHANGED', { reason: 'network-mirror' }),
    );
  } catch {
    // Side panel may not be open.
  }
}

function previewFromBody(body: MirroredBody | undefined, contentType?: string): string | undefined {
  if (!body) {
    return undefined;
  }

  const text = mirroredBodyToText(body, contentType);
  if (text !== undefined) {
    return truncateText(text);
  }

  return `[binary payload ${body.size} bytes]`;
}

function jsonSampleFromBody(body: MirroredBody | undefined, contentType?: string): unknown | undefined {
  const text = mirroredBodyToText(body, contentType);
  if (!text) {
    return undefined;
  }

  if (!(contentType?.toLowerCase().includes('json') ?? false)) {
    const trimmed = text.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
      return undefined;
    }
  }

  const parsed = safeJsonParse(text);
  return parsed === undefined ? undefined : summarizeJson(parsed);
}

function toSummaryRecord(payload: NetworkMirrorPayload): NetworkRecord {
  const contentType = payload.response?.contentType ?? payload.response?.headers?.['content-type'];
  return {
    id: payload.id,
    url: payload.url,
    method: payload.method,
    status: payload.response?.status ?? 0,
    statusText: payload.response?.statusText,
    resourceType: payload.resourceType,
    protocol: payload.response?.protocol,
    contentType,
    requestHeaders: payload.requestHeaders,
    requestBodyPreview: previewFromBody(payload.requestBody, payload.requestHeaders?.['content-type']),
    requestBodySize: payload.requestBody?.size,
    responseHeaders: payload.response?.headers,
    responsePreview: previewFromBody(payload.response?.body, contentType),
    responseBodySize: payload.response?.body?.size ?? payload.response?.encodedDataLength,
    responseJsonSample: jsonSampleFromBody(payload.response?.body, contentType),
    initiatorType: payload.initiatorType,
    fromDiskCache: payload.response?.fromDiskCache,
    fromServiceWorker: payload.response?.fromServiceWorker,
    failedReason: payload.failed?.errorText,
    captureSource: payload.captureSource,
    mirrorStored: true,
    timestamp: payload.capturedAt,
  };
}

async function getRequestPostData(tabId: number, requestId: string): Promise<MirroredBody | undefined> {
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Network.getRequestPostData',
      { requestId },
    ) as { postData?: string };
    return typeof result.postData === 'string' ? bodyFromUtf8(result.postData) : undefined;
  } catch {
    return undefined;
  }
}

async function getResponseBody(tabId: number, requestId: string): Promise<MirroredBody | undefined> {
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Network.getResponseBody',
      { requestId },
    ) as { body?: string; base64Encoded?: boolean };
    if (typeof result.body !== 'string') {
      return undefined;
    }
    return bodyFromCdpResponse(result.body, !!result.base64Encoded);
  } catch {
    return undefined;
  }
}

async function persistEntry(
  session: MirrorSession,
  entry: PartialMirrorEntry,
  options: { skipResponseBody?: boolean } = {},
): Promise<void> {
  if (entry.finalized || !entry.url || !entry.method) {
    return;
  }

  entry.finalized = true;

  if (!entry.requestBody && entry.hasPostData && !entry.requestPostDataUnavailable) {
    entry.requestBody = await getRequestPostData(session.tabId, entry.requestId);
    entry.requestPostDataUnavailable = !entry.requestBody;
  }

  if (!options.skipResponseBody && !entry.failedReason && entry.responseStatus !== undefined && !entry.responseBody && !entry.responseBodyUnavailable) {
    entry.responseBody = await getResponseBody(session.tabId, entry.requestId);
    entry.responseBodyUnavailable = !entry.responseBody;
  }

  const payload: NetworkMirrorPayload = {
    id: entry.id,
    pageId: entry.pageId,
    tabId: entry.tabId,
    requestId: entry.requestId,
    sequence: entry.sequence,
    capturedAt: entry.capturedAt,
    url: entry.url,
    method: entry.method,
    resourceType: entry.resourceType,
    initiatorType: entry.initiatorType,
    requestHeaders: entry.requestHeaders,
    requestBody: entry.requestBody,
    response: entry.responseStatus !== undefined
      ? {
          status: entry.responseStatus,
          statusText: entry.responseStatusText,
          protocol: entry.protocol,
          contentType: entry.responseContentType,
          headers: entry.responseHeaders,
          body: entry.responseBody,
          bodyUnavailable: entry.responseBodyUnavailable,
          fromDiskCache: entry.fromDiskCache,
          fromServiceWorker: entry.fromServiceWorker,
          encodedDataLength: entry.encodedDataLength,
        }
      : undefined,
    failed: entry.failedReason
      ? {
          errorText: entry.failedReason,
          canceled: entry.failedCanceled,
          blockedReason: entry.failedBlockedReason,
          corsErrorStatus: entry.failedCorsErrorStatus,
        }
      : undefined,
    captureSource: 'debugger',
  };

  await saveMirrorPayload(payload);
  await appendNetworkRecord(entry.pageId, toSummaryRecord(payload));
  await notifyStateChanged();
}

async function handleRequestWillBeSent(session: MirrorSession, params: RequestWillBeSentParams): Promise<void> {
  const existing = session.requests.get(params.requestId);
  if (existing && params.redirectResponse) {
    applyResponse(existing, params.redirectResponse);
    await persistEntry(session, existing, { skipResponseBody: true });
    session.requests.delete(params.requestId);
  }

  const entry = ensureEntry(session, params.requestId);
  entry.pageId = session.pageId;
  entry.capturedAt = params.wallTime ? Math.round(params.wallTime * 1000) : entry.capturedAt;
  entry.url = params.request.url;
  entry.method = params.request.method;
  entry.resourceType = params.type ?? entry.resourceType;
  entry.initiatorType = params.initiator?.type ?? entry.initiatorType;
  entry.requestHeaders = mergeHeaders(entry.requestHeaders, normalizeHeaders(params.request.headers));
  entry.hasPostData = params.request.hasPostData ?? !!params.request.postData;
  if (typeof params.request.postData === 'string') {
    entry.requestBody = bodyFromUtf8(params.request.postData);
  }
}

function handleRequestWillBeSentExtraInfo(session: MirrorSession, params: RequestWillBeSentExtraInfoParams): void {
  const entry = ensureEntry(session, params.requestId);
  entry.requestHeaders = mergeHeaders(entry.requestHeaders, normalizeHeaders(params.headers));
}

function handleResponseReceived(session: MirrorSession, params: ResponseReceivedParams): void {
  const entry = ensureEntry(session, params.requestId);
  entry.resourceType = params.type ?? entry.resourceType;
  applyResponse(entry, params.response);
}

function handleResponseReceivedExtraInfo(session: MirrorSession, params: ResponseReceivedExtraInfoParams): void {
  const entry = ensureEntry(session, params.requestId);
  entry.responseHeaders = mergeHeaders(entry.responseHeaders, normalizeHeaders(params.headers));
  if (params.statusCode !== undefined) {
    entry.responseStatus = params.statusCode;
  }
  entry.responseContentType = entry.responseHeaders?.['content-type'] ?? entry.responseContentType;
}

async function handleLoadingFinished(session: MirrorSession, params: LoadingFinishedParams): Promise<void> {
  const entry = session.requests.get(params.requestId);
  if (!entry) {
    return;
  }

  entry.encodedDataLength = params.encodedDataLength ?? entry.encodedDataLength;
  await persistEntry(session, entry);
  session.requests.delete(params.requestId);
}

async function handleLoadingFailed(session: MirrorSession, params: LoadingFailedParams): Promise<void> {
  const entry = ensureEntry(session, params.requestId);
  entry.failedReason = params.errorText ?? 'Request failed';
  entry.failedCanceled = params.canceled;
  entry.failedBlockedReason = params.blockedReason;
  entry.failedCorsErrorStatus = typeof params.corsErrorStatus === 'string'
    ? params.corsErrorStatus
    : params.corsErrorStatus?.corsError;
  await persistEntry(session, entry, { skipResponseBody: true });
  session.requests.delete(params.requestId);
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId) {
    return;
  }

  const session = sessionsByTab.get(tabId);
  if (!session) {
    return;
  }

  void (async () => {
    switch (method) {
      case 'Network.requestWillBeSent':
        await handleRequestWillBeSent(session, params as RequestWillBeSentParams);
        break;
      case 'Network.requestWillBeSentExtraInfo':
        handleRequestWillBeSentExtraInfo(session, params as RequestWillBeSentExtraInfoParams);
        break;
      case 'Network.responseReceived':
        handleResponseReceived(session, params as ResponseReceivedParams);
        break;
      case 'Network.responseReceivedExtraInfo':
        handleResponseReceivedExtraInfo(session, params as ResponseReceivedExtraInfoParams);
        break;
      case 'Network.loadingFinished':
        await handleLoadingFinished(session, params as LoadingFinishedParams);
        break;
      case 'Network.loadingFailed':
        await handleLoadingFailed(session, params as LoadingFailedParams);
        break;
      default:
        break;
    }
  })();
});

chrome.debugger.onDetach.addListener((source) => {
  const tabId = source.tabId;
  if (!tabId) {
    return;
  }

  const session = sessionsByTab.get(tabId);
  if (!session) {
    return;
  }

  session.attached = false;
  session.requests.clear();
});

export async function ensureMirrorCapture(tabId: number, pageId: string): Promise<void> {
  const session = ensureSession(tabId, pageId);
  session.pageId = pageId;

  if (session.attached) {
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, CDP_VERSION);
    await chrome.debugger.sendCommand(
      { tabId },
      'Network.enable',
      {
        maxPostDataSize: 1024 * 1024 * 10,
        maxResourceBufferSize: 1024 * 1024 * 50,
        maxTotalBufferSize: 1024 * 1024 * 100,
      },
    );
    session.attached = true;
  } catch {
    sessionsByTab.delete(tabId);
  }
}

export function isMirrorCaptureActive(tabId: number): boolean {
  return sessionsByTab.get(tabId)?.attached ?? false;
}

export async function stopMirrorCapture(tabId: number): Promise<void> {
  const session = sessionsByTab.get(tabId);
  sessionsByTab.delete(tabId);

  if (!session?.attached) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Tab may already be closed or detached.
  }
}
