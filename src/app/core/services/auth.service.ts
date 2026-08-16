import { HttpClient, HttpBackend } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap, throwError } from 'rxjs';

import { AuthResponse, AuthSession, CredentialsRequest } from '../models/api.models';
import { AuthApiService } from './auth-api.service';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'dfs-ui.auth.session';
  private readonly authApi = inject(AuthApiService);
  private readonly api = inject(ApiService);
  private readonly http = new HttpClient(inject(HttpBackend));

  private readonly sessionState = signal<AuthSession | null>(null);
  private readonly readyState = signal(false);
  private refreshRequest$: Observable<AuthResponse> | null = null;

  readonly session = computed(() => this.sessionState());
  readonly token = computed(() => this.sessionState()?.token ?? null);
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => this.sessionState() !== null);
  readonly isAdmin = computed(() => this.sessionState()?.user.isAdmin ?? false);
  readonly isReady = computed(() => this.readyState());

  async initialize(): Promise<void> {
    const storedSession = this.readStoredSession();

    if (storedSession) {
      this.sessionState.set(storedSession);
    }

    if (storedSession && !this.isExpired(storedSession.expiresAt)) {
      this.readyState.set(true);
      return;
    }

    await firstValueFrom(
      this.refreshSession().pipe(
        map(() => void 0),
        catchError(() => of(void 0)),
        finalize(() => this.readyState.set(true))
      )
    );
  }

  login(payload: CredentialsRequest): Observable<AuthResponse> {
    return this.authApi.login(payload).pipe(tap((response) => this.persistSession(response)));
  }

  register(payload: CredentialsRequest): Observable<AuthResponse> {
    return this.authApi.register(payload).pipe(tap((response) => this.persistSession(response)));
  }

  refreshSession(): Observable<AuthResponse> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    this.refreshRequest$ = this.http
      .post<AuthResponse>(this.api.endpoint('/auth/refresh'), {}, { withCredentials: true })
      .pipe(
        tap((response) => this.persistSession(response)),
        catchError((error: unknown) => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshRequest$ = null;
        }),
        shareReplay(1)
      );

    return this.refreshRequest$;
  }

  logout(): void {
    this.clearSession();
  }

  clearSession(): void {
    this.sessionState.set(null);
    localStorage.removeItem(this.storageKey);
  }

  private persistSession(response: AuthResponse): void {
    const session: AuthSession = {
      token: response.token,
      expiresAt: response.expiresAt,
      user: response.user
    };

    this.sessionState.set(session);
    localStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  private readStoredSession(): AuthSession | null {
    const raw = localStorage.getItem(this.storageKey);

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as AuthSession;

      if (!parsed.token || !parsed.expiresAt || !parsed.user) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private isExpired(expiresAt: string, skewMs = 30000): boolean {
    const expiry = new Date(expiresAt).getTime();

    return Number.isNaN(expiry) || expiry - skewMs <= Date.now();
  }
}
