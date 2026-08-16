import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { HealthResponse, VersionResponse } from '../models/api.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SystemService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(this.api.endpoint('/system/health'));
  }

  getVersion(): Observable<VersionResponse> {
    return this.http.get<VersionResponse>(this.api.endpoint('/system/version'));
  }
}
