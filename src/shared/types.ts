export type Id = string;

export type InsertPosition = 'before' | 'after' | 'inside-start' | 'inside-end';

export const INSERT_POSITION_LABELS: Record<InsertPosition, string> = {
  'before': '前面',
  'after': '后面',
  'inside-start': '内部开头',
  'inside-end': '内部末尾',
};

export type SelectorCandidates = {
  primaryCss?: string;
  css: string[];
  xpath?: string;
};

export type NetworkBodyEncoding = 'utf8' | 'base64';

export type MirroredBody = {
  encoding: NetworkBodyEncoding;
  body: string;
  size: number;
};

export type ElementRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElementContext = {
  parentTag?: string;
  parentText?: string;
  prevSiblingText?: string;
  nextSiblingText?: string;
};

export type ElementSnapshot = {
  id: Id;
  tagName: string;
  text: string;
  htmlSnippet?: string;
  attributes: Record<string, string>;
  computedStyle?: Record<string, string>;
  selectorCandidates: SelectorCandidates;
  rect: ElementRect;
  context: ElementContext;
};

export type NetworkRecord = {
  id: Id;
  url: string;
  method: string;
  status: number;
  statusText?: string;
  resourceType?: string;
  protocol?: string;
  contentType?: string;
  requestHeaders?: Record<string, string>;
  requestBodyPreview?: string;
  requestBodySize?: number;
  responseHeaders?: Record<string, string>;
  responsePreview?: string;
  responseBodySize?: number;
  responseJsonSample?: unknown;
  initiatorType?: string;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
  failedReason?: string;
  captureSource?: 'debugger' | 'injected';
  mirrorStored?: boolean;
  timestamp: number;
};

export type NetworkMirrorPayload = {
  id: Id;
  pageId: Id;
  tabId?: number;
  requestId: string;
  sequence: number;
  capturedAt: number;
  url: string;
  method: string;
  resourceType?: string;
  initiatorType?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: MirroredBody;
  response?: {
    status: number;
    statusText?: string;
    protocol?: string;
    contentType?: string;
    headers?: Record<string, string>;
    body?: MirroredBody;
    bodyUnavailable?: boolean;
    fromDiskCache?: boolean;
    fromServiceWorker?: boolean;
    encodedDataLength?: number;
  };
  failed?: {
    errorText: string;
    canceled?: boolean;
    blockedReason?: string;
    corsErrorStatus?: string;
  };
  captureSource: 'debugger' | 'injected';
};

export type FieldSelection = {
  path: string;
  label?: string;
  exampleValue?: string;
  displayedInCurrentPage: boolean;
  intendedUsage?: string;
};

export type DataDependency = {
  networkRecordId: Id;
  urlPattern: string;
  method: string;
  selectedFields: FieldSelection[];
};

export type RequirementPoint = {
  id: Id;
  name: string;
  description: string;
  anchorElementId?: Id;
  relatedElementIds: Id[];
  insertPosition?: InsertPosition;
  dataDependencies: DataDependency[];
  notes?: string;
};

export type PageCapture = {
  id: Id;
  tabId?: number;
  url: string;
  title: string;
  capturedAt: string;
  requirements: RequirementPoint[];
  elements: ElementSnapshot[];
  networkRecords: NetworkRecord[];
};

export type Project = {
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: PageCapture[];
};

export type RuntimeSession = {
  activePageIdByTab: Record<number, Id | undefined>;
};

export type StoredState = {
  projects: Project[];
  activeProjectId?: Id;
  runtime: RuntimeSession;
};

export type AppSnapshot = {
  project: Project;
  page: PageCapture;
  runtime: RuntimeSession;
};

export type PageInspectionContext = {
  url: string;
  title: string;
  htmlSize: number;
  htmlPreview: string;
  scriptUrls: string[];
  inlineScriptCount: number;
  detectedFrameworks: string[];
  collectedAt: string;
};

export type ExportBundle = {
  version: '0.1.0';
  project: Project;
  exportedAt: string;
};

export type FlatJsonField = {
  path: string;
  exampleValue: string;
};
