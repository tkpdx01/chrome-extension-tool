import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RequirementTabs from './components/RequirementTabs';
import RequirementPanel from './components/RequirementPanel';
import { createMessage, type SnapshotResponse } from '@/shared/messages';
import type { AppSnapshot, FieldSelection, RequirementPoint } from '@/shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function sendBg<T>(message: unknown, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('后台响应超时')), timeoutMs);
    chrome.runtime.sendMessage(message).then(
      (r) => { clearTimeout(timer); r ? resolve(r as T) : reject(new Error('未收到后台响应')); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function requestSnapshot(): Promise<AppSnapshot> {
  const r = await sendBg<SnapshotResponse>(createMessage('sidepanel', 'background', 'APP_BOOTSTRAP', {}));
  if (!r.ok) throw new Error(r.error ?? '后台错误');
  return r.data;
}

const RETRY_DELAYS = [500, 1500, 3000];

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | undefined>();
  const [activeReqId, setActiveReqId] = useState<string | undefined>();
  const [activeNetId, setActiveNetId] = useState<string | undefined>();
  const [selectedFields, setSelectedFields] = useState<FieldSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const retryRef = useRef(0);

  // -- Bootstrap -----------------------------------------------------------

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    retryRef.current = 0;

    for (let i = 0; i <= RETRY_DELAYS.length; i++) {
      try {
        const s = await requestSnapshot();
        setSnapshot(s);
        setError(undefined);
        setLoading(false);
        return;
      } catch (e) {
        if (i < RETRY_DELAYS.length) {
          retryRef.current = i + 1;
          setError(`加载失败，正在第 ${i + 1} 次重试...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
        } else {
          setError(toErrorMessage(e));
          setLoading(false);
        }
      }
    }
  }, []);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const listener = (msg: { type?: string }) => {
      if (msg.type === 'STATE_CHANGED') void refresh();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // -- Derived state -------------------------------------------------------

  const requirements = snapshot?.page.requirements ?? [];
  const activeReq = useMemo(
    () => requirements.find((r) => r.id === activeReqId) ?? requirements[0],
    [activeReqId, requirements],
  );

  useEffect(() => {
    if (activeReq && activeReq.id !== activeReqId) setActiveReqId(activeReq.id);
  }, [activeReq, activeReqId]);

  // Report active context to background
  useEffect(() => {
    if (!snapshot?.page.tabId || !snapshot?.page.id || !activeReq?.id) return;
    void chrome.runtime.sendMessage(
      createMessage('sidepanel', 'background', 'SIDEPANEL_CONTEXT_UPDATE', {
        tabId: snapshot.page.tabId,
        pageId: snapshot.page.id,
        requirementId: activeReq.id,
      }),
    ).catch(() => undefined);
  }, [snapshot?.page.tabId, snapshot?.page.id, activeReq?.id]);

  // Sync selected fields
  useEffect(() => {
    if (!activeReq || !snapshot) { setSelectedFields([]); return; }
    const dep = activeReq.dataDependencies.find((d) => d.networkRecordId === activeNetId);
    setSelectedFields(dep?.selectedFields ?? []);
  }, [activeNetId, activeReq, snapshot]);

  // -- Messaging -----------------------------------------------------------

  function tabId(): number {
    const id = snapshot?.page.tabId;
    if (!id) throw new Error('页面上下文尚未加载');
    return id;
  }

  async function send<T>(msg: unknown): Promise<T> {
    const r = await sendBg<{ ok: boolean; error?: string; data: T }>(msg);
    if (!r.ok) throw new Error(r.error ?? 'Unknown error');
    return r.data;
  }

  async function refresh(): Promise<void> {
    try {
      setSnapshot(await requestSnapshot());
      setError(undefined);
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }

  async function run(fn: () => Promise<void>): Promise<void> {
    try { await fn(); setError(undefined); } catch (e) { setError(toErrorMessage(e)); }
  }

  // -- Actions -------------------------------------------------------------

  async function createReq(): Promise<void> {
    if (!snapshot) return;
    const r = await send<RequirementPoint>(
      createMessage('sidepanel', 'background', 'REQUIREMENT_CREATE', {
        tabId: tabId(), pageId: snapshot.page.id, name: `需求点 ${requirements.length + 1}`,
      }),
    );
    setActiveReqId(r.id);
    await refresh();
  }

  async function updateReq(patch: { name?: string; description?: string; notes?: string }): Promise<void> {
    if (!snapshot || !activeReq) return;
    await send(createMessage('sidepanel', 'background', 'REQUIREMENT_UPDATE', {
      tabId: tabId(), pageId: snapshot.page.id, requirementId: activeReq.id, patch,
    }));
    await refresh();
  }

  async function deleteReq(): Promise<void> {
    if (!snapshot || !activeReq) return;
    if (!window.confirm(`确认删除「${activeReq.name}」？`)) return;
    const next = requirements.find((r) => r.id !== activeReq.id);
    await send(createMessage('sidepanel', 'background', 'REQUIREMENT_DELETE', {
      tabId: tabId(), pageId: snapshot.page.id, requirementId: activeReq.id,
    }));
    setActiveReqId(next?.id);
    setActiveNetId(undefined);
    setSelectedFields([]);
    await refresh();
  }

  async function removeElement(elementId: string): Promise<void> {
    if (!snapshot || !activeReq) return;
    await send(createMessage('sidepanel', 'background', 'REQUIREMENT_REMOVE_ELEMENT', {
      tabId: tabId(), pageId: snapshot.page.id, requirementId: activeReq.id, elementId,
    }));
    await refresh();
  }

  async function attachFields(fields: FieldSelection[]): Promise<void> {
    setSelectedFields(fields);
    if (!snapshot || !activeReq || !activeNetId) return;
    await send(createMessage('sidepanel', 'background', 'REQUIREMENT_ATTACH_FIELDS', {
      tabId: tabId(), pageId: snapshot.page.id, requirementId: activeReq.id,
      networkRecordId: activeNetId, fields,
    }));
    await refresh();
  }

  async function removeDataDep(nrId: string): Promise<void> {
    if (!snapshot || !activeReq) return;
    await send(createMessage('sidepanel', 'background', 'REQUIREMENT_REMOVE_DATA_DEPENDENCY', {
      tabId: tabId(), pageId: snapshot.page.id, requirementId: activeReq.id, networkRecordId: nrId,
    }));
    if (activeNetId === nrId) setSelectedFields([]);
    await refresh();
  }

  async function removeField(nrId: string, fieldPath: string): Promise<void> {
    if (!snapshot || !activeReq) return;
    await send(createMessage('sidepanel', 'background', 'REQUIREMENT_REMOVE_FIELD', {
      tabId: tabId(), pageId: snapshot.page.id, requirementId: activeReq.id,
      networkRecordId: nrId, fieldPath,
    }));
    await refresh();
  }

  async function exportProject(): Promise<void> {
    if (!snapshot) return;
    await send(createMessage('sidepanel', 'background', 'PROJECT_EXPORT', { projectId: snapshot.project.id, tabId: snapshot.page.tabId }));
  }

  // -- Render --------------------------------------------------------------

  if (!snapshot) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, color: '#111827', minHeight: '100vh', background: '#f9fafb' }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Offline Capture</h1>
        <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, color: error && !loading ? '#b91c1c' : '#374151' }}>
            {loading ? (error ?? '正在加载页面上下文...') : error}
          </div>
          <button
            onClick={() => void bootstrap()}
            disabled={loading}
            style={{ marginTop: 8, fontSize: 12, opacity: loading ? 0.5 : 1, cursor: loading ? 'default' : 'pointer' }}
          >
            {loading ? '加载中...' : '重试'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', color: '#111827', background: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 0', background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {snapshot.page.title}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {snapshot.page.url}
            </div>
          </div>
          <button
            onClick={() => void run(exportProject)}
            style={{ flexShrink: 0, fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#374151' }}
          >
            导出
          </button>
        </div>

        {/* Requirement tabs */}
        <RequirementTabs
          requirements={requirements}
          activeId={activeReq?.id}
          onSelect={setActiveReqId}
          onCreate={() => void run(createReq)}
        />
      </div>

      {/* Error bar */}
      {error ? (
        <div style={{ padding: '6px 14px', fontSize: 12, color: '#b91c1c', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
          {error}
        </div>
      ) : null}

      {/* Requirement panel */}
      <div style={{ padding: '0 14px 14px' }}>
        <RequirementPanel
          requirement={activeReq}
          elements={snapshot.page.elements}
          networkRecords={snapshot.page.networkRecords}
          activeNetworkRecordId={activeNetId}
          selectedFields={selectedFields}
          onFieldSelectionChange={(f) => void run(() => attachFields(f))}
          onNetworkSelect={setActiveNetId}
          onUpdate={(p) => void run(() => updateReq(p))}
          onDelete={() => void run(deleteReq)}
          onRemoveElement={(id) => void run(() => removeElement(id))}
          onRemoveDataDependency={(id) => void run(() => removeDataDep(id))}
          onRemoveField={(nrId, fp) => void run(() => removeField(nrId, fp))}
        />
      </div>
    </main>
  );
}
