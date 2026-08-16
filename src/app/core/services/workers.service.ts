import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { WorkerRunResponse } from '../models/api.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class WorkersService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  runScan(): Observable<WorkerRunResponse> {
    return this.http.post<WorkerRunResponse>(this.api.endpoint('/workers/scan'), {});
  }

  runRepair(): Observable<WorkerRunResponse> {
    return this.http.post<WorkerRunResponse>(this.api.endpoint('/workers/repair'), {});
  }

  runGarbageCollection(referenceTime?: string): Observable<WorkerRunResponse> {
    let params = new HttpParams();

    if (referenceTime) {
      params = params.set('referenceTime', referenceTime);
    }

    return this.http.post<WorkerRunResponse>(this.api.endpoint('/workers/gc'), {}, { params });
  }

  runMigration(): Observable<WorkerRunResponse> {
    return this.http.post<WorkerRunResponse>(this.api.endpoint('/workers/migrate-local-chunks'), {});
  }
}
