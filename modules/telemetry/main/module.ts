// The telemetry in the main process, the module every other one reads (docs/dev/modules.md): it runs the telemetry
// session (main/session.ts) with its settings, takes up the reference the last session ended with and remembers each
// new one, and answers the UI's calls about the references (window.gtt.telemetry). The session is created by the
// shell, which hands it to coach and crew as their feed.

import path from 'node:path';
import { asObject, asString, type ModuleDefinition } from '@gt-toolz/core';
import { cleanDetails, deleteReference, listReferences, referenceFile, updateReferenceDetails } from '@gt-toolz/runtime';
import { TELEMETRY, type TelemetryModuleSettings } from '../src/api';
import { defaultSettings, normalizeSettings } from '../src/settings';
import type { TelemetrySession } from './session';

export function telemetryModule(session: TelemetrySession, referencesDir: string): ModuleDefinition<TelemetryModuleSettings> {
  return {
    id: TELEMETRY,
    enabledByDefault: true,
    // Every other module reads it.
    required: true,
    settings: { defaults: defaultSettings, normalize: normalizeSettings },

    start(host) {
      const { handle } = host.bridge;
      // The reference in use, for the next start: also when it was picked or learned while driving. A config file a
      // virus scanner holds must not stop the telemetry (release check 2026-10-28).
      const remember = (id: string | undefined) => {
        if (host.settings().activeReference === id) return;
        host.updateSettings({ activeReference: id }).catch((err: Error) => host.log(`ERROR     config.json not saved: ${err.message}`));
      };
      const onReference = ({ file }: { file?: string }) => remember(file ? path.basename(file, '.json') : undefined);
      session.on('reference', onReference);

      // --- Calls from the UI ---
      handle('listReferences', () => listReferences(referencesDir));
      handle('activateReference', (id, learn) => {
        if (id === null) return session.choose(undefined, cleanDetails(asObject(learn)));
        const file = referenceFile(referencesDir, asString(id));
        if (!file) throw new Error('Unknown reference');
        session.choose(file);
      });
      handle('updateReference', (id, details) => {
        const clean = cleanDetails(asObject(details));
        const summary = updateReferenceDetails(referencesDir, asString(id), clean);
        if (!summary) throw new Error('Unknown reference');
        session.detailsChanged(summary.file, clean);
        return summary;
      });
      handle('deleteReference', (id) => {
        const name = asString(id);
        if (host.settings().activeReference === name) session.choose(undefined);
        if (!deleteReference(referencesDir, name)) throw new Error('Unknown reference');
      });

      // The one the last session ended with, if it is still there.
      const active = host.settings().activeReference;
      void session.start(active ? referenceFile(referencesDir, active) : undefined);

      return {
        settingsChanged: (next, before) => void session.settingsChanged(next, before),
        async stop() {
          session.off('reference', onReference);
          await session.stop();
        },
      };
    },
  };
}
