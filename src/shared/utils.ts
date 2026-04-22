import {
  MAX_JSON_DEPTH,
  MAX_JSON_KEYS,
  MAX_PREVIEW_CHARS,
} from '@/shared/constants';
import type { FlatJsonField, MirroredBody } from '@/shared/types';

export function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export function createId(prefix: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export function createStableId(prefix: string, seed: string): string {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function truncateText(value: string | null | undefined, max = MAX_PREVIEW_CHARS): string {
  if (!value) {
    return '';
  }

  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function safeJsonParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function byteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function estimateBase64Size(value: string): number {
  const normalized = value.replace(/\s+/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function isLikelyTextContentType(contentType?: string): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith('text/')
    || normalized.includes('json')
    || normalized.includes('javascript')
    || normalized.includes('xml')
    || normalized.includes('html')
    || normalized.includes('svg')
    || normalized.includes('form-urlencoded')
  );
}

export function decodeBase64Utf8(value: string): string | undefined {
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

export function mirroredBodyToText(body?: MirroredBody, contentType?: string): string | undefined {
  if (!body) {
    return undefined;
  }

  if (body.encoding === 'utf8') {
    return body.body;
  }

  if (!isLikelyTextContentType(contentType)) {
    return undefined;
  }

  return decodeBase64Utf8(body.body);
}

export function summarizeJson(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= MAX_JSON_DEPTH) {
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`;
    }

    if (typeof value === 'object') {
      return '[Object]';
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => summarizeJson(item, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_JSON_KEYS);
    return Object.fromEntries(entries.map(([key, item]) => [key, summarizeJson(item, depth + 1)]));
  }

  if (typeof value === 'string') {
    return truncateText(value, 300);
  }

  return value;
}

export function extractUrlPattern(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, 'https://placeholder.local');
    return url.pathname || rawUrl;
  } catch {
    return rawUrl.split('?')[0] || rawUrl;
  }
}

export function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'export';
}

export function contentTypeToExtension(contentType?: string): string {
  if (!contentType) {
    return 'bin';
  }

  const normalized = contentType.toLowerCase().split(';')[0].trim();
  const direct = normalized.split('/')[1];

  switch (normalized) {
    case 'application/json':
    case 'text/json':
      return 'json';
    case 'text/plain':
      return 'txt';
    case 'text/html':
      return 'html';
    case 'text/css':
      return 'css';
    case 'application/javascript':
    case 'text/javascript':
      return 'js';
    case 'application/xml':
    case 'text/xml':
      return 'xml';
    case 'image/svg+xml':
      return 'svg';
    case 'application/x-www-form-urlencoded':
      return 'txt';
    default:
      break;
  }

  if (!direct) {
    return 'bin';
  }

  return direct.replace(/[^a-z0-9]+/g, '') || 'bin';
}

export function maskSensitiveValue(value: string): string {
  return value
    .replace(/\b(1\d{2})\d{4}(\d{4})\b/g, '$1****$2')
    .replace(/\b([\w.-])([\w.-]*)(@[\w.-]+)\b/g, (_, first, middle, domain) => {
      const masked = String(middle)
        .slice(0, 2)
        .replace(/./g, '*');
      return `${first}${masked}${domain}`;
    })
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, (token) => `${token.slice(0, 6)}***${token.slice(-4)}`);
}

export function flattenJsonFields(value: unknown, prefix = ''): FlatJsonField[] {
  if (value === null || value === undefined) {
    return prefix ? [{ path: prefix, exampleValue: String(value) }] : [];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return prefix ? [{ path: `${prefix}[]`, exampleValue: '[]' }] : [];
    }

    return flattenJsonFields(value[0], `${prefix}[0]`);
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return flattenJsonFields(nested, nextPrefix);
    });
  }

  return prefix
    ? [
        {
          path: prefix,
          exampleValue: truncateText(String(value), 120),
        },
      ]
    : [];
}

export function toPlainHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

export function parseRawHeaders(rawHeaders: string): Record<string, string> {
  const output: Record<string, string> = {};
  rawHeaders
    .trim()
    .split(/[\r\n]+/)
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) {
        return;
      }
      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      output[key] = value;
    });
  return output;
}

export function isSupportedPageUrl(rawUrl?: string): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const { protocol } = new URL(rawUrl);
    return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
  } catch {
    return false;
  }
}

export function getSupportedPageError(rawUrl?: string): string {
  if (!rawUrl) {
    return '无法识别当前页面地址。请切换到普通网页后重试。';
  }

  try {
    const { protocol } = new URL(rawUrl);

    if (protocol === 'file:') {
      return '当前是本地文件页面。请先在扩展详情页开启“允许访问文件网址”，再刷新页面后重试。';
    }

    if (
      protocol === 'chrome:'
      || protocol === 'edge:'
      || protocol === 'about:'
      || protocol === 'chrome-extension:'
      || protocol === 'extension:'
      || protocol === 'devtools:'
    ) {
      return '当前页面是浏览器受限页面，无法注入扩展脚本。请切换到普通网页后再试。';
    }

    return `当前页面协议 ${protocol} 不支持元素选择。请切换到普通网页后重试。`;
  } catch {
    return '当前页面地址无效，无法注入扩展脚本。';
  }
}
