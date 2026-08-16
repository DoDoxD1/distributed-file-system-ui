import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthResponse, CredentialsRequest, RegistrationRequest, UpdateDisplayNameRequest, UserResponse } from '../models/api.models';
import { createPublicAuthContext } from '../utils/http-context.util';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  register(payload: RegistrationRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.api.endpoint('/auth/register'), payload, {
      withCredentials: true,
      context: createPublicAuthContext()
    });
  }

  updateDisplayName(payload: UpdateDisplayNameRequest): Observable<UserResponse> {
    return this.http.patch<UserResponse>(this.api.endpoint('/users/me'), payload, {
      withCredentials: true
    });
  }

  login(payload: CredentialsRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.api.endpoint('/auth/login'), payload, {
      withCredentials: true,
      context: createPublicAuthContext()
    });
  }

  logout(): Observable<void> {
    return this.http.post<void>(this.api.endpoint('/auth/logout'), null, {
      withCredentials: true,
      credentials: 'include',
      context: createPublicAuthContext()
    });
  }
}
