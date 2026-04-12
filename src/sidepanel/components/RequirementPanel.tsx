import { useEffect, useState } from 'react';
import type {
  ElementSnapshot,
  FieldSelection,
  NetworkRecord,
  RequirementPoint,
} from '@/shared/types';
import ElementCard from './ElementCard';
import NetworkRequestList from './NetworkRequestList';
import ResponseFieldPicker from './ResponseFieldPicker';

type RequirementPanelProps = {
  requirement?: RequirementPoint;
  elements: ElementSnapshot[];
  networkRecords: NetworkRecord[];
  activeNetworkRecordId?: string;
  selectedFields: FieldSelection[];
  onFieldSelectionChange: (fields: FieldSelection[]) => void;
  onNetworkSelect: (recordId: string) => void;
  onUpdate: (patch: { name?: string; description?: string; notes?: string }) => void;
  onDelete: () => void;
  onRemoveElement: (elementId: string) => void;
  onRemoveDataDependency: (networkRecordId: string) => void;
  onRemoveField: (networkRecordId: string, fieldPath: string) => void;
  onPromoteToAnchor: (elementId: string) => void;
};

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', padding: '8px 0 4px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 6 }}>
      {title}
      {count !== undefined && count > 0 ? (
        <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '0 5px', borderRadius: 999, lineHeight: '16px' }}>
          {count}
        </span>
      ) : null}
    </div>
  );
}

export default function RequirementPanel({
  requirement,
  elements,
  networkRecords,
  activeNetworkRecordId,
  selectedFields,
  onFieldSelectionChange,
  onNetworkSelect,
  onUpdate,
  onDelete,
  onRemoveElement,
  onRemoveDataDependency,
  onRemoveField,
  onPromoteToAnchor,
}: RequirementPanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftNotes, setDraftNotes] = useState('');

  useEffect(() => {
    if (!requirement) return;
    setDraftName(requirement.name);
    setDraftDesc(requirement.description);
    setDraftNotes(requirement.notes ?? '');
    setEditingName(false);
  }, [requirement?.id]);

  if (!requirement) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        点击「+ 新建」创建需求点，然后在页面上右键采集元素
      </div>
    );
  }

  const anchor = elements.find((e) => e.id === requirement.anchorElementId);
  const related = elements.filter((e) => requirement.relatedElementIds.includes(e.id));
  const activeRecord = networkRecords.find((r) => r.id === activeNetworkRecordId);
  const deps = requirement.dataDependencies;

  function commitName(): void {
    setEditingName(false);
    if (draftName && draftName !== requirement!.name) {
      onUpdate({ name: draftName });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header: name + delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
        {editingName ? (
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
            autoFocus
            style={{ flex: 1, fontSize: 15, fontWeight: 600, padding: '2px 6px', border: '1px solid #2563eb', borderRadius: 6, outline: 'none' }}
          />
        ) : (
          <h3
            onClick={() => setEditingName(true)}
            style={{ margin: 0, fontSize: 15, fontWeight: 600, cursor: 'text', padding: '2px 6px', borderRadius: 6, border: '1px solid transparent' }}
            title="点击编辑名称"
          >
            {requirement.name}
          </h3>
        )}
        <button
          onClick={onDelete}
          style={{ fontSize: 11, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
        >
          删除
        </button>
      </div>

      {/* Elements */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>元素</div>

        {!anchor && related.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9ca3af', background: '#f9fafb', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6 }}>
            右键页面元素 → <strong>Offline Capture</strong> → 选择「设为锚点元素」或「添加为相关元素」
          </div>
        ) : null}

        {anchor ? (
          <ElementCard element={anchor} isAnchor insertPosition={requirement.insertPosition} onRemove={() => onRemoveElement(anchor.id)} />
        ) : null}

        {related.map((el) => (
          <ElementCard key={el.id} element={el} onRemove={() => onRemoveElement(el.id)} onPromoteToAnchor={() => onPromoteToAnchor(el.id)} />
        ))}
      </div>

      {/* Description */}
      <SectionHeader title="描述" />
      <textarea
        rows={2}
        value={draftDesc}
        onChange={(e) => setDraftDesc(e.target.value)}
        onBlur={() => { if (draftDesc !== requirement.description) onUpdate({ description: draftDesc }); }}
        placeholder="描述这个需求点的用途"
        style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
      />

      {/* Notes */}
      <SectionHeader title="备注" />
      <textarea
        rows={2}
        value={draftNotes}
        onChange={(e) => setDraftNotes(e.target.value)}
        onBlur={() => { if (draftNotes !== (requirement.notes ?? '')) onUpdate({ notes: draftNotes }); }}
        placeholder="给 AI 的额外说明"
        style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
      />

      {/* Data dependencies */}
      {deps.length > 0 ? (
        <>
          <SectionHeader title="字段绑定" count={deps.reduce((n, d) => n + d.selectedFields.length, 0)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deps.map((dep) => (
              <div key={dep.networkRecordId} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, color: '#2563eb' }}>{dep.method}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => onNetworkSelect(dep.networkRecordId)} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>查看</button>
                    <button onClick={() => onRemoveDataDependency(dep.networkRecordId)} style={{ fontSize: 11, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}>删除</button>
                  </div>
                </div>
                <div style={{ color: '#6b7280', marginTop: 2, wordBreak: 'break-all' }}>{dep.urlPattern}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {dep.selectedFields.map((f) => (
                    <span
                      key={f.path}
                      onClick={() => onRemoveField(dep.networkRecordId, f.path)}
                      style={{ fontSize: 10, background: '#f3f4f6', padding: '2px 6px', borderRadius: 999, cursor: 'pointer', color: '#374151' }}
                      title={`点击移除 ${f.path}`}
                    >
                      {f.path} x
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Network requests */}
      <SectionHeader title="网络请求" count={networkRecords.length} />
      <NetworkRequestList records={networkRecords} activeRecordId={activeNetworkRecordId} onSelect={onNetworkSelect} />

      {/* Response fields */}
      {activeRecord ? (
        <>
          <SectionHeader title="响应字段" />
          <ResponseFieldPicker record={activeRecord} selectedFields={selectedFields} onChange={onFieldSelectionChange} />
        </>
      ) : null}
    </div>
  );
}
