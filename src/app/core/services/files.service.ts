import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subscription, firstValueFrom } from 'rxjs';

import {
  CreateDirectUploadSessionRequest,
  DeleteFileResponse,
  DirectFileUploadState,
  DirectUploadSessionResponse,
  DownloadFileResponse,
  FileListingResponse,
  FileManifestResponse,
  UploadFileResponse
} from '../models/api.models';
import { encodePathToBase64Url } from '../utils/encoding.util';
import { computeSha256Hex } from '../utils/file.util';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);
  private static readonly SESSION_RECREATE_LIMIT = 1;

  listFiles(prefix?: string): Observable<FileListingResponse[]> {
    let params = new HttpParams();

    if (prefix) {
      params = params.set('prefix', prefix);
    }

    return this.http.get<FileListingResponse[]>(this.api.endpoint('/files'), { params });
  }

  uploadFileDirect(
    file: File,
    logicalPath: string,
    idempotencyKey?: string | null
  ): Observable<DirectFileUploadState> {
    return new Observable<DirectFileUploadState>((observer) => {
      let cancelled = false;
      let uploadSubscription: Subscription | null = null;

      const emitState = (state: DirectFileUploadState): void => {
        if (!cancelled) {
          observer.next(state);
        }
      };

      const run = async (): Promise<void> => {
        emitState({
          status: 'creating session',
          requestedLogicalPath: logicalPath,
          logicalPath,
          progress: 0,
          session: null,
          manifest: null
        });

        try {
          const checksumSha256 = await computeSha256Hex(file);
          let recreateCount = 0;
          let currentIdempotencyKey = idempotencyKey ?? crypto.randomUUID();

          while (!cancelled) {
            let session: DirectUploadSessionResponse | null = null;

            try {
              emitState({
                status: 'creating session',
                requestedLogicalPath: logicalPath,
                logicalPath,
                progress: 0,
                session: null,
                manifest: null
              });

              session = await firstValueFrom(
                this.createDirectUploadSession({
                  logicalPath,
                  checksumSha256,
                  sizeBytes: file.size,
                  contentType: file.type || null,
                  idempotencyKey: currentIdempotencyKey
                })
              );

              if (this.isSessionExpired(session)) {
                throw new Error('The upload session expired before the file transfer could start.');
              }

              if (session.uploadRequired) {
                const uploadSession = session;

                emitState({
                  status: 'uploading to storage',
                  requestedLogicalPath: logicalPath,
                  logicalPath: uploadSession.logicalPath,
                  progress: 0,
                  session: uploadSession,
                  manifest: null
                });

                await new Promise<void>((resolve, reject) => {
                  uploadSubscription = this.uploadToObjectStorage(uploadSession, file).subscribe({
                    next: (progress) => {
                      emitState({
                        status: 'uploading to storage',
                        requestedLogicalPath: logicalPath,
                        logicalPath: uploadSession.logicalPath,
                        progress,
                        session: uploadSession,
                        manifest: null
                      });
                    },
                    error: (error: unknown) => reject(error),
                    complete: () => resolve()
                  });
                });
              }

              emitState({
                status: 'finalizing',
                requestedLogicalPath: logicalPath,
                logicalPath: session.logicalPath,
                progress: 100,
                session,
                manifest: null
              });

              const result = await firstValueFrom(this.finalizeDirectUploadSession(session.sessionId));
              const completedSession: DirectUploadSessionResponse = {
                ...session,
                status: 'COMPLETED',
                committedVersionId: result.manifest.versionId
              };

              emitState({
                status: 'complete',
                requestedLogicalPath: logicalPath,
                logicalPath: result.manifest.logicalPath,
                progress: 100,
                session: completedSession,
                manifest: result.manifest
              });

              if (!cancelled) {
                observer.complete();
              }
              return;
            } catch (error) {
              if (
                this.shouldRecreateSession(error, session) &&
                recreateCount < FilesService.SESSION_RECREATE_LIMIT
              ) {
                recreateCount += 1;
                currentIdempotencyKey = crypto.randomUUID();
                continue;
              }

              throw error;
            } finally {
              uploadSubscription = null;
            }
          }
        } catch (error) {
          if (!cancelled) {
            observer.error(error);
          }
        }
      };

      void run();

      return () => {
        cancelled = true;
        uploadSubscription?.unsubscribe();
      };
    });
  }

  createDirectUploadSession(
    payload: CreateDirectUploadSessionRequest
  ): Observable<DirectUploadSessionResponse> {
    return this.http.post<DirectUploadSessionResponse>(
      this.api.endpoint('/files/direct/upload-sessions'),
      payload
    );
  }

  getDirectUploadSession(sessionId: string): Observable<DirectUploadSessionResponse> {
    return this.http.get<DirectUploadSessionResponse>(
      this.api.endpoint(`/files/direct/upload-sessions/${sessionId}`)
    );
  }

  finalizeDirectUploadSession(sessionId: string): Observable<UploadFileResponse> {
    return this.http.post<UploadFileResponse>(
      this.api.endpoint(`/files/direct/upload-sessions/${sessionId}/finalize`),
      null
    );
  }

  getManifest(
    logicalPath: string,
    versionId?: string,
    includeDeleted?: boolean
  ): Observable<FileManifestResponse> {
    let params = new HttpParams().set('path', logicalPath);

    if (versionId) {
      params = params.set('versionId', versionId);
    }

    if (includeDeleted !== undefined) {
      params = params.set('includeDeleted', `${includeDeleted}`);
    }

    return this.http.get<FileManifestResponse>(this.api.endpoint('/files/manifest'), { params });
  }

  downloadFile(logicalPath: string, versionId?: string): Observable<DownloadFileResponse> {
    let params = new HttpParams().set('path', logicalPath);

    if (versionId) {
      params = params.set('versionId', versionId);
    }

    return this.http.get<DownloadFileResponse>(this.api.endpoint('/files/content'), { params });
  }

  deleteFile(logicalPath: string, versionId?: string): Observable<DeleteFileResponse> {
    let params = new HttpParams().set('path', logicalPath);

    if (versionId) {
      params = params.set('versionId', versionId);
    }

    return this.http.delete<DeleteFileResponse>(this.api.endpoint('/files'), { params });
  }

  listVersions(logicalPath: string): Observable<FileManifestResponse[]> {
    return this.http.get<FileManifestResponse[]>(
      this.api.endpoint(`/files/versions/${encodePathToBase64Url(logicalPath)}`)
    );
  }

  uploadToObjectStorage(session: DirectUploadSessionResponse, file: File): Observable<number> {
    return new Observable<number>((observer) => {
      if (!session.uploadUrl) {
        observer.error(new Error('Upload URL is missing for this direct upload session.'));
        return undefined;
      }

      if (!session.uploadMethod) {
        observer.error(new Error('Upload method is missing for this direct upload session.'));
        return undefined;
      }

      const xhr = new XMLHttpRequest();

      xhr.open(session.uploadMethod, session.uploadUrl, true);
      Object.entries(session.uploadHeaders ?? {}).forEach(([header, value]) => {
        xhr.setRequestHeader(header, value);
      });

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && event.total > 0) {
          observer.next(Math.round((event.loaded / event.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          observer.next(100);
          observer.complete();
          return;
        }

        const maybeExpiredMessage = this.isStaleUploadTargetStatus(xhr.status)
          ? ' The upload target may no longer be valid.'
          : '';

        observer.error(
          new Error(
            `Object storage upload failed with status ${xhr.status || 'unknown'}.${maybeExpiredMessage}`
          )
        );
      });

      xhr.addEventListener('error', () => {
        observer.error(new Error('Object storage upload failed due to a network error.'));
      });

      xhr.addEventListener('abort', () => {
        observer.error(new Error('Object storage upload was cancelled.'));
      });

      xhr.send(file);

      return () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          xhr.abort();
        }
      };
    });
  }

  private isSessionExpired(session: DirectUploadSessionResponse): boolean {
    const expiresAt = new Date(session.expiresAt).getTime();

    return Number.isNaN(expiresAt) || expiresAt <= Date.now();
  }

  private shouldRecreateSession(
    error: unknown,
    session: DirectUploadSessionResponse | null
  ): boolean {
    if (session && this.isSessionExpired(session)) {
      return true;
    }

    if (error instanceof HttpErrorResponse) {
      return [404, 408, 409, 410].includes(error.status) || this.isSessionMessageRetryable(error.message);
    }

    if (error instanceof Error) {
      return this.isSessionMessageRetryable(error.message);
    }

    return false;
  }

  private isSessionMessageRetryable(message: string): boolean {
    return /expired|invalid|ready to commit|no longer be valid/i.test(message);
  }

  private isStaleUploadTargetStatus(status: number): boolean {
    return [403, 404, 409, 410].includes(status);
  }
}
