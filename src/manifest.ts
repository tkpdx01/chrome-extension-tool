import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Offline Capture Assistant',
  version: '0.1.0',
  description:
    'Capture DOM, requirement points, and network fields from intranet pages for offline Chrome extension development.',
  permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'sidePanel', 'downloads', 'contextMenus'],
  host_permissions: ['<all_urls>'],
  action: {
    default_title: 'Open Offline Capture Assistant',
  },
  background: {
    service_worker: 'src/background/main.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'sidepanel.html',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
    },
    {
      matches: ['<all_urls>'],
      js: ['src/injected/networkHook.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
  ],
});
