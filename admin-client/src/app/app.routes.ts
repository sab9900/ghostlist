import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () =>
            import('./features/login/login.component').then((m) => m.LoginComponent),
    },
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    },
    {
        path: '**',
        redirectTo: '',
    },
];
