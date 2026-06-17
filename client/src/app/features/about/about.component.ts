import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideBell, LucideBellOff, LucideChevronLeft, LucideGhost, LucideLock, LucideRepeat, LucideShield, LucideUpload } from "@lucide/angular";
import { TranslatePipe } from '@ngx-translate/core';
import { ApiService } from '../../api/api.service';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';
import { APP_VERSION } from '../../version';

@Component({
    selector: 'app-about',
    imports: [
        TranslatePipe,
        SwipeBackDirective,
        LucideChevronLeft,
        LucideLock,
        LucideUpload,
        LucideRepeat,
        LucideShield,
        LucideGhost,
        LucideBell,
        LucideBellOff],
    templateUrl: './about.component.html',
    styleUrl: './about.component.scss',
})
export class AboutComponent implements OnInit {
    private readonly router = inject(Router);
    private readonly api = inject(ApiService);

    readonly frontendVersion = APP_VERSION;
    readonly backendVersion = signal<string | null>(null);

    ngOnInit(): void {
        this.api.getBackendVersion().subscribe({
            next: (res) => this.backendVersion.set(res.version),
            error: () => this.backendVersion.set(null),
        });
    }

    goBack(): void {
        this.router.navigate(['/']);
    }
}
