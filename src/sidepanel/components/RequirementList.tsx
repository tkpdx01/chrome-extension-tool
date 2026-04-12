import type { RequirementPoint } from '@/shared/types';

type RequirementListProps = {
  requirements: RequirementPoint[];
  activeRequirementId?: string;
  onSelect: (requirementId: string) => void;
  onCreate: () => void;
};

export default function RequirementList({
  requirements,
  activeRequirementId,
  onSelect,
  onCreate,
}: RequirementListProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>需求点</h2>
        <button onClick={onCreate}>新建</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {requirements.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>还没有需求点。</div>
        ) : (
          requirements.map((requirement) => {
            const isActive = requirement.id === activeRequirementId;
            return (
              <button
                key={requirement.id}
                onClick={() => onSelect(requirement.id)}
                style={{
                  textAlign: 'left',
                  borderRadius: 10,
                  border: isActive ? '1px solid #2563eb' : '1px solid #d1d5db',
                  padding: '10px 12px',
                  background: isActive ? '#eff6ff' : '#fff',
                }}
              >
                <div style={{ fontWeight: 600 }}>{requirement.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {requirement.description || '未填写描述'}
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
