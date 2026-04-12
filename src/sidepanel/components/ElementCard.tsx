import type { ElementSnapshot, InsertPosition } from '@/shared/types';
import { INSERT_POSITION_LABELS } from '@/shared/types';
import { createMessage } from '@/shared/messages';

type ElementCardProps = {
  element: ElementSnapshot;
  isAnchor?: boolean;
  insertPosition?: InsertPosition;
  onRemove: () => void;
};

function getSelector(el: ElementSnapshot): string | undefined {
  return el.selectorCandidates.primaryCss ?? el.selectorCandidates.css[0] ?? el.selectorCandidates.xpath;
}

function handleMouseEnter(el: ElementSnapshot): void {
  const selector = getSelector(el);
  if (!selector) return;
  void chrome.runtime.sendMessage(
    createMessage('sidepanel', 'background', 'HIGHLIGHT_ELEMENT', { selector }),
  ).catch(() => undefined);
}

function handleMouseLeave(): void {
  void chrome.runtime.sendMessage(
    createMessage('sidepanel', 'background', 'UNHIGHLIGHT_ELEMENT', {}),
  ).catch(() => undefined);
}

export default function ElementCard({ element, isAnchor, insertPosition, onRemove }: ElementCardProps) {
  const selector = getSelector(element);
  const textPreview = element.text?.slice(0, 30) || '';

  return (
    <div
      onMouseEnter={() => handleMouseEnter(element)}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 10px',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fff',
        cursor: 'default',
        transition: 'border-color 150ms',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {isAnchor ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>
              锚点
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
              相关
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
            {element.tagName}
          </span>
          {textPreview ? (
            <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {textPreview}
            </span>
          ) : null}
          {insertPosition ? (
            <span style={{ fontSize: 10, color: '#059669', background: '#d1fae5', padding: '1px 5px', borderRadius: 4 }}>
              {INSERT_POSITION_LABELS[insertPosition]}
            </span>
          ) : null}
        </div>
        {selector ? (
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: '#6b7280',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={selector}
          >
            {selector}
          </div>
        ) : null}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          color: '#9ca3af',
          background: 'none',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          lineHeight: 1,
        }}
        title="移除"
      >
        x
      </button>
    </div>
  );
}
