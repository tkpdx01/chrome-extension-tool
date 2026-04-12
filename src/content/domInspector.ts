import { MAX_HTML_SNIPPET, MAX_TEXT_LENGTH } from '@/shared/constants';
import type { ElementSnapshot } from '@/shared/types';
import { createId, truncateText } from '@/shared/utils';
import { buildSelectorCandidates } from './selector';

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

export function inspectElement(element: Element): ElementSnapshot {
  const rect = element.getBoundingClientRect();
  return {
    id: createId('el'),
    tagName: element.tagName.toLowerCase(),
    text: truncateText(element.textContent?.trim(), MAX_TEXT_LENGTH),
    htmlSnippet: truncateText(element.outerHTML, MAX_HTML_SNIPPET),
    attributes: getAttributes(element),
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
