import { BRIDGE_SOURCE } from '@/shared/constants';
import { createMessage } from '@/shared/messages';
import type { NetworkRecord } from '@/shared/types';

export function listenForInjectedNetworkEvents(onRecord: (record: NetworkRecord) => void): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }

    const payload = event.data as
      | {
          source?: string;
          type?: string;
          payload?: NetworkRecord;
        }
      | undefined;

    if (!payload || payload.source !== BRIDGE_SOURCE || payload.type !== 'NETWORK_EVENT' || !payload.payload) {
      return;
    }

    onRecord(payload.payload);
  });
}

export async function emitObservedNetworkRecord(record: NetworkRecord): Promise<void> {
  try {
    await chrome.runtime.sendMessage(
      createMessage('content', 'background', 'NETWORK_OBSERVED', {
        record,
      }),
    );
  } catch {
    // Background service worker may not be active yet. The record is lost
    // but this prevents the network listener from crashing entirely.
  }
}
