import type { ElementSnapshot, PickerMode } from '@/shared/types';

type ElementPickerPanelProps = {
  anchor?: ElementSnapshot;
  relatedElements: ElementSnapshot[];
  pickerMode: PickerMode;
  onPickAnchor: () => void;
  onPickRelated: () => void;
  onRemoveElement: (elementId: string) => void;
  onStop: () => void;
};

function renderElementSummary(element: ElementSnapshot): string {
  return `${element.tagName}${element.text ? ` · ${element.text}` : ''}`;
}

function getPreferredSelector(element: ElementSnapshot): string | undefined {
  return element.selectorCandidates.primaryCss ?? element.selectorCandidates.css[0] ?? element.selectorCandidates.xpath;
}

export default function ElementPickerPanel({
  anchor,
  relatedElements,
  pickerMode,
  onPickAnchor,
  onPickRelated,
  onRemoveElement,
  onStop,
}: ElementPickerPanelProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>页面元素</h3>
        {pickerMode === 'idle' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onPickAnchor}>选锚点</button>
            <button onClick={onPickRelated}>选相关元素</button>
          </div>
        ) : (
          <button onClick={onStop}>停止选择</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: '#374151' }}>
        当前模式：{pickerMode === 'idle' ? '未选择' : pickerMode === 'anchor' ? '选择锚点' : '选择相关元素'}
      </div>
      <div>
        <strong style={{ display: 'block', marginBottom: 6 }}>锚点元素</strong>
        {anchor ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#111827' }}>{renderElementSummary(anchor)}</div>
              {getPreferredSelector(anchor) ? (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: '#6b7280',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 360,
                  }}
                  title={getPreferredSelector(anchor)}
                >
                  {getPreferredSelector(anchor)}
                </div>
              ) : null}
            </div>
            <button onClick={() => onRemoveElement(anchor.id)}>删除</button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>未绑定</div>
        )}
      </div>
      <div>
        <strong style={{ display: 'block', marginBottom: 6 }}>相关元素</strong>
        {relatedElements.length === 0 ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>未选择</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 0, fontSize: 13, listStyle: 'none', display: 'grid', gap: 8 }}>
            {relatedElements.map((element) => (
              <li
                key={element.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div>{renderElementSummary(element)}</div>
                  {getPreferredSelector(element) ? (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: '#6b7280',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 360,
                      }}
                      title={getPreferredSelector(element)}
                    >
                      {getPreferredSelector(element)}
                    </div>
                  ) : null}
                </div>
                <button onClick={() => onRemoveElement(element.id)}>删除</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
