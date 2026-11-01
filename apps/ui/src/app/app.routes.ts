import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn, type Routes } from '@angular/router';
import type { ModuleId } from '@gtt/api';
import { MODULE_UIS } from './modules';
import { SettingsStore } from './stores/settings.store';

/** A module's pages only while it is on (switched off, they lead to the start page). */
const moduleOn =
  (id: ModuleId): CanMatchFn =>
  async () => {
    const settings = inject(SettingsStore);
    await settings.whenLoaded();
    return settings.moduleEnabled(id);
  };

/** The start page: the first page of the first module that is on (the telemetry's Cockpit; it is always on). */
const home: CanActivateFn = async () => {
  const settings = inject(SettingsStore);
  const router = inject(Router);
  await settings.whenLoaded();
  const module = MODULE_UIS.find((m) => settings.moduleEnabled(m.id));
  return router.createUrlTree(module ? [module.id, module.pages[0]!.path] : ['modules']);
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [home], children: [] },
  { path: 'modules', loadComponent: () => import('./pages/modules/modules').then((m) => m.ModulesPage) },
  ...MODULE_UIS.map((module) => ({
    path: module.id,
    canMatch: [moduleOn(module.id)],
    children: [...module.routes, { path: '', pathMatch: 'full' as const, redirectTo: module.pages[0]!.path }],
  })),
  { path: 'voices', loadComponent: () => import('./pages/voices/voices').then((m) => m.Voices) },
  { path: 'texts', loadComponent: () => import('./pages/texts/texts').then((m) => m.Texts) },
  { path: 'recordings', loadComponent: () => import('./pages/recordings/recordings').then((m) => m.Recordings) },
  { path: 'listen', loadComponent: () => import('./pages/listen/listen').then((m) => m.Listen) },
  { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
  { path: 'about', loadComponent: () => import('./pages/about/about').then((m) => m.About) },
  { path: 'licenses', loadComponent: () => import('./pages/licenses/licenses').then((m) => m.Licenses) },
  // Old addresses (before the modules, 0.0.5-alpha) and anything unknown: the start page.
  { path: '**', redirectTo: '' },
];
