import type { NetworkRecord } from '@/shared/types';

type NetworkRequestListProps = {
  records: NetworkRecord[];
  activeRecordId?: string;
  onSelect: (recordId: string) => void;
};

function formatBytes(value?: number): string | undefined {
  if (!value || Number.isNaN(value)) {
    return undefined;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function ResponsePreview({ record }: { record: NetworkRecord }) {
  const preview = record.responseJsonSample
    ? JSON.stringify(record.responseJsonSample, null, 2)
    : record.responsePreview;

  if (!preview) {
    return <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', padding: '4px 0' }}>无响应内容</div>;
  }

  return (
    <pre
      style={{
        margin: '4px 0 0',
        padding: 6,
        fontSize: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 4,
        color: '#374151',
        overflow: 'auto',
        maxHeight: 150,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {preview.slice(0, 2000)}
    </pre>
  );
}

export default function NetworkRequestList({ records, activeRecordId, onSelect }: NetworkRequestListProps) {
  if (records.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>还没有捕获到请求。</div>;
  }

  const activeRecord = records.find((r) => r.id === activeRecordId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
        {records.map((record) => {
          const active = record.id === activeRecordId;
          return (
            <button
              key={record.id}
              onClick={() => onSelect(record.id)}
              style={{
                textAlign: 'left',
                borderRadius: 6,
                border: active ? '1.5px solid #2563eb' : '1px solid #e5e7eb',
                background: active ? '#eff6ff' : '#fff',
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>
                {record.method} · {record.status}
                {record.contentType ? (
                  <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>
                    {record.contentType.split(';')[0]}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {record.resourceType ? <span>{record.resourceType}</span> : null}
                {record.responseBodySize ? <span>响应 {formatBytes(record.responseBodySize)}</span> : null}
                {record.captureSource === 'debugger' ? <span>mirror</span> : null}
                {record.failedReason ? <span style={{ color: '#b91c1c' }}>{record.failedReason}</span> : null}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {record.url}
              </div>
            </button>
          );
        })}
      </div>

      {/* Response preview for selected request */}
      {activeRecord ? (
        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>响应预览</div>
          <ResponsePreview record={activeRecord} />
        </div>
      ) : null}
    </div>
  );
}
