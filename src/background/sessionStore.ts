import JSZip from 'jszip';
import { DEFAULT_PROJECT_NAME, MAX_NETWORK_RECORDS, STORAGE_KEY } from '@/shared/constants';
import type {
  DataDependency,
  ElementSnapshot,
  NetworkRecord,
  PageCapture,
  Project,
  RequirementPoint,
  RuntimeSession,
  StoredState,
} from '@/shared/types';
import { createId, extractUrlPattern, nowIso } from '@/shared/utils';

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

  const existingPageId = state.runtime.activePageIdByTab[tabId];
  let page = existingPageId ? project.pages.find((item) => item.id === existingPageId) : undefined;

  if (!page || page.url !== url) {
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
  } else {
    page.url = url;
    page.title = title;
    page.tabId = tabId;
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

export async function buildExportZip(
  projectId: string,
  screenshots: Array<{ name: string; dataUrl: string }> = [],
  pageHtml?: string,
): Promise<Blob> {
  const project = await getProject(projectId);
  const zip = new JSZip();

  // Full structured data
  zip.file(
    'project.json',
    JSON.stringify({ version: '0.1.0', project, exportedAt: nowIso() }, null, 2),
  );

  // AI context markdown — includes everything
  const markdown: string[] = [
    `# ${project.name}`,
    '',
  ];

  for (const page of project.pages) {
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
    if (page.networkRecords.length > 0) {
      markdown.push('### 所有网络请求', '');
      page.networkRecords.forEach((record, index) => {
        markdown.push(...formatNetworkRecord(record, index));
      });
    }
  }

  zip.folder('prompts')?.file('ai-context.md', markdown.join('\n'));

  // Page HTML source
  if (pageHtml) {
    zip.file('page-source.html', pageHtml);
  }

  // Screenshots
  const screenshotFolder = zip.folder('screenshots');
  screenshots.forEach((screenshot) => {
    const base64 = screenshot.dataUrl.split(',')[1];
    if (base64) {
      screenshotFolder?.file(screenshot.name, base64, { base64: true });
    }
  });

  // Network requests as separate JSON for AI tools that prefer structured data
  for (const page of project.pages) {
    if (page.networkRecords.length > 0) {
      zip.file(
        'network-records.json',
        JSON.stringify(page.networkRecords, null, 2),
      );
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
