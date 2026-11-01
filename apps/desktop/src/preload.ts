// The only bridge between the UI and the main process: a fixed set of calls (window.gtt), the shell's and one
// namespace per module that moved into its folder (window.gtt.<id>, built by the module's own part, e.g.
// modules/overlays/main/preload.ts). Runs sandboxed with context isolation; the UI never sees ipcRenderer itself.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { BridgeScope } from '@gt-toolz/core/api';
import { CREW, type CrewApi } from '@gt-toolz/crew/api';
import { crewBridge } from '@gt-toolz/crew/preload';
import { HAPTICS, type HapticsApi } from '@gt-toolz/haptics/api';
import { hapticsBridge } from '@gt-toolz/haptics/preload';
import { OVERLAYS, type OverlaysApi } from '@gt-toolz/overlays/api';
import { overlaysBridge } from '@gt-toolz/overlays/preload';
import { TELEMETRY, type TelemetryApi } from '@gt-toolz/telemetry-module/api';
import { telemetryBridge } from '@gt-toolz/telemetry-module/preload';
import type { GttApi, Unsubscribe } from '@gt-toolz/runtime/app-api';

const invoke = <T>(name: string, ...args: unknown[]) => ipcRenderer.invoke(`gtt:${name}`, ...args) as Promise<T>;

function subscribe<T>(channel: string): (listener: (value: T) => void) => Unsubscribe {
  return (listener) => {
    const handler = (_event: IpcRendererEvent, value: T) => listener(value);
    ipcRenderer.on(`gtt:${channel}`, handler);
    return () => ipcRenderer.removeListener(`gtt:${channel}`, handler);
  };
}

/** A module's namespace: its calls are gtt:<id>:<name>, its events gtt:<id>:<event>. */
const scope = (id: string): BridgeScope => ({
  invoke: <T>(name: string, ...args: unknown[]) => invoke<T>(`${id}:${name}`, ...args),
  subscribe: <T>(event: string) => subscribe<T>(`${id}:${event}`),
});

const api: GttApi & { [TELEMETRY]: TelemetryApi; [CREW]: CrewApi; [OVERLAYS]: OverlaysApi; [HAPTICS]: HapticsApi } = {
  info: () => invoke('info'),
  getConfig: () => invoke('getConfig'),
  setSettings: (settings) => invoke('setSettings', settings),
  setModuleEnabled: (id, enabled) => invoke('setModuleEnabled', id, enabled),
  onModules: subscribe('modules'),
  setGuideDone: (done) => invoke('setGuideDone', done),
  languages: () => invoke('languages'),

  getStatus: () => invoke('getStatus'),
  onStatus: subscribe('status'),
  onActivity: subscribe('activity'),
  onCue: subscribe('cue'),
  onLive: subscribe('live'),
  testAudio: () => invoke('testAudio'),
  startCalibration: () => invoke('startCalibration'),
  stopCalibration: () => invoke('stopCalibration'),
  samples: () => invoke('samples'),
  startBriefing: () => invoke('startBriefing'),
  stopBriefing: () => invoke('stopBriefing'),
  startDebrief: () => invoke('startDebrief'),
  stopDebrief: () => invoke('stopDebrief'),
  playSample: (id) => invoke('playSample', id),
  stopSample: () => invoke('stopSample'),

  forgetHistory: (id) => invoke('forgetHistory', id),

  listVoices: () => invoke('listVoices'),
  previewVoice: (id, role) => invoke('previewVoice', id, role),
  texts: (language) => invoke('texts', language),
  checkText: (key, value, language) => invoke('checkText', key, value, language),
  previewText: (text, language, speaker) => invoke('previewText', text, language, speaker),
  voicePackages: () => invoke('voicePackages'),
  installVoicePackages: (ids) => invoke('installVoicePackages', ids),
  cancelVoiceInstall: () => invoke('cancelVoiceInstall'),
  removeVoicePackages: (ids) => invoke('removeVoicePackages', ids),
  onVoiceInstall: subscribe('voice-install'),

  recordingPacks: () => invoke('recordingPacks'),
  createRecordingPack: (details) => invoke('createRecordingPack', details),
  updateRecordingPack: (id, details) => invoke('updateRecordingPack', id, details),
  deleteRecordingPack: (id) => invoke('deleteRecordingPack', id),
  recordingCatalog: (id) => invoke('recordingCatalog', id),
  saveRecording: (id, text, section, wav) => invoke('saveRecording', id, text, section, wav),
  deleteRecording: (id, key) => invoke('deleteRecording', id, key),
  recordingAudio: (id, key) => invoke('recordingAudio', id, key),
  previewRecordingPack: (id) => invoke('previewRecordingPack', id),
  exportRecordingPack: (id, consent) => invoke('exportRecordingPack', id, consent),
  importRecordingPack: (confirmed) => invoke('importRecordingPack', confirmed),

  licenses: () => invoke('licenses'),
  openChromiumLicenses: () => invoke('openChromiumLicenses'),
  links: () => invoke('links'),
  openLink: (id) => invoke('openLink', id),
  openFolder: (kind) => invoke('openFolder', kind),
  exportLog: () => invoke('exportLog'),
  updateStatus: () => invoke('updateStatus'),
  checkForUpdate: () => invoke('checkForUpdate'),
  installUpdate: () => invoke('installUpdate'),
  onUpdate: subscribe('update'),
  dataSummary: () => invoke('dataSummary'),
  resetData: (keepVoices) => invoke('resetData', keepVoices),

  [TELEMETRY]: telemetryBridge(scope(TELEMETRY)),
  [CREW]: crewBridge(scope(CREW)),
  [OVERLAYS]: overlaysBridge(scope(OVERLAYS)),
  [HAPTICS]: hapticsBridge(scope(HAPTICS)),
};

contextBridge.exposeInMainWorld('gtt', api);
