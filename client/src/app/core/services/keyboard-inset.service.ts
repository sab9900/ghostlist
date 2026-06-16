import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class KeyboardInsetService {
    private started = false;

    private capacitorHeight = 0;
    private viewportHeight = 0;

    readonly height = signal(0);

    readonly willShow$ = new Subject<void>();

    readonly willHide$ = new Subject<void>();

    start(): void {
        if (this.started || typeof window === 'undefined') return;
        this.started = true;

        if (Capacitor.isNativePlatform()) {
            Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
                this.capacitorHeight = keyboardHeight;
                this.recompute();
            });
            Keyboard.addListener('keyboardWillHide', () => {
                this.capacitorHeight = 0;
                this.recompute();
            });
        }

        const vv = window.visualViewport;
        if (vv) {
            const onViewportChange = () => {
                const overlap = window.innerHeight - vv.height - vv.offsetTop;
                this.viewportHeight = Math.max(0, Math.round(overlap));
                this.recompute();
            };
            vv.addEventListener('resize', onViewportChange);
            vv.addEventListener('scroll', onViewportChange);
            onViewportChange();
        }
    }

    private recompute(): void {
        const next = Math.max(this.capacitorHeight, this.viewportHeight);
        const prev = this.height();
        if (next === prev) return;

        this.height.set(next);
        document.documentElement.style.setProperty('--keyboard-height', `${next}px`);

        if (prev === 0 && next > 0) this.willShow$.next();
        else if (prev > 0 && next === 0) this.willHide$.next();
    }
}
