import type {
  AppSnapshot,
  ElementSnapshot,
  FieldSelection,
  InsertPosition,
  NetworkRecord,
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

// Bootstrap & project
export type AppBootstrapMessage = MessageEnvelope<'APP_BOOTSTRAP', { tabId?: number }>;
export type ProjectCreateMessage = MessageEnvelope<'PROJECT_CREATE', { name: string }>;
export type ProjectExportMessage = MessageEnvelope<'PROJECT_EXPORT', { projectId: string; tabId?: number }>;

// Requirements CRUD
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
  { tabId: number; pageId: string; requirementId: string }
>;
export type RequirementRemoveElementMessage = MessageEnvelope<
  'REQUIREMENT_REMOVE_ELEMENT',
  { tabId: number; pageId: string; requirementId: string; elementId: string }
>;
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
  { tabId: number; pageId: string; requirementId: string; networkRecordId: string }
>;
export type RequirementRemoveFieldMessage = MessageEnvelope<
  'REQUIREMENT_REMOVE_FIELD',
  { tabId: number; pageId: string; requirementId: string; networkRecordId: string; fieldPath: string }
>;

export type RequirementPromoteAnchorMessage = MessageEnvelope<
  'REQUIREMENT_PROMOTE_ANCHOR',
  { tabId: number; pageId: string; requirementId: string; elementId: string }
>;

// Content script ping
export type ContentPingMessage = MessageEnvelope<'CONTENT_PING', Record<string, never>>;

// Context menu element capture
export type ContextMenuPickMessage = MessageEnvelope<
  'CONTEXT_MENU_PICK',
  { pageId: string; requirementId: string; mode: 'anchor' | 'related' }
>;
export type ElementPickedMessage = MessageEnvelope<
  'ELEMENT_PICKED',
  { pageId: string; requirementId: string; mode: 'anchor' | 'related'; element: ElementSnapshot }
>;

// Side panel ↔ background context sync
export type SidepanelContextUpdateMessage = MessageEnvelope<
  'SIDEPANEL_CONTEXT_UPDATE',
  { tabId: number; pageId: string; requirementId: string }
>;
export type StateChangedMessage = MessageEnvelope<'STATE_CHANGED', { reason: string }>;

// Network capture
export type NetworkObservedMessage = MessageEnvelope<'NETWORK_OBSERVED', { record: NetworkRecord }>;

// Insert position indicators on page
export type ShowInsertIndicatorsMessage = MessageEnvelope<
  'SHOW_INSERT_INDICATORS',
  { selector: string; currentPosition?: InsertPosition }
>;
export type HideInsertIndicatorsMessage = MessageEnvelope<'HIDE_INSERT_INDICATORS', Record<string, never>>;
export type InsertPositionSelectedMessage = MessageEnvelope<
  'INSERT_POSITION_SELECTED',
  { pageId: string; requirementId: string; position: InsertPosition }
>;

// Cancel anchor (from insert indicators on page)
export type CancelAnchorMessage = MessageEnvelope<'CANCEL_ANCHOR', Record<string, never>>;

// Bidirectional element highlight
export type HighlightElementMessage = MessageEnvelope<'HIGHLIGHT_ELEMENT', { selector: string }>;
export type UnhighlightElementMessage = MessageEnvelope<'UNHIGHLIGHT_ELEMENT', Record<string, never>>;

export type RuntimeMessage =
  | AppBootstrapMessage
  | ProjectCreateMessage
  | ProjectExportMessage
  | RequirementCreateMessage
  | RequirementUpdateMessage
  | RequirementDeleteMessage
  | RequirementRemoveElementMessage
  | RequirementAttachFieldsMessage
  | RequirementRemoveDataDependencyMessage
  | RequirementRemoveFieldMessage
  | RequirementPromoteAnchorMessage
  | ContentPingMessage
  | ContextMenuPickMessage
  | ElementPickedMessage
  | SidepanelContextUpdateMessage
  | StateChangedMessage
  | NetworkObservedMessage
  | ShowInsertIndicatorsMessage
  | HideInsertIndicatorsMessage
  | InsertPositionSelectedMessage
  | CancelAnchorMessage
  | HighlightElementMessage
  | UnhighlightElementMessage;

export type MessageResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ProjectResponse = MessageResponse<Project>;
export type SnapshotResponse = MessageResponse<AppSnapshot>;
export type EmptyResponse = MessageResponse<{ success: true }>;

export function createMessage<TType extends RuntimeMessage['type'], TPayload>(
  source: RuntimeMessageSource,
  target: RuntimeMessageTarget,
  type: TType,
  payload: TPayload,
): MessageEnvelope<TType, TPayload> {
  return { source, target, type, payload };
}
