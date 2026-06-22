import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { prefersReducedMotion } from '../utils/reduced-motion.util';

export type PageTransitionDirection = 'push' | 'pop' | 'replace';

function topSegment(url: string): string {
    const path = url.split('?')[0].split('#')[0];
    return path.split('/').filter(Boolean)[0] ?? '';
}

@Injectable({ providedIn: 'root' })
export class PageTransitionService {

    private readonly router = inject(Router);

    readonly reducedMotion = signal(prefersReducedMotion());

    private stack: string[] = [];
    private gestureDriven = false;
    private parentSnapshot: HTMLElement | null = null;

    constructor() {
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            window.matchMedia('(prefers-reduced-motion: reduce)')
                .addEventListener('change', (e) => this.reducedMotion.set(e.matches));
        }
    }

    resolveDirection(nextUrl: string): PageTransitionDirection {
        if (this.stack.length === 0) {
            this.stack = [topSegment(this.router.url)];
        }

        const nextKey = topSegment(nextUrl);
        const currentKey = this.stack[this.stack.length - 1];

        if (nextKey === currentKey) return 'replace';

        if (this.stack.length >= 2 && this.stack[this.stack.length - 2] === nextKey) {
            this.stack.pop();
            return 'pop';
        }

        this.stack.push(nextKey);
        return 'push';
    }

    beginGestureNavigation(): void {
        this.gestureDriven = true;
    }

    consumeGestureFlag(): boolean {
        const value = this.gestureDriven;
        this.gestureDriven = false;
        return value;
    }

    storeParentSnapshot(el: HTMLElement | null): void {
        this.parentSnapshot = el;
    }

    takeParentSnapshotClone(): HTMLElement | null {
        return this.parentSnapshot ? (this.parentSnapshot.cloneNode(true) as HTMLElement) : null;
    }
}
