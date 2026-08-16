import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly normalizedBaseUrl = environment.apiBaseUrl.replace(/\/$/, '');
  private readonly normalizedApiPrefix = environment.apiPrefix.startsWith('/')
    ? environment.apiPrefix
    : `/${environment.apiPrefix}`;

  readonly apiRoot = `${this.normalizedBaseUrl}${this.normalizedApiPrefix}`;

  endpoint(path = ''): string {
    if (!path) {
      return this.apiRoot;
    }

    return `${this.apiRoot}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
