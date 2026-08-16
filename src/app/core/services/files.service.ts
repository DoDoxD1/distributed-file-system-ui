import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateDirectUploadSessionRequest,
  DeleteFileResponse,
  DirectUploadSessionResponse,
  DownloadFileResponse,
  FileListingResponse,
  FileManifestResponse,
  UploadFileRequest,
  UploadFileResponse
} from '../models/api.models';
import { encodePathToBase64Url } from '../utils/encoding.util';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  listFiles(prefix?: string): Observable<FileListingResponse[]> {
    let params = new HttpParams();

    if (prefix) {
      params = params.set('prefix', prefix);
    }

    return this.http.get<FileListingResponse[]>(this.api.endpoint('/files'), { params });
  }

  uploadFile(payload: UploadFileRequest): Observable<UploadFileResponse> {
    return this.http.post<UploadFileResponse>(this.api.endpoint('/files'), payload);
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
      {}
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

        observer.error(
          new Error(`Object storage upload failed with status ${xhr.status || 'unknown'}.`)
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
}
