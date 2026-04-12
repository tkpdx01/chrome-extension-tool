import { useEffect, useState } from 'react';
import type {
  ElementSnapshot,
  FieldSelection,
  InsertPosition,
  NetworkRecord,
  RequirementPoint,
} from '@/shared/types';
import ElementPickerPanel from './ElementPickerPanel';
import NetworkRequestList from './NetworkRequestList';
import ResponseFieldPicker from './ResponseFieldPicker';

type RequirementDetailProps = {
  requirement?: RequirementPoint;
  elements: ElementSnapshot[];
  networkRecords: NetworkRecord[];
  pickerMode: 'idle' | 'anchor' | 'related';
  activeNetworkRecordId?: string;
  selectedFields: FieldSelection[];
  onFieldSelectionChange: (fields: FieldSelection[]) => void;
  onNetworkSelect: (recordId: string) => void;
  onUpdateRequirement: (patch: {
    name?: string;
    description?: string;
    notes?: string;
    insertPosition?: InsertPosition;
  }) => void;
  onDeleteRequirement: () => void;
  onRemoveElement: (elementId: string) => void;
  onRemoveDataDependency: (networkRecordId: string) => void;
  onRemoveField: (networkRecordId: string, fieldPath: string) => void;
  onPickAnchor: () => void;
  onPickRelated: () => void;
  onStopPicking: () => void;
};

const INSERT_OPTIONS: InsertPosition[] = ['before', 'after', 'inside-start', 'inside-end'];

type RequirementDraft = {
  name: string;
  description: string;
  notes: string;
  insertPosition?: InsertPosition;
};

export default function RequirementDetail({
  requirement,
  elements,
  networkRecords,
  pickerMode,
  activeNetworkRecordId,
  selectedFields,
  onFieldSelectionChange,
  onNetworkSelect,
  onUpdateRequirement,
  onDeleteRequirement,
  onRemoveElement,
  onRemoveDataDependency,
  onRemoveField,
  onPickAnchor,
  onPickRelated,
  onStopPicking,
}: RequirementDetailProps) {
  const [draft, setDraft] = useState<RequirementDraft>({
    name: '',
    description: '',
    notes: '',
    insertPosition: undefined,
  });

  useEffect(() => {
    if (!requirement) {
      setDraft({
        name: '',
        description: '',
        notes: '',
        insertPosition: undefined,
      });
      return;
    }

    setDraft({
      name: requirement.name,
      description: requirement.description,
      notes: requirement.notes ?? '',
      insertPosition: requirement.insertPosition,
    });
  }, [requirement?.id]);

  if (!requirement) {
    return <div style={{ color: '#6b7280' }}>请选择或新建一个需求点。</div>;
  }

  const currentRequirement = requirement;
  const anchor = elements.find((element) => element.id === currentRequirement.anchorElementId);
  const relatedElements = elements.filter((element) => currentRequirement.relatedElementIds.includes(element.id));
  const activeRecord = networkRecords.find((record) => record.id === activeNetworkRecordId);
  const dependencyRecords = currentRequirement.dataDependencies.map((dependency) => ({
    dependency,
    record: networkRecords.find((record) => record.id === dependency.networkRecordId),
  }));

  function commitDraftField<Key extends keyof RequirementDraft>(key: Key, value: RequirementDraft[Key]): void {
    const nextValue = value === '' ? '' : value;
    const currentValue =
      key === 'notes'
        ? (currentRequirement.notes ?? '')
        : key === 'insertPosition'
          ? currentRequirement.insertPosition
          : currentRequirement[key];

    if (currentValue === nextValue) {
      return;
    }

    onUpdateRequirement({
      [key]: nextValue === '' && key === 'insertPosition' ? undefined : nextValue,
    });
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>需求点详情</h2>
        <button
          onClick={onDeleteRequirement}
          style={{ color: '#b91c1c', borderColor: '#fecaca' }}
        >
          删除需求点
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>名称</span>
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            onBlur={(event) => commitDraftField('name', event.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>描述</span>
          <textarea
            rows={3}
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            onBlur={(event) => commitDraftField('description', event.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>插入位置</span>
          <select
            value={draft.insertPosition ?? ''}
            onChange={(event) => {
              const value = (event.target.value || undefined) as InsertPosition | undefined;
              setDraft((current) => ({ ...current, insertPosition: value }));
              commitDraftField('insertPosition', value);
            }}
          >
            <option value="">未指定</option>
            {INSERT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>备注</span>
          <textarea
            rows={3}
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            onBlur={(event) => commitDraftField('notes', event.target.value)}
          />
        </label>
      </div>

      <ElementPickerPanel
        anchor={anchor}
        relatedElements={relatedElements}
        pickerMode={pickerMode}
        onPickAnchor={onPickAnchor}
        onPickRelated={onPickRelated}
        onRemoveElement={onRemoveElement}
        onStop={onStopPicking}
      />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>字段绑定</h3>
        {dependencyRecords.length === 0 ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>还没有绑定任何字段。</div>
        ) : (
          dependencyRecords.map(({ dependency, record }) => {
            const isActive = dependency.networkRecordId === activeNetworkRecordId;
            return (
              <div
                key={dependency.networkRecordId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  border: isActive ? '1px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: isActive ? '#eff6ff' : '#fff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>
                      {dependency.method}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{dependency.urlPattern}</div>
                    {record ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#6b7280',
                          marginTop: 4,
                          wordBreak: 'break-all',
                        }}
                      >
                        {record.url}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => onNetworkSelect(dependency.networkRecordId)}>查看请求</button>
                    <button
                      onClick={() => onRemoveDataDependency(dependency.networkRecordId)}
                      style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                    >
                      删除绑定
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {dependency.selectedFields.map((field) => (
                    <button
                      key={field.path}
                      onClick={() => onRemoveField(dependency.networkRecordId, field.path)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        borderRadius: 999,
                        border: '1px solid #d1d5db',
                        padding: '6px 10px',
                        background: '#fff',
                        fontSize: 12,
                      }}
                      title={`移除字段 ${field.path}`}
                    >
                      <span>{field.path}</span>
                      <span style={{ color: '#b91c1c' }}>×</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <NetworkRequestList
          records={networkRecords}
          activeRecordId={activeNetworkRecordId}
          onSelect={onNetworkSelect}
        />
        <ResponseFieldPicker
          record={activeRecord}
          selectedFields={selectedFields}
          onChange={onFieldSelectionChange}
        />
      </div>
    </section>
  );
}
