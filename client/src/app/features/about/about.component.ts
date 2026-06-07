import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-about',
    imports: [TranslatePipe],
    templateUrl: './about.component.html',
    styleUrl: './about.component.scss',
})
export class AboutComponent {
    private readonly router = inject(Router);

    goBack(): void {
        this.router.navigate(['/']);
    }
}
