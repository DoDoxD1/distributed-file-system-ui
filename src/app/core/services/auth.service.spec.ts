import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { authRefreshInterceptor } from '../interceptors/auth-refresh.interceptor';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const storageKey = 'dfs-ui.auth.session';
  const storedSession = {
    token: 'token-123',
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: {
      userId: 'user-1',
      email: 'user@example.com',
      isAdmin: false,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  };

  let service: AuthService;
  let httpController: HttpTestingController;
  let api: ApiService;
  let router: Router;
  let navigateByUrlSpy: jasmine.Spy;

  beforeEach(() => {
    localStorage.removeItem(storageKey);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, authRefreshInterceptor])),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(AuthService);
    httpController = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiService);
    router = TestBed.inject(Router);
    navigateByUrlSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });

  afterEach(() => {
    httpController.verify();
    localStorage.removeItem(storageKey);
  });

  async function initializeAuthenticatedSession(): Promise<void> {
    localStorage.setItem(storageKey, JSON.stringify(storedSession));
    await service.initialize();
  }

  it('logs out successfully by calling the backend, clearing auth state, and redirecting', async () => {
    await initializeAuthenticatedSession();

    const logoutPromise = service.logout();
    const request = httpController.expectOne(api.endpoint('/auth/logout'));

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.withCredentials).toBeTrue();
    expect(request.request.credentials).toBe('include');
    expect(request.request.headers.has('Authorization')).toBeFalse();

    request.flush(null);
    await logoutPromise;

    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/login');
  });

  it('still clears auth state and redirects when the backend session is already invalid', async () => {
    await initializeAuthenticatedSession();

    const logoutPromise = service.logout();
    const request = httpController.expectOne(api.endpoint('/auth/logout'));

    request.flush(
      {
        error: 'authentication_error',
        message: 'Session is invalid.',
        path: '/api/v1/auth/logout',
        timestamp: '2026-01-01T00:00:00.000Z'
      },
      {
        status: 401,
        statusText: 'Unauthorized'
      }
    );

    await logoutPromise;

    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/login');
  });

  it('still clears auth state and redirects when the logout request fails due to a network error', async () => {
    await initializeAuthenticatedSession();

    const logoutPromise = service.logout();
    const request = httpController.expectOne(api.endpoint('/auth/logout'));

    request.error(new ProgressEvent('error'));
    await logoutPromise;

    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/login');
  });
});
