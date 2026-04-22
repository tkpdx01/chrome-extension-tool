import JSZip from 'jszip';
import { DEFAULT_PROJECT_NAME, MAX_NETWORK_RECORDS, STORAGE_KEY } from '@/shared/constants';
import type {
  DataDependency,
  ElementSnapshot,
  MirroredBody,
  NetworkMirrorPayload,
  NetworkRecord,
  PageCapture,
  Project,
  RequirementPoint,
  RuntimeSession,
  StoredState,
} from '@/shared/types';
import { contentTypeToExtension, createId, extractUrlPattern, getOrigin, mirroredBodyToText, nowIso, sanitizeFilename, summarizeJson } from '@/shared/utils';
import { listMirrorPayloadsByPage } from './mirrorStore';

type ExportBundleArtifacts = {
  screenshots?: Array<{ name: string; dataUrl: string }>;
  focusPageId?: string;
  pageHtml?: string;
  pageMhtml?: Blob;
};

function createDefaultState(): StoredState {
  return {
    projects: [],
    activeProjectId: undefined,
    runtime: {
      activePageIdByTab: {},
    },
  };
}

export async function getState(): Promise<StoredState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StoredState | undefined) ?? createDefaultState();
}

async function setState(state: StoredState): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state,
  });
}

function findProject(state: StoredState, projectId?: string): Project {
  const targetProjectId = projectId ?? state.activeProjectId;
  const project = state.projects.find((item) => item.id === targetProjectId);
  if (!project) {
    throw new Error('Project not found.');
  }
  return project;
}

function findPage(project: Project, pageId: string): PageCapture {
  const page = project.pages.find((item) => item.id === pageId);
  if (!page) {
    throw new Error('Page capture not found.');
  }
  return page;
}

function findRequirement(page: PageCapture, requirementId: string): RequirementPoint {
  const requirement = page.requirements.find((item) => item.id === requirementId);
  if (!requirement) {
    throw new Error('Requirement not found.');
  }
  return requirement;
}

function getRequirementElementIds(requirement: RequirementPoint): string[] {
  return [
    ...(requirement.anchorElementId ? [requirement.anchorElementId] : []),
    ...requirement.relatedElementIds,
  ];
}

function pruneUnusedElements(page: PageCapture): void {
  const referenced = new Set(
    page.requirements.flatMap((requirement) => getRequirementElementIds(requirement)),
  );

  page.elements = page.elements.filter((element) => referenced.has(element.id));
}

function mergeElement(page: PageCapture, element: ElementSnapshot): void {
  const existing = page.elements.find((item) => item.id === element.id);
  if (existing) {
    Object.assign(existing, element);
    return;
  }
  page.elements.push(element);
}

function upsertDataDependency(
  requirement: RequirementPoint,
  networkRecord: NetworkRecord,
  selectedFields: DataDependency['selectedFields'],
): void {
  const existing = requirement.dataDependencies.find(
    (item) => item.networkRecordId === networkRecord.id,
  );

  if (selectedFields.length === 0) {
    if (existing) {
      requirement.dataDependencies = requirement.dataDependencies.filter(
        (item) => item.networkRecordId !== networkRecord.id,
      );
    }
    return;
  }

  const payload: DataDependency = {
    networkRecordId: networkRecord.id,
    urlPattern: extractUrlPattern(networkRecord.url),
    method: networkRecord.method,
    selectedFields,
  };

  if (existing) {
    Object.assign(existing, payload);
    return;
  }

  requirement.dataDependencies.push(payload);
}

export async function createProject(name: string): Promise<Project> {
  const state = await getState();
  const timestamp = nowIso();
  const project: Project = {
    id: createId('proj'),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    pages: [],
  };

  state.projects.unshift(project);
  state.activeProjectId = project.id;

  await setState(state);
  return project;
}

export async function ensurePageCapture(tabId: number, url: string, title: string): Promise<PageCapture> {
  const state = await getState();
  let project = state.projects.find((item) => item.id === state.activeProjectId);

  if (!project) {
    project = {
      id: createId('proj'),
      name: DEFAULT_PROJECT_NAME,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      pages: [],
    };
    state.projects.unshift(project);
    state.activeProjectId = project.id;
  }

  const origin = getOrigin(url);

  // 1. Try the page already associated with this tab
  const existingPageId = state.runtime.activePageIdByTab[tabId];
  let page = existingPageId ? project.pages.find((item) => item.id === existingPageId) : undefined;

  // 2. If tab's page has a different origin, detach it
  if (page && getOrigin(page.url) !== origin) {
    page = undefined;
  }

  // 3. Search for any existing page with the same origin
  if (!page) {
    page = project.pages.find((p) => getOrigin(p.url) === origin);
  }

  if (page) {
    // Reuse existing page — update URL / title / tabId
    page.url = url;
    page.title = title;
    page.tabId = tabId;
  } else {
    // No matching page — create new
    page = {
      id: createId('page'),
      tabId,
      url,
      title,
      capturedAt: nowIso(),
      requirements: [],
      elements: [],
      networkRecords: [],
    };
    project.pages.unshift(page);
  }

  project.updatedAt = nowIso();
  state.runtime.activePageIdByTab[tabId] = page.id;

  await setState(state);
  return page;
}

export async function createRequirement(
  pageId: string,
  name: string,
  description = '',
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement: RequirementPoint = {
    id: createId('req'),
    name,
    description,
    relatedElementIds: [],
    dataDependencies: [],
  };

  page.requirements.unshift(requirement);
  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function updateRequirement(
  pageId: string,
  requirementId: string,
  patch: Partial<Pick<RequirementPoint, 'name' | 'description' | 'notes' | 'insertPosition'>>,
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement = findRequirement(page, requirementId);

  Object.assign(requirement, patch);
  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function attachPickedElement(
  pageId: string,
  requirementId: string,
  mode: 'anchor' | 'related',
  element: ElementSnapshot,
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement = findRequirement(page, requirementId);

  mergeElement(page, element);

  if (mode === 'anchor') {
    requirement.anchorElementId = element.id;
  } else if (!requirement.relatedElementIds.includes(element.id)) {
    requirement.relatedElementIds.push(element.id);
  }

  pruneUnusedElements(page);
  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function promoteToAnchor(
  pageId: string,
  requirementId: string,
  elementId: string,
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement = findRequirement(page, requirementId);

  // Move current anchor to related (if exists and different)
  if (requirement.anchorElementId && requirement.anchorElementId !== elementId) {
    if (!requirement.relatedElementIds.includes(requirement.anchorElementId)) {
      requirement.relatedElementIds.push(requirement.anchorElementId);
    }
  }

  // Set new anchor, remove from related
  requirement.anchorElementId = elementId;
  requirement.relatedElementIds = requirement.relatedElementIds.filter((id) => id !== elementId);

  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function appendNetworkRecord(pageId: string, record: NetworkRecord): Promise<void> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);

  const existingIndex = page.networkRecords.findIndex((item) => item.id === record.id);
  if (existingIndex >= 0) {
    page.networkRecords[existingIndex] = record;
  } else {
    page.networkRecords.unshift(record);
  }

  page.networkRecords = page.networkRecords.slice(0, MAX_NETWORK_RECORDS);
  project.updatedAt = nowIso();
  await setState(state);
}

export async function attachDataDependency(
  pageId: string,
  requirementId: string,
  networkRecordId: string,
  fields: DataDependency['selectedFields'],
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement = findRequirement(page, requirementId);
  const networkRecord = page.networkRecords.find((item) => item.id === networkRecordId);

  if (!networkRecord) {
    throw new Error('Network record not found.');
  }

  upsertDataDependency(requirement, networkRecord, fields);
  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function deleteRequirement(pageId: string, requirementId: string): Promise<void> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const nextRequirements = page.requirements.filter((item) => item.id !== requirementId);

  if (nextRequirements.length === page.requirements.length) {
    throw new Error('Requirement not found.');
  }

  page.requirements = nextRequirements;
  pruneUnusedElements(page);
  project.updatedAt = nowIso();
  await setState(state);
}

export async function removeRequirementElement(
  pageId: string,
  requirementId: string,
  elementId: string,
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement = findRequirement(page, requirementId);

  if (requirement.anchorElementId === elementId) {
    requirement.anchorElementId = undefined;
  }

  requirement.relatedElementIds = requirement.relatedElementIds.filter((item) => item !== elementId);
  pruneUnusedElements(page);
  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function removeDataDependency(
  pageId: string,
  requirementId: string,
  networkRecordId: string,
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement = findRequirement(page, requirementId);
  const nextDependencies = requirement.dataDependencies.filter(
    (item) => item.networkRecordId !== networkRecordId,
  );

  if (nextDependencies.length === requirement.dataDependencies.length) {
    throw new Error('Data dependency not found.');
  }

  requirement.dataDependencies = nextDependencies;
  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function removeDataDependencyField(
  pageId: string,
  requirementId: string,
  networkRecordId: string,
  fieldPath: string,
): Promise<RequirementPoint> {
  const state = await getState();
  const project = findProject(state);
  const page = findPage(project, pageId);
  const requirement = findRequirement(page, requirementId);
  const dependency = requirement.dataDependencies.find(
    (item) => item.networkRecordId === networkRecordId,
  );

  if (!dependency) {
    throw new Error('Data dependency not found.');
  }

  const nextFields = dependency.selectedFields.filter((field) => field.path !== fieldPath);
  if (nextFields.length === dependency.selectedFields.length) {
    throw new Error('Field binding not found.');
  }

  if (nextFields.length === 0) {
    requirement.dataDependencies = requirement.dataDependencies.filter(
      (item) => item.networkRecordId !== networkRecordId,
    );
  } else {
    dependency.selectedFields = nextFields;
  }

  project.updatedAt = nowIso();
  await setState(state);
  return requirement;
}

export async function getAppSnapshotForTab(tabId: number): Promise<{ project: Project; page: PageCapture; runtime: RuntimeSession }> {
  const state = await getState();
  const project = findProject(state);
  const pageId = state.runtime.activePageIdByTab[tabId];
  if (!pageId) {
    throw new Error('No active page capture for tab.');
  }

  const page = findPage(project, pageId);
  return {
    project,
    page,
    runtime: state.runtime,
  };
}

export async function getProject(projectId?: string): Promise<Project> {
  const state = await getState();
  return findProject(state, projectId);
}

function getPrimarySelector(element?: ElementSnapshot): string | undefined {
  if (!element) {
    return undefined;
  }

  return element.selectorCandidates.primaryCss ?? element.selectorCandidates.css[0] ?? element.selectorCandidates.xpath;
}

function formatElementMarkdownLines(label: string, element?: ElementSnapshot): string[] {
  if (!element) {
    return [`- ${label}: 未绑定`];
  }

  const primarySelector = getPrimarySelector(element);
  const fallbackSelectors = element.selectorCandidates.css.filter((selector) => selector !== primarySelector).slice(0, 2);
  const summary = `${element.tagName}${element.text ? ` · ${element.text}` : ''}`;

  return [
    `- ${label}: ${summary}`,
    ...(primarySelector ? [`  - 首选 selector: \`${primarySelector}\``] : []),
    ...(fallbackSelectors.length > 0
      ? [`  - 备用 selector: ${fallbackSelectors.map((selector) => `\`${selector}\``).join(' / ')}`]
      : []),
    ...(element.selectorCandidates.xpath ? [`  - XPath: \`${element.selectorCandidates.xpath}\``] : []),
    ...(element.htmlSnippet ? [`  - HTML: \`${element.htmlSnippet.slice(0, 300)}\``] : []),
    ...(element.computedStyle && Object.keys(element.computedStyle).length > 0
      ? [`  - 样式: ${Object.entries(element.computedStyle).map(([k, v]) => `${k}: ${v}`).join('; ')}`]
      : []),
    ...(element.context.parentTag ? [`  - 父元素: ${element.context.parentTag}`] : []),
    ...(element.context.parentText ? [`  - 父级文本: ${element.context.parentText}`] : []),
    ...(element.context.prevSiblingText ? [`  - 前相邻文本: ${element.context.prevSiblingText}`] : []),
    ...(element.context.nextSiblingText ? [`  - 后相邻文本: ${element.context.nextSiblingText}`] : []),
  ];
}

function formatNetworkRecord(record: NetworkRecord, index: number): string[] {
  const lines = [
    `#### 请求 ${index + 1}: ${record.method} ${record.url}`,
    `- 状态: ${record.status}`,
    ...(record.contentType ? [`- Content-Type: ${record.contentType}`] : []),
  ];

  if (record.requestBodyPreview) {
    lines.push('- 请求体:', '```', record.requestBodyPreview, '```');
  }

  if (record.responseJsonSample) {
    lines.push('- 响应 (JSON):', '```json', JSON.stringify(record.responseJsonSample, null, 2), '```');
  } else if (record.responsePreview) {
    lines.push('- 响应:', '```', record.responsePreview, '```');
  }

  lines.push('');
  return lines;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildRequestArtifactName(record: NetworkRecord, index: number): string {
  const url = (() => {
    try {
      return new URL(record.url);
    } catch {
      return undefined;
    }
  })();

  const slug = sanitizeFilename(
    [
      String(index + 1).padStart(3, '0'),
      record.method,
      url?.hostname ?? 'request',
      (url?.pathname ?? record.url).replace(/\//g, '_'),
    ].join('_'),
  );

  return `${slug || `request_${index + 1}`}.json`;
}

function buildMirrorPageFolderName(page: PageCapture, index: number): string {
  const slug = sanitizeFilename(`${String(index + 1).padStart(2, '0')}_${page.title || page.id}`);
  return slug || `page_${index + 1}`;
}

function buildMirrorEntryBaseName(payload: NetworkMirrorPayload): string {
  const url = (() => {
    try {
      return new URL(payload.url);
    } catch {
      return undefined;
    }
  })();

  const slug = sanitizeFilename(
    [
      String(payload.sequence).padStart(4, '0'),
      payload.method,
      url?.hostname ?? 'request',
      (url?.pathname ?? payload.url).replace(/\//g, '_'),
    ].join('_'),
  );

  return slug || `request_${payload.sequence}`;
}

function appendMirroredBody(
  zip: JSZip,
  basePath: string,
  kind: 'request' | 'response',
  body: MirroredBody | undefined,
  contentType?: string,
): string | undefined {
  if (!body) {
    return undefined;
  }

  const extension = contentTypeToExtension(contentType ?? (body.encoding === 'utf8' ? 'text/plain' : undefined));
  const filePath = `${basePath}/${kind}-body.${extension}`;
  if (body.encoding === 'base64') {
    zip.file(filePath, body.body, { base64: true });
  } else {
    zip.file(filePath, body.body);
  }
  return filePath;
}

function toMirrorExportSummary(payload: NetworkMirrorPayload): Record<string, unknown> {
  return {
    id: payload.id,
    pageId: payload.pageId,
    requestId: payload.requestId,
    sequence: payload.sequence,
    capturedAt: payload.capturedAt,
    url: payload.url,
    method: payload.method,
    resourceType: payload.resourceType,
    initiatorType: payload.initiatorType,
    requestHeaders: payload.requestHeaders,
    requestBodySize: payload.requestBody?.size,
    response: payload.response
      ? {
          status: payload.response.status,
          statusText: payload.response.statusText,
          protocol: payload.response.protocol,
          contentType: payload.response.contentType,
          headers: payload.response.headers,
          bodySize: payload.response.body?.size ?? payload.response.encodedDataLength,
          fromDiskCache: payload.response.fromDiskCache,
          fromServiceWorker: payload.response.fromServiceWorker,
          bodyUnavailable: payload.response.bodyUnavailable,
        }
      : undefined,
    failed: payload.failed,
    captureSource: payload.captureSource,
  };
}

function toMirrorViewerRecord(payload: NetworkMirrorPayload): Record<string, unknown> {
  const contentType = payload.response?.contentType ?? payload.response?.headers?.['content-type'];
  const responseText = mirroredBodyToText(payload.response?.body, contentType);

  return {
    id: payload.id,
    method: payload.method,
    status: payload.response?.status ?? 0,
    contentType,
    url: payload.url,
    responseJsonSample: responseText ? (() => {
      try {
        return summarizeJson(JSON.parse(responseText));
      } catch {
        return undefined;
      }
    })() : undefined,
    responsePreview: responseText ?? (payload.response?.body ? `[binary payload ${payload.response.body.size} bytes]` : ''),
    resourceType: payload.resourceType,
  };
}

function toMirrorNetworkRecord(payload: NetworkMirrorPayload): NetworkRecord {
  const contentType = payload.response?.contentType ?? payload.response?.headers?.['content-type'];
  const responseText = mirroredBodyToText(payload.response?.body, contentType);
  const requestContentType = payload.requestHeaders?.['content-type'];
  const requestText = mirroredBodyToText(payload.requestBody, requestContentType);

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
    requestBodyPreview: requestText ?? (payload.requestBody ? `[binary payload ${payload.requestBody.size} bytes]` : undefined),
    requestBodySize: payload.requestBody?.size,
    responseHeaders: payload.response?.headers,
    responsePreview: responseText ?? (payload.response?.body ? `[binary payload ${payload.response.body.size} bytes]` : undefined),
    responseBodySize: payload.response?.body?.size ?? payload.response?.encodedDataLength,
    responseJsonSample: responseText ? (() => {
      try {
        return summarizeJson(JSON.parse(responseText));
      } catch {
        return undefined;
      }
    })() : undefined,
    initiatorType: payload.initiatorType,
    fromDiskCache: payload.response?.fromDiskCache,
    fromServiceWorker: payload.response?.fromServiceWorker,
    failedReason: payload.failed?.errorText,
    captureSource: payload.captureSource,
    mirrorStored: true,
    timestamp: payload.capturedAt,
  };
}

function buildOfflineViewerHtml(payload: unknown): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Offline Snapshot Viewer</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3f4f6;
        --panel: #ffffff;
        --ink: #111827;
        --muted: #6b7280;
        --line: #e5e7eb;
        --accent: #111827;
        --soft: #f9fafb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
        color: var(--ink);
      }
      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 24px;
      }
      .hero, .panel {
        background: rgba(255,255,255,0.95);
        border: 1px solid rgba(17,24,39,0.08);
        border-radius: 20px;
        box-shadow: 0 20px 48px rgba(15,23,42,0.08);
      }
      .hero { padding: 24px; }
      .hero h1 { margin: 0; font-size: 28px; }
      .hero p { margin: 10px 0 0; color: var(--muted); line-height: 1.7; }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 999px;
        background: var(--soft);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .actions a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--ink);
        background: #fff;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
      }
      .actions a.primary {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
      }
      .grid {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 16px;
        margin-top: 16px;
      }
      .panel { padding: 18px; }
      .panel h2 {
        margin: 0 0 12px;
        font-size: 15px;
      }
      .metric-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .metric {
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--soft);
      }
      .metric .label { font-size: 11px; color: var(--muted); }
      .metric .value { margin-top: 6px; font-size: 20px; font-weight: 800; }
      .empty {
        padding: 14px;
        border: 1px dashed var(--line);
        border-radius: 14px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.7;
      }
      .req-item, .net-item {
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #fff;
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .req-item h3, .net-item h3 {
        margin: 0;
        font-size: 14px;
      }
      .subtle {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.7;
        word-break: break-all;
      }
      .tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }
      .tag {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: #eef2ff;
        color: #3730a3;
        font-size: 11px;
        font-weight: 700;
      }
      details {
        margin-top: 10px;
      }
      summary {
        cursor: pointer;
        color: #1f2937;
        font-size: 12px;
        font-weight: 700;
      }
      pre {
        margin: 10px 0 0;
        padding: 12px;
        border-radius: 14px;
        background: #0f172a;
        color: #e5e7eb;
        font-size: 11px;
        line-height: 1.6;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      @media (max-width: 920px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1 id="page-title"></h1>
        <p id="page-desc"></p>
        <div class="meta" id="meta"></div>
        <div class="actions" id="actions"></div>
      </section>
      <section class="grid">
        <div class="stack">
          <div class="panel">
            <h2>导出概览</h2>
            <div class="metric-list" id="metrics"></div>
          </div>
          <div class="panel">
            <h2>使用说明</h2>
            <div class="empty" id="usage"></div>
          </div>
        </div>
        <div class="stack">
          <div class="panel">
            <h2>需求点</h2>
            <div class="stack" id="requirements"></div>
          </div>
          <div class="panel">
            <h2>已采集网络请求</h2>
            <div class="stack" id="network"></div>
          </div>
        </div>
      </section>
    </main>
    <script id="offline-data" type="application/json">${safeJsonForScript(payload)}</script>
    <script>
      const data = JSON.parse(document.getElementById('offline-data').textContent || '{}');
      const page = data.page || {};
      const files = data.files || {};

      document.getElementById('page-title').textContent = page.title || 'Offline Snapshot';
      document.getElementById('page-desc').textContent = page.url || '未记录页面地址';

      const meta = [
        '导出时间：' + (data.exportedAt || '-'),
        '项目：' + (data.projectName || '-'),
        '页面采集时间：' + (page.capturedAt || '-'),
      ];
      document.getElementById('meta').innerHTML = meta.map((item) => '<span class="chip">' + item + '</span>').join('');

      const actions = [];
      if (files.snapshotMhtml) {
        actions.push('<a class="primary" href="' + files.snapshotMhtml + '">打开静态页面快照</a>');
      }
      if (files.pageHtml) {
        actions.push('<a href="' + files.pageHtml + '">查看 DOM 源码</a>');
      }
      if (files.projectJson) {
        actions.push('<a href="' + files.projectJson + '">查看 project.json</a>');
      }
      if (files.networkJson) {
        actions.push('<a href="' + files.networkJson + '">查看 network-records.json</a>');
      }
      if (files.mirrorManifest) {
        actions.push('<a href="' + files.mirrorManifest + '">查看 mirror/manifest.json</a>');
      }
      document.getElementById('actions').innerHTML = actions.join('');

      const metrics = [
        ['需求点', String((page.requirements || []).length)],
        ['网络请求', String((page.networkRecords || []).length)],
        ['页面源码', files.pageHtml ? '已导出' : '未导出'],
        ['MHTML 快照', files.snapshotMhtml ? '已导出' : '未导出'],
        ['Mirror 原文', files.mirrorManifest ? '已导出' : '未导出'],
      ];
      document.getElementById('metrics').innerHTML = metrics.map(([label, value]) => (
        '<div class="metric"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>'
      )).join('');

      document.getElementById('usage').innerHTML = [
        files.snapshotMhtml
          ? '1. 先解压 zip，再打开“打开静态页面快照”。Chrome 系浏览器加载 MHTML 更稳定。'
          : '1. 当前导出未生成 MHTML，可先查看 DOM 源码和请求数据。',
        files.mirrorManifest
          ? '2. mirror 目录保存了请求/响应原文，可直接用于离线重放、对照分析或喂给外部工具。'
          : '2. 当前包只包含网络摘要；若需原始请求与响应，请先等待镜像采集完成。',
        '3. 这个包更适合离线分析、还原页面结构、编写前端代码，不适合真实写操作联调。',
        '4. 如果页面依赖 WebSocket、Service Worker、IndexedDB，静态快照不会完整复原。',
      ].map((item) => '<div>' + item + '</div>').join('');

      const requirements = page.requirements || [];
      const reqRoot = document.getElementById('requirements');
      if (requirements.length === 0) {
        reqRoot.innerHTML = '<div class="empty">当前页面没有需求点。你仍然可以使用这个包查看静态页面与网络记录。</div>';
      } else {
        reqRoot.innerHTML = requirements.map((item) => {
          const tags = [];
          if (item.insertPosition) tags.push('<span class="tag">插入位置：' + item.insertPosition + '</span>');
          if (item.anchorSummary) tags.push('<span class="tag">锚点：' + item.anchorSummary + '</span>');
          if (item.relatedCount) tags.push('<span class="tag">相关元素：' + item.relatedCount + '</span>');
          if (item.dataDependencyCount) tags.push('<span class="tag">字段绑定：' + item.dataDependencyCount + '</span>');
          return [
            '<div class="req-item">',
            '<h3>' + item.name + '</h3>',
            item.description ? '<div class="subtle">' + item.description + '</div>' : '',
            item.notes ? '<div class="subtle">备注：' + item.notes + '</div>' : '',
            tags.length > 0 ? '<div class="tag-row">' + tags.join('') + '</div>' : '',
            '</div>',
          ].join('');
        }).join('');
      }

      const network = page.networkRecords || [];
      const networkRoot = document.getElementById('network');
      if (network.length === 0) {
        networkRoot.innerHTML = '<div class="empty">当前页面没有捕获到网络请求。</div>';
      } else {
        networkRoot.innerHTML = network.map((record) => {
          const preview = record.responseJsonSample
            ? JSON.stringify(record.responseJsonSample, null, 2)
            : (record.responsePreview || '');
          const escapedPreview = preview
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return [
            '<div class="net-item">',
            '<h3>' + record.method + ' · ' + record.status + '</h3>',
            '<div class="subtle">' + record.url + '</div>',
            record.contentType ? '<div class="tag-row"><span class="tag">' + record.contentType + '</span></div>' : '',
            preview
              ? '<details><summary>查看响应摘要</summary><pre>' + escapedPreview + '</pre></details>'
              : '',
            '</div>',
          ].join('');
        }).join('');
      }
    </script>
  </body>
</html>`;
}

export async function buildExportZip(
  projectId: string,
  artifacts: ExportBundleArtifacts = {},
): Promise<Blob> {
  const project = await getProject(projectId);
  const zip = new JSZip();
  const exportedAt = nowIso();
  const focusPage = project.pages.find((page) => page.id === artifacts.focusPageId) ?? project.pages[0];
  const pageHtmlPath = artifacts.pageHtml ? 'snapshot/page-source.html' : undefined;
  const pageMhtmlPath = artifacts.pageMhtml ? 'snapshot/page-snapshot.mhtml' : undefined;
  const mirrorPayloadsByPage = new Map<string, NetworkMirrorPayload[]>(
    await Promise.all(
      project.pages.map(async (page) => [page.id, await listMirrorPayloadsByPage(page.id)] as const),
    ),
  );
  const exportNetworkRecordsByPage = new Map<string, NetworkRecord[]>(
    project.pages.map((page) => {
      const mirrored = mirrorPayloadsByPage.get(page.id) ?? [];
      return [page.id, mirrored.length > 0 ? mirrored.map(toMirrorNetworkRecord) : page.networkRecords] as const;
    }),
  );
  const allNetworkRecords = project.pages.flatMap((page) => exportNetworkRecordsByPage.get(page.id) ?? []);

  // Full structured data
  zip.file(
    'data/project.json',
    JSON.stringify({ version: '0.1.0', project, exportedAt }, null, 2),
  );

  // AI context markdown — includes everything
  const totalRequirements = project.pages.reduce((n, p) => n + p.requirements.length, 0);
  const totalElements = project.pages.reduce((n, p) => n + p.elements.length, 0);
  const totalNetworkRecords = allNetworkRecords.length;

  const markdown: string[] = [
    `# ${project.name}`,
    '',
    '## 概览',
    `- 页面数: ${project.pages.length}`,
    `- 需求点数: ${totalRequirements}`,
    `- 采集元素数: ${totalElements}`,
    `- 网络请求数: ${totalNetworkRecords}`,
    `- 导出时间: ${exportedAt}`,
    ...(artifacts.pageHtml ? [`- 页面源码: ${pageHtmlPath} (${Math.round(artifacts.pageHtml.length / 1024)}KB)`] : []),
    ...(artifacts.pageMhtml ? [`- 静态页面快照: ${pageMhtmlPath}`] : []),
    '',
  ];

  for (const page of project.pages) {
    const pageNetworkRecords = exportNetworkRecordsByPage.get(page.id) ?? [];
    markdown.push(
      `## ${page.title}`,
      `- URL: ${page.url}`,
      `- 采集时间: ${page.capturedAt}`,
      '',
    );

    // Requirements
    if (page.requirements.length > 0) {
      markdown.push('### 需求点', '');
      for (const requirement of page.requirements) {
        const anchor = page.elements.find((e) => e.id === requirement.anchorElementId);
        const relatedElements = page.elements.filter((e) => requirement.relatedElementIds.includes(e.id));

        markdown.push(`#### ${requirement.name}`);
        if (requirement.description) markdown.push(requirement.description);
        if (requirement.insertPosition) markdown.push(`- 插入位置: ${requirement.insertPosition}`);
        if (requirement.notes) markdown.push(`- 备注: ${requirement.notes}`);

        markdown.push(...formatElementMarkdownLines('锚点元素', anchor));
        if (relatedElements.length > 0) {
          markdown.push('- 相关元素:');
          relatedElements.forEach((el, i) => {
            markdown.push(...formatElementMarkdownLines(`相关元素 ${i + 1}`, el));
          });
        }

        if (requirement.dataDependencies.length > 0) {
          markdown.push('- 用户标记的关键数据依赖:');
          for (const dep of requirement.dataDependencies) {
            markdown.push(`  - ${dep.method} ${dep.urlPattern}`);
            dep.selectedFields.forEach((f) => {
              markdown.push(`    - ${f.path}${f.exampleValue ? ` = ${f.exampleValue}` : ''}`);
            });
          }
        }
        markdown.push('');
      }
    }

    // ALL network requests
    if (pageNetworkRecords.length > 0) {
      markdown.push('### 所有网络请求', '');
      pageNetworkRecords.forEach((record, index) => {
        markdown.push(...formatNetworkRecord(record, index));
      });
    }
  }

  zip.folder('prompts')?.file('ai-context.md', markdown.join('\n'));

  // Page HTML source
  if (artifacts.pageHtml && pageHtmlPath) {
    zip.file(pageHtmlPath, artifacts.pageHtml);
  }

  // MHTML page snapshot
  if (artifacts.pageMhtml && pageMhtmlPath) {
    zip.file(pageMhtmlPath, artifacts.pageMhtml);
  }

  // Screenshots
  const screenshotFolder = zip.folder('screenshots');
  (artifacts.screenshots ?? []).forEach((screenshot) => {
    const base64 = screenshot.dataUrl.split(',')[1];
    if (base64) {
      screenshotFolder?.file(screenshot.name, base64, { base64: true });
    }
  });

  // Network requests as separate JSON for AI tools that prefer structured data
  if (allNetworkRecords.length > 0) {
    zip.file('data/network-records.json', JSON.stringify(allNetworkRecords, null, 2));
  }

  const allMirrorManifestEntries: Array<Record<string, unknown>> = [];
  project.pages.forEach((page, pageIndex) => {
    const mirroredPayloads = mirrorPayloadsByPage.get(page.id) ?? [];
    if (mirroredPayloads.length === 0) {
      return;
    }

    const pageFolderName = buildMirrorPageFolderName(page, pageIndex);
    mirroredPayloads.forEach((payload) => {
      const baseName = buildMirrorEntryBaseName(payload);
      const basePath = `mirror/${pageFolderName}/${baseName}`;
      const requestContentType = payload.requestHeaders?.['content-type'];
      const responseContentType = payload.response?.contentType ?? payload.response?.headers?.['content-type'];
      const requestBodyPath = appendMirroredBody(zip, basePath, 'request', payload.requestBody, requestContentType);
      const responseBodyPath = appendMirroredBody(zip, basePath, 'response', payload.response?.body, responseContentType);
      const manifestEntry = {
        pageId: page.id,
        pageTitle: page.title,
        ...toMirrorExportSummary(payload),
        requestBodyPath,
        responseBodyPath,
      };

      allMirrorManifestEntries.push(manifestEntry);
      zip.file(`${basePath}/metadata.json`, JSON.stringify(manifestEntry, null, 2));
    });
  });

  if (allMirrorManifestEntries.length > 0) {
    zip.file('mirror/manifest.json', JSON.stringify(allMirrorManifestEntries, null, 2));
  }

  if (focusPage) {
    const requestFolder = zip.folder('data/requests');
    const focusPageNetworkRecords = exportNetworkRecordsByPage.get(focusPage.id) ?? [];
    focusPageNetworkRecords.forEach((record, index) => {
      requestFolder?.file(
        buildRequestArtifactName(record, index),
        JSON.stringify(
          {
            order: index + 1,
            pageTitle: focusPage.title,
            pageUrl: focusPage.url,
            ...record,
          },
          null,
          2,
        ),
      );
    });
    const focusMirrorPayloads = mirrorPayloadsByPage.get(focusPage.id) ?? [];

    const viewerPayload = {
      exportedAt,
      projectName: project.name,
      page: {
        id: focusPage.id,
        title: focusPage.title,
        url: focusPage.url,
        capturedAt: focusPage.capturedAt,
        requirements: focusPage.requirements.map((requirement) => {
          const anchor = focusPage.elements.find((item) => item.id === requirement.anchorElementId);
          return {
            id: requirement.id,
            name: requirement.name,
            description: requirement.description,
            notes: requirement.notes,
            insertPosition: requirement.insertPosition,
            anchorSummary: anchor ? `${anchor.tagName}${anchor.text ? ` · ${anchor.text}` : ''}` : undefined,
            relatedCount: requirement.relatedElementIds.length,
            dataDependencyCount: requirement.dataDependencies.reduce((count, dep) => count + dep.selectedFields.length, 0),
          };
        }),
        networkRecords: focusMirrorPayloads.length > 0
          ? focusMirrorPayloads.map(toMirrorViewerRecord)
          : focusPageNetworkRecords,
      },
      files: {
        snapshotMhtml: pageMhtmlPath,
        pageHtml: pageHtmlPath,
        projectJson: 'data/project.json',
        networkJson: 'data/network-records.json',
        mirrorManifest: allMirrorManifestEntries.length > 0 ? 'mirror/manifest.json' : undefined,
      },
    };

    zip.file('index.html', buildOfflineViewerHtml(viewerPayload));
  } else {
    zip.file(
      'index.html',
      `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8" /><title>Offline Snapshot</title><body style="font-family: sans-serif; padding: 24px;">没有可导出的页面数据。</body></html>`,
    );
  }

  return zip.generateAsync({ type: 'blob' });
}
