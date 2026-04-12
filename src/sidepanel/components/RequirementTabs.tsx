import type { RequirementPoint } from '@/shared/types';

type RequirementTabsProps = {
  requirements: RequirementPoint[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export default function RequirementTabs({
  requirements,
  activeId,
  onSelect,
  onCreate,
}: RequirementTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '6px 0',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {requirements.map((req) => {
        const isActive = req.id === activeId;
        const elCount = (req.anchorElementId ? 1 : 0) + req.relatedElementIds.length;
        return (
          <button
            key={req.id}
            onClick={() => onSelect(req.id)}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#2563eb' : '#6b7280',
              background: isActive ? '#eff6ff' : '#fff',
              border: isActive ? '1.5px solid #2563eb' : '1px solid #e5e7eb',
              borderRadius: 999,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 150ms',
            }}
          >
            {req.name}
            {elCount > 0 ? (
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? '#2563eb' : '#9ca3af',
                  background: isActive ? '#dbeafe' : '#f3f4f6',
                  padding: '0 5px',
                  borderRadius: 999,
                  lineHeight: '16px',
                }}
              >
                {elCount}
              </span>
            ) : null}
          </button>
        );
      })}
      <button
        onClick={onCreate}
        style={{
          flexShrink: 0,
          padding: '5px 10px',
          fontSize: 12,
          color: '#6b7280',
          background: '#fff',
          border: '1px dashed #d1d5db',
          borderRadius: 999,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        + 新建
      </button>
    </div>
  );
}
