import type {
  AppSnapshot,
  ElementSnapshot,
  FieldSelection,
  InsertPosition,
  NetworkRecord,
  PickerMode,
  Project,
} from '@/shared/types';

export type RuntimeMessageSource = 'sidepanel' | 'background' | 'content' | 'injected';
export type RuntimeMessageTarget = 'sidepanel' | 'background' | 'content';

export type MessageEnvelope<TType extends string, TPayload> = {
  source: RuntimeMessageSource;
  target: RuntimeMessageTarget;
  type: TType;
  requestId?: string;
  payload: TPayload;
};

export type AppBootstrapMessage = MessageEnvelope<'APP_BOOTSTRAP', { tabId: number }>;
export type ProjectCreateMessage = MessageEnvelope<'PROJECT_CREATE', { name: string }>;
export type RequirementCreateMessage = MessageEnvelope<
  'REQUIREMENT_CREATE',
  { tabId: number; pageId: string; name: string; description?: string }
>;
export type RequirementUpdateMessage = MessageEnvelope<
  'REQUIREMENT_UPDATE',
  {
    tabId: number;
    pageId: string;
    requirementId: string;
    patch: {
      name?: string;
      description?: string;
      notes?: string;
      insertPosition?: InsertPosition;
    };
  }
>;
export type RequirementDeleteMessage = MessageEnvelope<
  'REQUIREMENT_DELETE',
  {
    tabId: number;
    pageId: string;
    requirementId: string;
  }
>;
export type RequirementRemoveElementMessage = MessageEnvelope<
  'REQUIREMENT_REMOVE_ELEMENT',
  {
    tabId: number;
    pageId: string;
    requirementId: string;
    elementId: string;
  }
>;
export type PickerStartMessage = MessageEnvelope<
  'PICKER_START',
  { tabId: number; pageId: string; requirementId: string; mode: Exclude<PickerMode, 'idle'> }
>;
export type PickerStopMessage = MessageEnvelope<'PICKER_STOP', { tabId: number }>;
export type PickerActivateMessage = MessageEnvelope<
  'PICKER_ACTIVATE',
  { pageId: string; requirementId: string; mode: Exclude<PickerMode, 'idle'> }
>;
export type PickerDeactivateMessage = MessageEnvelope<'PICKER_DEACTIVATE', Record<string, never>>;
export type ElementPickedMessage = MessageEnvelope<
  'ELEMENT_PICKED',
  {
    pageId: string;
    requirementId: string;
    mode: Exclude<PickerMode, 'idle'>;
    element: ElementSnapshot;
  }
>;
export type NetworkObservedMessage = MessageEnvelope<'NETWORK_OBSERVED', { record: NetworkRecord }>;
export type RequirementAttachFieldsMessage = MessageEnvelope<
  'REQUIREMENT_ATTACH_FIELDS',
  {
    tabId: number;
    pageId: string;
    requirementId: string;
    networkRecordId: string;
    fields: FieldSelection[];
  }
>;
export type RequirementRemoveDataDependencyMessage = MessageEnvelope<
  'REQUIREMENT_REMOVE_DATA_DEPENDENCY',
  {
    tabId: number;
    pageId: string;
    requirementId: string;
    networkRecordId: string;
  }
>;
export type RequirementRemoveFieldMessage = MessageEnvelope<
  'REQUIREMENT_REMOVE_FIELD',
  {
    tabId: number;
    pageId: string;
    requirementId: string;
    networkRecordId: string;
    fieldPath: string;
  }
>;
export type ProjectExportMessage = MessageEnvelope<'PROJECT_EXPORT', { projectId: string }>;
export type StateChangedMessage = MessageEnvelope<'STATE_CHANGED', { reason: string }>;

export type RuntimeMessage =
  | AppBootstrapMessage
  | ProjectCreateMessage
  | RequirementCreateMessage
  | RequirementUpdateMessage
  | RequirementDeleteMessage
  | RequirementRemoveElementMessage
  | PickerStartMessage
  | PickerStopMessage
  | PickerActivateMessage
  | PickerDeactivateMessage
  | ElementPickedMessage
  | NetworkObservedMessage
  | RequirementAttachFieldsMessage
  | RequirementRemoveDataDependencyMessage
  | RequirementRemoveFieldMessage
  | ProjectExportMessage
  | StateChangedMessage;

export type MessageResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export type ProjectResponse = MessageResponse<Project>;
export type SnapshotResponse = MessageResponse<AppSnapshot>;
export type EmptyResponse = MessageResponse<{ success: true }>;

export function createMessage<TType extends RuntimeMessage['type'], TPayload>(
  source: RuntimeMessageSource,
  target: RuntimeMessageTarget,
  type: TType,
  payload: TPayload,
): MessageEnvelope<TType, TPayload> {
  return {
    source,
    target,
    type,
    payload,
  };
}
