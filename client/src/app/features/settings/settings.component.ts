import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Theme, ThemeAccent, ThemeService } from '../../core/services/theme.service';

@Component({
    selector: 'app-settings',
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.scss',
})
export class SettingsComponent {
    protected readonly themeService = inject(ThemeService);
    private readonly router = inject(Router);

    protected readonly themeOptions: { value: Theme; label: string; description: string }[] = [
        { value: 'system', label: 'System', description: 'Follows your device setting' },
        { value: 'light', label: 'Light', description: 'Always light' },
        { value: 'dark', label: 'Dark', description: 'Always dark' },
    ];

    protected readonly accentOptions: { value: ThemeAccent; label: string; color: string }[] = [
        { value: 'violet', label: 'Violet', color: '#7c6af7' },
        { value: 'cyan',   label: 'Cyan',   color: '#06b6d4' },
        { value: 'red',    label: 'Red',    color: '#f87171' },
        { value: 'noir',   label: 'Noir',   color: 'linear-gradient(135deg, #111114 50%, #f0f0f2 50%)' },
    ];

    setTheme(theme: Theme): void {
        this.themeService.set(theme);
    }

    setAccent(accent: ThemeAccent): void {
        this.themeService.setAccent(accent);
    }

    goBack(): void {
        this.router.navigate(['/']);
    }
}
