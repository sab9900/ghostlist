import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';
import { ApiService } from '../../api/api.service';
import { APP_VERSION } from '../../version';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';

@Component({
    selector: 'app-about',
    imports: [TranslatePipe, SwipeBackDirective],
    templateUrl: './about.component.html',
    styleUrl: './about.component.scss',
})
export class AboutComponent implements OnInit {
    private readonly router = inject(Router);
    private readonly api = inject(ApiService);

    readonly frontendVersion = APP_VERSION;
    readonly backendVersion = signal<string | null>(null);

    /** Show the "download the Android app" link only in the mobile browser (not inside the native app itself). */
    readonly isAndroidWeb = !Capacitor.isNativePlatform() && /android/i.test(navigator.userAgent);

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
