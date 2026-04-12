import { useEffect, useMemo, useState } from 'react';
import RequirementList from './components/RequirementList';
import RequirementDetail from './components/RequirementDetail';
import { createMessage, type SnapshotResponse } from '@/shared/messages';
import type {
  AppSnapshot,
  FieldSelection,
  InsertPosition,
  PickerMode,
  RequirementPoint,
} from '@/shared/types';

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab available.');
  }

  return tab.id;
}

async function requestSnapshot(): Promise<AppSnapshot> {
  const tabId = await getActiveTabId();

  const response = (await chrome.runtime.sendMessage(
    createMessage('sidepanel', 'background', 'APP_BOOTSTRAP', { tabId }),
  )) as SnapshotResponse;

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | undefined>();
  const [activeRequirementId, setActiveRequirementId] = useState<string | undefined>();
  const [activeNetworkRecordId, setActiveNetworkRecordId] = useState<string | undefined>();
  const [selectedFields, setSelectedFields] = useState<FieldSelection[]>([]);
  const [pickerMode, setPickerMode] = useState<PickerMode>('idle');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message.type === 'STATE_CHANGED') {
        void loadSnapshot();
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const requirements = snapshot?.page.requirements ?? [];
  const activeRequirement = useMemo(
    () => requirements.find((requirement) => requirement.id === activeRequirementId) ?? requirements[0],
    [activeRequirementId, requirements],
  );

  useEffect(() => {
    if (activeRequirement && activeRequirement.id !== activeRequirementId) {
      setActiveRequirementId(activeRequirement.id);
    }
  }, [activeRequirement, activeRequirementId]);

  useEffect(() => {
    if (!snapshot?.page.tabId) {
      setPickerMode('idle');
      return;
    }

    const activePicking = snapshot.runtime.activePickingByTab[snapshot.page.tabId];
    setPickerMode(activePicking?.mode ?? 'idle');
  }, [snapshot]);

  async function loadSnapshot(): Promise<void> {
    try {
      const nextSnapshot = await requestSnapshot();
      setSnapshot(nextSnapshot);
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load snapshot.');
    }
  }

  async function sendMessage<T>(message: unknown): Promise<T> {
    const response = (await chrome.runtime.sendMessage(message)) as {
      ok: boolean;
      error?: string;
      data: T;
    };

    if (!response.ok) {
      throw new Error(response.error ?? 'Unknown error');
    }

    return response.data;
  }

  async function createRequirement(): Promise<void> {
    if (!snapshot) {
      return;
    }

    const tabId = await getActiveTabId();
    const created = await sendMessage<RequirementPoint>(
      createMessage('sidepanel', 'background', 'REQUIREMENT_CREATE', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        name: `需求点 ${snapshot.page.requirements.length + 1}`,
      }),
    );
    setActiveRequirementId(created.id);
    await loadSnapshot();
  }

  async function updateRequirement(patch: {
    name?: string;
    description?: string;
    notes?: string;
    insertPosition?: InsertPosition;
  }): Promise<void> {
    if (!snapshot || !activeRequirement) {
      return;
    }

    const tabId = await getActiveTabId();
    await sendMessage(
      createMessage('sidepanel', 'background', 'REQUIREMENT_UPDATE', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        requirementId: activeRequirement.id,
        patch,
      }),
    );
    await loadSnapshot();
  }

  async function deleteActiveRequirement(): Promise<void> {
    if (!snapshot || !activeRequirement) {
      return;
    }

    if (!window.confirm(`确认删除需求点「${activeRequirement.name}」吗？`)) {
      return;
    }

    if (pickerMode !== 'idle') {
      await stopPicker();
    }

    const tabId = await getActiveTabId();
    const nextRequirement = requirements.find((requirement) => requirement.id !== activeRequirement.id);
    await sendMessage(
      createMessage('sidepanel', 'background', 'REQUIREMENT_DELETE', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        requirementId: activeRequirement.id,
      }),
    );
    setActiveRequirementId(nextRequirement?.id);
    setActiveNetworkRecordId(undefined);
    setSelectedFields([]);
    await loadSnapshot();
  }

  async function removeElementBinding(elementId: string): Promise<void> {
    if (!snapshot || !activeRequirement) {
      return;
    }

    const tabId = await getActiveTabId();
    await sendMessage(
      createMessage('sidepanel', 'background', 'REQUIREMENT_REMOVE_ELEMENT', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        requirementId: activeRequirement.id,
        elementId,
      }),
    );
    await loadSnapshot();
  }

  async function startPicker(mode: Exclude<PickerMode, 'idle'>): Promise<void> {
    if (!snapshot || !activeRequirement) {
      return;
    }

    const tabId = await getActiveTabId();
    await sendMessage(
      createMessage('sidepanel', 'background', 'PICKER_START', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        requirementId: activeRequirement.id,
        mode,
      }),
    );
    setPickerMode(mode);
  }

  async function stopPicker(): Promise<void> {
    const tabId = await getActiveTabId();
    await sendMessage(
      createMessage('sidepanel', 'background', 'PICKER_STOP', {
        tabId: snapshot?.page.tabId ?? tabId,
      }),
    );
    setPickerMode('idle');
  }

  async function attachSelectedFields(fields: FieldSelection[]): Promise<void> {
    setSelectedFields(fields);
    if (!snapshot || !activeRequirement || !activeNetworkRecordId) {
      return;
    }

    const tabId = await getActiveTabId();
    await sendMessage(
      createMessage('sidepanel', 'background', 'REQUIREMENT_ATTACH_FIELDS', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        requirementId: activeRequirement.id,
        networkRecordId: activeNetworkRecordId,
        fields,
      }),
    );
    await loadSnapshot();
  }

  async function removeDataDependencyBinding(networkRecordId: string): Promise<void> {
    if (!snapshot || !activeRequirement) {
      return;
    }

    const tabId = await getActiveTabId();
    await sendMessage(
      createMessage('sidepanel', 'background', 'REQUIREMENT_REMOVE_DATA_DEPENDENCY', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        requirementId: activeRequirement.id,
        networkRecordId,
      }),
    );
    if (activeNetworkRecordId === networkRecordId) {
      setSelectedFields([]);
    }
    await loadSnapshot();
  }

  async function removeFieldBinding(networkRecordId: string, fieldPath: string): Promise<void> {
    if (!snapshot || !activeRequirement) {
      return;
    }

    const tabId = await getActiveTabId();
    await sendMessage(
      createMessage('sidepanel', 'background', 'REQUIREMENT_REMOVE_FIELD', {
        tabId: snapshot.page.tabId ?? tabId,
        pageId: snapshot.page.id,
        requirementId: activeRequirement.id,
        networkRecordId,
        fieldPath,
      }),
    );
    await loadSnapshot();
  }

  async function exportProject(): Promise<void> {
    if (!snapshot) {
      return;
    }
    await sendMessage(
      createMessage('sidepanel', 'background', 'PROJECT_EXPORT', {
        projectId: snapshot.project.id,
      }),
    );
  }

  useEffect(() => {
    if (!activeRequirement || !snapshot) {
      setSelectedFields([]);
      return;
    }

    const dependency = activeRequirement.dataDependencies.find(
      (item) => item.networkRecordId === activeNetworkRecordId,
    );
    setSelectedFields(dependency?.selectedFields ?? []);
  }, [activeNetworkRecordId, activeRequirement, snapshot]);

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        color: '#111827',
        background: '#f9fafb',
        minHeight: '100vh',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Offline Capture Assistant</h1>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            {snapshot ? `${snapshot.page.title} · ${snapshot.page.url}` : '正在加载页面上下文...'}
          </div>
        </div>
        <button onClick={exportProject} disabled={!snapshot}>
          导出项目
        </button>
      </div>

      {error ? (
        <div style={{ color: '#b91c1c', marginBottom: 16 }}>{error}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <RequirementList
          requirements={requirements}
          activeRequirementId={activeRequirement?.id}
          onSelect={setActiveRequirementId}
          onCreate={() => void createRequirement()}
        />

        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 14,
            background: '#fff',
            padding: 16,
          }}
        >
          <RequirementDetail
            requirement={activeRequirement}
            elements={snapshot?.page.elements ?? []}
            networkRecords={snapshot?.page.networkRecords ?? []}
            pickerMode={pickerMode}
            activeNetworkRecordId={activeNetworkRecordId}
            selectedFields={selectedFields}
            onFieldSelectionChange={(fields) => void attachSelectedFields(fields)}
            onNetworkSelect={setActiveNetworkRecordId}
            onUpdateRequirement={(patch) => void updateRequirement(patch)}
            onDeleteRequirement={() => void deleteActiveRequirement()}
            onRemoveElement={(elementId) => void removeElementBinding(elementId)}
            onRemoveDataDependency={(networkRecordId) => void removeDataDependencyBinding(networkRecordId)}
            onRemoveField={(networkRecordId, fieldPath) => void removeFieldBinding(networkRecordId, fieldPath)}
            onPickAnchor={() => void startPicker('anchor')}
            onPickRelated={() => void startPicker('related')}
            onStopPicking={() => void stopPicker()}
          />
        </div>
      </div>
    </main>
  );
}
