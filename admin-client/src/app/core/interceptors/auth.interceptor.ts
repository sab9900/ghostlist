import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the stored Basic Auth header to outgoing requests and, on a 401
 * response, clears the stored credentials and redirects to the login page.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const header = auth.getAuthHeader();
    const authedReq = header ? req.clone({ setHeaders: { Authorization: header } }) : req;

    return next(authedReq).pipe(
        catchError((err) => {
            if (err.status === 401) {
                auth.logout();
                void router.navigate(['/login']);
            }
            return throwError(() => err);
        }),
    );
};
