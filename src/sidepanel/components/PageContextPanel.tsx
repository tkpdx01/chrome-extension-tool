import type { PageInspectionContext } from '@/shared/types';

type PageContextPanelProps = {
  context?: PageInspectionContext;
  loading: boolean;
  error?: string;
  networkCount: number;
  onRefresh: () => void;
};

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        background: '#fff',
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 11, color: '#9ca3af' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  );
}

export default function PageContextPanel({
  context,
  loading,
  error,
  networkCount,
  onRefresh,
}: PageContextPanelProps) {
  return (
    <section
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 16,
        background: 'linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)',
        border: '1px solid #e5e7eb',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>页面上下文</div>
          <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>
            URL、源码摘要、脚本资源和框架识别集中查看
          </div>
        </div>
        <button
          onClick={onRefresh}
          style={{
            flexShrink: 0,
            padding: '5px 10px',
            fontSize: 11,
            borderRadius: 999,
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            cursor: 'pointer',
          }}
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: error ? '#b91c1c' : '#374151', lineHeight: 1.6 }}>
        {loading && !context ? '正在抓取当前页面上下文...' : error ?? context?.url ?? '暂无页面上下文'}
      </div>

      {context ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            <MetricCard label="源码大小" value={`${Math.max(1, Math.round(context.htmlSize / 1024))} KB`} />
            <MetricCard label="脚本资源" value={`${context.scriptUrls.length}`} />
            <MetricCard label="已抓请求" value={`${networkCount}`} />
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {context.detectedFrameworks.length > 0 ? (
              context.detectedFrameworks.map((item) => (
                <span
                  key={item}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#0f766e',
                    background: '#ccfbf1',
                    borderRadius: 999,
                    padding: '4px 8px',
                  }}
                >
                  {item}
                </span>
              ))
            ) : (
              <span
                style={{
                  fontSize: 11,
                  color: '#6b7280',
                  background: '#f3f4f6',
                  borderRadius: 999,
                  padding: '4px 8px',
                }}
              >
                未识别出明显框架特征
              </span>
            )}
            {context.inlineScriptCount > 0 ? (
              <span
                style={{
                  fontSize: 11,
                  color: '#6b7280',
                  background: '#f3f4f6',
                  borderRadius: 999,
                  padding: '4px 8px',
                }}
              >
                内联脚本 {context.inlineScriptCount}
              </span>
            ) : null}
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
              查看 DOM 源码摘要
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                maxHeight: 220,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontSize: 10,
                color: '#374151',
                background: '#111827',
                borderRadius: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {context.htmlPreview}
            </pre>
          </details>

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
              查看脚本资源
            </summary>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              {context.scriptUrls.length > 0 ? (
                context.scriptUrls.map((url) => (
                  <div
                    key={url}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      fontSize: 11,
                      color: '#4b5563',
                      wordBreak: 'break-all',
                    }}
                  >
                    {url}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>当前页面没有可枚举的外链脚本。</div>
              )}
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
