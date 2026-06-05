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
        path: '**',
        redirectTo: '',
    },
];
