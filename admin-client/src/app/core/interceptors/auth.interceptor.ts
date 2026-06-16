import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

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
