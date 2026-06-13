import { Injectable, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

const LS_DISMISSED_KEY = 'gl_pwa_install_dismissed';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
    private readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);
    private readonly dismissed = signal(localStorage.getItem(LS_DISMISSED_KEY) === '1');

    readonly canInstall = computed(() =>
        this.deferredPrompt() !== null &&
        !this.dismissed() &&
        !isStandalone() &&
        !Capacitor.isNativePlatform(),
    );

    constructor() {
        if (typeof window === 'undefined') return;

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            this.deferredPrompt.set(event as BeforeInstallPromptEvent);
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt.set(null);
            this.setDismissed();
        });
    }

    async promptInstall(): Promise<void> {
        const event = this.deferredPrompt();
        if (!event) return;
        this.deferredPrompt.set(null);
        try {
            await event.prompt();
            await event.userChoice;
        } catch { }
    }

    dismiss(): void {
        this.setDismissed();
    }

    private setDismissed(): void {
        this.dismissed.set(true);
        try {
            localStorage.setItem(LS_DISMISSED_KEY, '1');
        } catch { }
    }
}
