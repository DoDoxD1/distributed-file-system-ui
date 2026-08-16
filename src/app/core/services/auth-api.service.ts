import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthResponse, CredentialsRequest } from '../models/api.models';
import { createPublicAuthContext } from '../utils/http-context.util';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  register(payload: CredentialsRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.api.endpoint('/auth/register'), payload, {
      withCredentials: true,
      context: createPublicAuthContext()
    });
  }

  login(payload: CredentialsRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.api.endpoint('/auth/login'), payload, {
      withCredentials: true,
      context: createPublicAuthContext()
    });
  }
}
