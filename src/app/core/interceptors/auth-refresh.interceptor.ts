import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { HAS_RETRIED, SKIP_REFRESH } from '../utils/http-context.util';

export const authRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const api = inject(ApiService);
  const router = inject(Router);
  const isApiRequest = request.url.startsWith(api.apiRoot);
  const isAuthRequest = request.url.startsWith(api.endpoint('/auth/'));

  if (!isApiRequest || isAuthRequest || request.context.get(SKIP_REFRESH)) {
    return next(request);
  }

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        request.context.get(HAS_RETRIED)
      ) {
        return throwError(() => error);
      }

      return auth.refreshSession().pipe(
        switchMap(() => {
          const token = auth.token();

          if (!token) {
            return throwError(() => error);
          }

          return next(
            request.clone({
              context: request.context.set(HAS_RETRIED, true),
              setHeaders: {
                Authorization: `Bearer ${token}`
              }
            })
          );
        }),
        catchError(() => {
          auth.clearSession();
          void router.navigateByUrl('/login');
          return throwError(() => error);
        })
      );
    })
  );
};
