import { Component, computed, input } from '@angular/core';

/** Small circular avatar showing a member's initial on a deterministic, name-based color. */
@Component({
    selector: 'app-avatar',
    template: `
        <div
            class="avatar"
            [style.background]="color()"
            [style.width.px]="size()"
            [style.height.px]="size()"
            [style.fontSize.px]="size() * 0.5"
            [attr.title]="name()"
            [attr.aria-label]="name()"
        >{{ initial() }}</div>
    `,
    styleUrl: './avatar.component.scss',
})
export class AvatarComponent {
    readonly name = input.required<string>();
    readonly size = input<number>(24);

    protected readonly initial = computed(() => (this.name().trim().charAt(0) || '?').toUpperCase());
    protected readonly color = computed(() => nameToColor(this.name()));
}

function nameToColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 50%, 42%)`;
}
