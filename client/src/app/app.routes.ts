import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./features/lists/lists.component').then((m) => m.ListsComponent),
    },
    {
        path: 'list/:id',
        loadComponent: () =>
            import('./features/list-detail/list-detail.component').then((m) => m.ListDetailComponent),
    },
    {
        path: 'join/:id',
        loadComponent: () =>
            import('./features/join/join.component').then((m) => m.JoinComponent),
    },
    {
        path: 'sync/:id',
        loadComponent: () =>
            import('./features/sync/sync.component').then((m) => m.SyncComponent),
    },
    {
        path: 'sync-receive/:id',
        loadComponent: () =>
            import('./features/sync-receive/sync-receive.component').then((m) => m.SyncReceiveComponent),
    },
    {
        path: 'settings',
        loadComponent: () =>
            import('./features/settings/settings.component').then((m) => m.SettingsComponent),
    },
    {
        path: 'about',
        loadComponent: () =>
            import('./features/about/about.component').then((m) => m.AboutComponent),
    },
    {
        path: '**',
        redirectTo: '',
    },
];
