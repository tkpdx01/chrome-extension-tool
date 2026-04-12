import type { NetworkRecord } from '@/shared/types';

type NetworkRequestListProps = {
  records: NetworkRecord[];
  activeRecordId?: string;
  onSelect: (recordId: string) => void;
};

export default function NetworkRequestList({
  records,
  activeRecordId,
  onSelect,
}: NetworkRequestListProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>网络请求</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflow: 'auto' }}>
        {records.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>还没有捕获到请求。</div>
        ) : (
          records.map((record) => {
            const active = record.id === activeRecordId;
            return (
              <button
                key={record.id}
                onClick={() => onSelect(record.id)}
                style={{
                  textAlign: 'left',
                  borderRadius: 10,
                  border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
                  background: active ? '#eff6ff' : '#fff',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>
                  {record.method} · {record.status}
                </div>
                <div style={{ fontSize: 13, color: '#111827', marginTop: 4 }}>{record.url}</div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
