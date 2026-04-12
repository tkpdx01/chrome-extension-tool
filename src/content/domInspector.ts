import { MAX_HTML_SNIPPET, MAX_TEXT_LENGTH } from '@/shared/constants';
import type { ElementSnapshot } from '@/shared/types';
import { createId, truncateText } from '@/shared/utils';
import { buildSelectorCandidates } from './selector';

const KEY_STYLE_PROPS = [
  'display', 'position', 'flex-direction', 'justify-content', 'align-items',
  'gap', 'margin', 'padding', 'width', 'height', 'max-width',
  'font-size', 'font-weight', 'line-height', 'color', 'background-color',
  'border', 'border-radius', 'overflow', 'opacity', 'z-index',
];

function getSiblingText(element: Element, sibling: 'previousElementSibling' | 'nextElementSibling'): string | undefined {
  const target = element[sibling];
  if (!target) {
    return undefined;
  }
  return truncateText(target.textContent?.trim(), 120) || undefined;
}

function getAttributes(element: Element): Record<string, string> {
  return Array.from(element.attributes).reduce<Record<string, string>>((accumulator, attribute) => {
    accumulator[attribute.name] = truncateText(attribute.value, 160);
    return accumulator;
  }, {});
}

function getComputedStyleSubset(element: Element): Record<string, string> {
  const computed = window.getComputedStyle(element);
  const result: Record<string, string> = {};

  for (const prop of KEY_STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    // Skip default/empty values to keep it compact
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto'
      && value !== '0px' && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
      result[prop] = value;
    }
  }

  return result;
}

export function inspectElement(element: Element): ElementSnapshot {
  const rect = element.getBoundingClientRect();
  return {
    id: createId('el'),
    tagName: element.tagName.toLowerCase(),
    text: truncateText(element.textContent?.trim(), MAX_TEXT_LENGTH),
    htmlSnippet: truncateText(element.outerHTML, MAX_HTML_SNIPPET),
    attributes: getAttributes(element),
    computedStyle: getComputedStyleSubset(element),
    selectorCandidates: buildSelectorCandidates(element),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    context: {
      parentTag: element.parentElement?.tagName.toLowerCase(),
      parentText: truncateText(element.parentElement?.textContent?.trim(), 160),
      prevSiblingText: getSiblingText(element, 'previousElementSibling'),
      nextSiblingText: getSiblingText(element, 'nextElementSibling'),
    },
  };
}
