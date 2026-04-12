import { flattenJsonFields } from '@/shared/utils';
import type { FieldSelection, NetworkRecord } from '@/shared/types';

type ResponseFieldPickerProps = {
  record?: NetworkRecord;
  selectedFields: FieldSelection[];
  onChange: (fields: FieldSelection[]) => void;
};

export default function ResponseFieldPicker({ record, selectedFields, onChange }: ResponseFieldPickerProps) {
  const fields = record?.responseJsonSample ? flattenJsonFields(record.responseJsonSample) : [];

  const toggleField = (path: string, exampleValue: string) => {
    const exists = selectedFields.some((f) => f.path === path);
    if (exists) {
      onChange(selectedFields.filter((f) => f.path !== path));
    } else {
      onChange([...selectedFields, { path, exampleValue, displayedInCurrentPage: false }]);
    }
  };

  if (!record) {
    return <div style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>选择一条请求查看响应字段</div>;
  }

  if (fields.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>当前响应没有 JSON 字段</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflow: 'auto' }}>
      {fields.map((field) => {
        const checked = selectedFields.some((f) => f.path === field.path);
        return (
          <label
            key={field.path}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              padding: '5px 8px',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              cursor: 'pointer',
              background: checked ? '#eff6ff' : '#fff',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleField(field.path, field.exampleValue)}
              style={{ marginTop: 2 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{field.path}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.exampleValue}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
