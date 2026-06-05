import { Component, input } from '@angular/core';

@Component({
    selector: 'app-badge',
    template: `{{ count() }}`,
    styleUrl: './badge.component.scss',
})
export class BadgeComponent {
    readonly count = input.required<number>();
}
