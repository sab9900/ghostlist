import { Injectable, signal } from '@angular/core';

export type SnackIconKind = 'item' | 'chat' | 'lethe' | 'charon' | 'reminder' | 'nemesis';

export interface SnackAction {
    label: string;
    run: () => void;
}

export interface Snack {
    id: string;
    iconKind: SnackIconKind;
    text: string;
    autoDismissMs: number | null;
    goAction: SnackAction | null;
    onDismiss: (() => void) | null;
}

export type SnackInput = Omit<Snack, 'id' | 'goAction' | 'onDismiss'> &
    Partial<Pick<Snack, 'id' | 'goAction' | 'onDismiss'>>;

const MAX_VISIBLE = 4;

@Injectable({ providedIn: 'root' })
export class SnackService {
    private readonly visible = signal<Snack[]>([]);
    private readonly pending: Snack[] = [];
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
    private seq = 0;

    readonly snacks = this.visible.asReadonly();

    show(input: SnackInput): string {
        const snack: Snack = {
            id: input.id ?? `snack-${++this.seq}`,
            iconKind: input.iconKind,
            text: input.text,
            autoDismissMs: input.autoDismissMs,
            goAction: input.goAction ?? null,
            onDismiss: input.onDismiss ?? null,
        };

        if (this.visible().some(s => s.id === snack.id) || this.pending.some(s => s.id === snack.id)) {
            return snack.id;
        }

        if (this.visible().length < MAX_VISIBLE) {
            this.activate(snack);
        } else {
            this.pending.push(snack);
        }

        return snack.id;
    }

    dismiss(id: string): void {
        const snack = this.visible().find(s => s.id === id);
        this.clearTimer(id);
        this.visible.update(list => list.filter(s => s.id !== id));

        const pendingIndex = this.pending.findIndex(s => s.id === id);
        if (pendingIndex !== -1) this.pending.splice(pendingIndex, 1);

        snack?.onDismiss?.();
        this.promoteNext();
    }

    runGoAction(id: string): void {
        const snack = this.visible().find(s => s.id === id);
        snack?.goAction?.run();
        this.dismiss(id);
    }

    dismissAll(): void {
        for (const s of this.visible()) this.clearTimer(s.id);
        this.visible.set([]);
        this.pending.length = 0;
    }

    private activate(snack: Snack): void {
        this.visible.update(list => [...list, snack]);
        if (snack.autoDismissMs !== null) {
            const timer = setTimeout(() => this.dismiss(snack.id), snack.autoDismissMs);
            this.timers.set(snack.id, timer);
        }
    }

    private promoteNext(): void {
        if (this.visible().length >= MAX_VISIBLE) return;
        const next = this.pending.shift();
        if (next) this.activate(next);
    }

    private clearTimer(id: string): void {
        const timer = this.timers.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.timers.delete(id);
        }
    }
}
