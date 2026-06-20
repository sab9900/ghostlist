import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { KnownList, ListMember } from '../../../../core/models';
import { AvatarComponent } from '../../../../shared/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/badge/badge.component';

const MAX_VISIBLE_AVATARS = 3;

@Component({
    selector: 'app-list-card',
    imports: [DatePipe, AvatarComponent, BadgeComponent],
    templateUrl: './list-card.component.html',
    styleUrl: './list-card.component.scss',
})
export class ListCardComponent {
    readonly list = input.required<KnownList>();
    readonly unread = input(0);
    readonly isActive = input(false);
    readonly members = input<ListMember[]>([]);

    readonly open = output<void>();

    private readonly uniqueMembers = computed(() => {
        const seen = new Set<string>();
        const result: ListMember[] = [];
        for (const m of this.members()) {
            const key = m.userId ? `user:${m.userId}` : `device:${m.deviceId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(m);
        }
        return result;
    });

    private readonly uniqueUserKeys = computed(() =>
        new Set(this.members().map(m => m.userId ? `user:${m.userId}` : `device:${m.deviceId}`)),
    );

    protected readonly isShared = computed(() => this.uniqueUserKeys().size > 1);
    protected readonly avatarMembers = computed(() => this.uniqueMembers().slice(0, MAX_VISIBLE_AVATARS));
    protected readonly extraCount = computed(() => Math.max(0, this.uniqueMembers().length - MAX_VISIBLE_AVATARS));
}
