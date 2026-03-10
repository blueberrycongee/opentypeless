import type { RuntimeInfo } from '../../shared/ipc';

import { plannedModules } from './modules';

export function buildRuntimeInfo(platform: NodeJS.Platform): RuntimeInfo {
  return {
    appName: 'OpenTypeless',
    platform,
    modules: plannedModules
  };
}
