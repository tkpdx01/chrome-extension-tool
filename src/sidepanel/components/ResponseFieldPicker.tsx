import { flattenJsonFields } from '@/shared/utils';
import type { FieldSelection, NetworkRecord } from '@/shared/types';

type ResponseFieldPickerProps = {
  record?: NetworkRecord;
  selectedFields: FieldSelection[];
  onChange: (fields: FieldSelection[]) => void;
};

export default function ResponseFieldPicker({
  record,
  selectedFields,
  onChange,
}: ResponseFieldPickerProps) {
  const fields = record?.responseJsonSample ? flattenJsonFields(record.responseJsonSample) : [];

  const toggleField = (path: string, exampleValue: string) => {
    const exists = selectedFields.some((field) => field.path === path);
    if (exists) {
      onChange(selectedFields.filter((field) => field.path !== path));
      return;
    }

    onChange([
      ...selectedFields,
      {
        path,
        exampleValue,
        displayedInCurrentPage: false,
      },
    ]);
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>响应字段</h3>
      {!record ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>先选择一条请求。</div>
      ) : fields.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>当前响应没有可提取的 JSON 字段。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflow: 'auto' }}>
          {fields.map((field) => {
            const checked = selectedFields.some((item) => item.path === field.path);
            return (
              <label
                key={field.path}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(field.path, field.exampleValue)}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{field.path}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{field.exampleValue}</div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
