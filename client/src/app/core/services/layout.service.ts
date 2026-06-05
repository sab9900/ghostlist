import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
    private readonly mq =
        typeof window !== 'undefined' ? window.matchMedia('(min-width: 900px)') : null;

    readonly isDesktop = signal(this.mq?.matches ?? false);

    constructor() {
        this.mq?.addEventListener('change', e => this.isDesktop.set(e.matches));
    }
}
