import {
  MAX_JSON_DEPTH,
  MAX_JSON_KEYS,
  MAX_PREVIEW_CHARS,
} from '@/shared/constants';
import type { FlatJsonField } from '@/shared/types';

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
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
