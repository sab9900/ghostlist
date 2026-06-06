import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LayoutService } from './core/services/layout.service';
import { ListsComponent } from './features/lists/lists.component';

const SIDEBAR_WIDTH_KEY = 'gl_sidebar_width';
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 320;

function loadSidebarWidth(): number {
    try {
        const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
        if (stored) {
            const n = parseInt(stored, 10);
            if (!isNaN(n)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
        }
    } catch { }
    return SIDEBAR_DEFAULT;
}

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, ListsComponent],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App {
    protected readonly layout = inject(LayoutService);
    private readonly router = inject(Router);

    constructor() {
        if (Capacitor.isNativePlatform()) {
            StatusBar.setStyle({ style: Style.Default }).catch(() => {});

            Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
                document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
            });
            Keyboard.addListener('keyboardWillHide', () => {
                document.documentElement.style.setProperty('--keyboard-height', '0px');
            });
        }
    }

    protected readonly currentUrl = toSignal(
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            map(e => (e as NavigationEnd).urlAfterRedirects),
            startWith(this.router.url),
        ),
        { initialValue: this.router.url },
    );

    protected readonly showDetail = computed(() => {
        const url = this.currentUrl();
        return !!(url?.startsWith('/list/') || url?.startsWith('/settings') || url?.startsWith('/about'));
    });

    protected readonly sidebarWidth = signal(loadSidebarWidth());
    protected readonly resizing = signal(false);

    onResizeStart(startEvent: MouseEvent): void {
        startEvent.preventDefault();

        const startX = startEvent.clientX;
        const startWidth = this.sidebarWidth();

        this.resizing.set(true);

        const onMove = (e: MouseEvent) => {
            const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + e.clientX - startX));
            this.sidebarWidth.set(next);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.resizing.set(false);
            try {
                localStorage.setItem(SIDEBAR_WIDTH_KEY, String(this.sidebarWidth()));
            } catch { }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
}
