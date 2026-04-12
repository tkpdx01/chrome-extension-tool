import type { SelectorCandidates } from '@/shared/types';

const STABLE_ATTRIBUTE_CANDIDATES = [
  'data-testid',
  'data-test',
  'data-qa',
  'data-cy',
  'data-id',
  'name',
  'aria-label',
  'placeholder',
  'title',
  'alt',
  'role',
  'type',
] as const;

const VOLATILE_CLASS_PATTERN = /^(active|selected|open|hover|focus|disabled|hidden|visible)$/i;
const FRAMEWORK_TOKEN_PATTERN = /^(css|jsx|jss|sc|emotion|chakra|mantine|ant|mui)-[a-z0-9_-]{5,}$/i;

function escapeCssIdentifier(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isLikelyStableToken(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (normalized.length > 100 || normalized.includes('\n')) {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return false;
  }

  if (/^[a-f0-9]{8,}$/i.test(normalized)) {
    return false;
  }

  if (FRAMEWORK_TOKEN_PATTERN.test(normalized)) {
    return false;
  }

  if (/[0-9]{6,}/.test(normalized)) {
    return false;
  }

  return true;
}

function isUniqueSelectorMatch(element: Element, selector: string): boolean {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

function appendNthOfType(tag: string, element: Element): string {
  const siblings = element.parentElement
    ? Array.from(element.parentElement.children).filter((child) => child.tagName === element.tagName)
    : [];

  if (siblings.length <= 1) {
    return tag;
  }

  return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`;
}

function getStableClasses(element: Element): string[] {
  return Array.from(element.classList)
    .map((item) => item.trim())
    .filter(
      (item, index, classes) =>
        item &&
        index === classes.indexOf(item) &&
        !VOLATILE_CLASS_PATTERN.test(item) &&
        isLikelyStableToken(item),
    );
}

function getStableAttributeEntries(element: Element): Array<[string, string]> {
  const selected: Array<[string, string]> = [];
  const seen = new Set<string>();

  STABLE_ATTRIBUTE_CANDIDATES.forEach((attribute) => {
    const value = element.getAttribute(attribute);
    if (!value || !isLikelyStableToken(value)) {
      return;
    }

    selected.push([attribute, value]);
    seen.add(attribute);
  });

  Array.from(element.attributes)
    .filter((attribute) => attribute.name.startsWith('data-') && !seen.has(attribute.name))
    .forEach((attribute) => {
      if (!isLikelyStableToken(attribute.value)) {
        return;
      }
      selected.push([attribute.name, attribute.value]);
    });

  return selected;
}

function buildAttributeSelector(tag: string, attribute: string, value: string, includeTag: boolean): string {
  const segment = `[${attribute}="${escapeAttributeValue(value)}"]`;
  return includeTag ? `${tag}${segment}` : segment;
}

function buildClassSelector(tag: string, classes: string[], count: number): string | undefined {
  const selected = classes.slice(0, count);
  if (selected.length === 0) {
    return undefined;
  }
  return `${tag}.${selected.map(escapeCssIdentifier).join('.')}`;
}

function buildPathSegment(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const attributes = getStableAttributeEntries(element);
  if (attributes.length > 0) {
    const [attribute, value] = attributes[0];
    return buildAttributeSelector(tag, attribute, value, true);
  }

  const classes = getStableClasses(element);
  const classSelector = buildClassSelector(tag, classes, Math.min(classes.length, 2));
  if (classSelector) {
    return classSelector;
  }

  return appendNthOfType(tag, element);
}

function buildDirectSelectors(element: Element): string[] {
  const tag = element.tagName.toLowerCase();
  const candidates: string[] = [];

  const id = element.id?.trim();
  if (id && isLikelyStableToken(id)) {
    const escapedId = escapeCssIdentifier(id);
    candidates.push(`#${escapedId}`, `${tag}#${escapedId}`);
  }

  const attributes = getStableAttributeEntries(element);
  attributes.slice(0, 4).forEach(([attribute, value]) => {
    candidates.push(
      buildAttributeSelector(tag, attribute, value, true),
      buildAttributeSelector(tag, attribute, value, false),
    );
  });

  for (let index = 0; index < Math.min(attributes.length, 3); index += 1) {
    for (let nextIndex = index + 1; nextIndex < Math.min(attributes.length, 4); nextIndex += 1) {
      const [firstAttribute, firstValue] = attributes[index];
      const [secondAttribute, secondValue] = attributes[nextIndex];
      candidates.push(
        `${tag}[${firstAttribute}="${escapeAttributeValue(firstValue)}"][${secondAttribute}="${escapeAttributeValue(secondValue)}"]`,
      );
    }
  }

  const classes = getStableClasses(element);
  const classSelector = buildClassSelector(tag, classes, Math.min(classes.length, 2));
  if (classSelector) {
    candidates.push(classSelector);
  }

  const richerClassSelector = buildClassSelector(tag, classes, Math.min(classes.length, 3));
  if (richerClassSelector && richerClassSelector !== classSelector) {
    candidates.push(richerClassSelector);
  }

  return candidates.filter((selector, index, list) => list.indexOf(selector) === index);
}

function buildRelativePath(ancestor: Element, element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== ancestor) {
    segments.unshift(buildPathSegment(current));
    current = current.parentElement;
  }

  return segments.join(' > ');
}

function buildAncestorScopedSelectors(element: Element): string[] {
  const selectors: string[] = [];
  let ancestor = element.parentElement;
  let depth = 0;

  while (ancestor && depth < 4) {
    const anchorSelectors = buildDirectSelectors(ancestor);
    if (anchorSelectors.length > 0) {
      const relativePath = buildRelativePath(ancestor, element);
      anchorSelectors.slice(0, 2).forEach((anchorSelector) => {
        selectors.push(`${anchorSelector} ${relativePath}`);
      });
    }

    ancestor = ancestor.parentElement;
    depth += 1;
  }

  return selectors;
}

function buildDomPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    segments.unshift(appendNthOfType(current.tagName.toLowerCase(), current));
    if (current.tagName.toLowerCase() === 'body') {
      break;
    }
    current = current.parentElement;
  }

  return segments.join(' > ');
}

function toXPathLiteral(value: string): string {
  if (!value.includes('"')) {
    return `"${value}"`;
  }

  if (!value.includes("'")) {
    return `'${value}'`;
  }

  return `concat("${value.replace(/"/g, '", \'"\', "')}")`;
}

export function buildXPath(element: Element): string {
  const id = element.id?.trim();
  if (id && isLikelyStableToken(id)) {
    return `//*[@id=${toXPathLiteral(id)}]`;
  }

  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const siblings = current.parentNode
      ? Array.from(current.parentNode.childNodes).filter(
          (node) => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === current?.tagName,
        )
      : [];
    const index = siblings.indexOf(current) + 1;
    segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }

  return `/${segments.join('/')}`;
}

export function buildSelectorCandidates(element: Element): SelectorCandidates {
  const orderedSelectors = [
    ...buildDirectSelectors(element),
    ...buildAncestorScopedSelectors(element),
    buildDomPath(element),
  ];

  const css = orderedSelectors.filter(
    (selector, index, selectors) =>
      selectors.indexOf(selector) === index && isUniqueSelectorMatch(element, selector),
  );

  return {
    primaryCss: css[0],
    css,
    xpath: buildXPath(element),
  };
}
