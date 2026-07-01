import { Component, input, output, signal } from '@angular/core';
import { LucideCoffee, LucideDownload, LucideInfo, LucideMenu, LucideSettings, LucideUpload } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { BadgeComponent } from '../../../../shared/badge/badge.component';

@Component({
    selector: 'app-lists-header',
    imports: [TranslatePipe, BadgeComponent, LucideMenu, LucideDownload, LucideUpload, LucideSettings, LucideCoffee, LucideInfo],
    templateUrl: './lists-header.component.html',
    styleUrl: './lists-header.component.scss',
})
export class ListsHeaderComponent {
    readonly totalUnread = input(0);
    readonly showCoffeeLink = input(true);
    readonly filterActive = input(false);
    readonly filterHasQuery = input(false);

    readonly logoClick = output<void>();
    readonly filterClick = output<void>();
    readonly markAllReadOpen = output<void>();
    readonly importOpen = output<void>();
    readonly exportOpen = output<void>();
    readonly settingsOpen = output<void>();
    readonly aboutOpen = output<void>();

    protected readonly showMenu = signal(false);

    toggleMenu(): void { this.showMenu.update(v => !v); }
    closeMenu(): void { this.showMenu.set(false); }

    onImport(): void { this.closeMenu(); setTimeout(() => this.importOpen.emit(), 0); }
    onExport(): void { this.closeMenu(); setTimeout(() => this.exportOpen.emit(), 0); }
    onSettings(): void { this.closeMenu(); setTimeout(() => this.settingsOpen.emit(), 0); }
    onAbout(): void { this.closeMenu(); setTimeout(() => this.aboutOpen.emit(), 0); }
}
