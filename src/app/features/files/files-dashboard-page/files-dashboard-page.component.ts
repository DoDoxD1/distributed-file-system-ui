import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { FileListingResponse, FileManifestResponse } from '../../../core/models/api.models';
import { FilesService } from '../../../core/services/files.service';
import { ToastService } from '../../../core/services/toast.service';
import { encodePathToBase64Url } from '../../../core/utils/encoding.util';
import {
  base64ToBlob,
  extractFileName,
  fileToBase64,
  triggerBrowserDownload
} from '../../../core/utils/file.util';
import { formatBytes, formatDateTime } from '../../../core/utils/format.util';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { createIdempotencyKey } from '../../../core/utils/idempotency.util';
import { DropzoneComponent } from '../../../shared/components/dropzone/dropzone.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';

@Component({
  selector: 'app-files-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DropzoneComponent,
    EmptyStateComponent,
    InlineAlertComponent,
    LoadingStateComponent
  ],
  template: `
    <section class="space-y-6">
      <div class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/10 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
        <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">Files</p>
            <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">Browse manifests and upload new content</h2>
            <p class="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
              Search by logical path prefix, inspect the latest manifest for any file, and use the standard API upload when you need a direct JSON-based write.
            </p>
          </div>

          <form class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[28rem]" (ngSubmit)="refreshFiles()">
            <input
              type="text"
              [formControl]="prefixControl"
              class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
              placeholder="Search by prefix, e.g. /docs"
            >
            <button
              type="submit"
              class="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section class="space-y-4 rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-white">Indexed files</p>
              <p class="text-sm text-slate-400">{{ files().length }} file{{ files().length === 1 ? '' : 's' }} returned</p>
            </div>
            <button
              type="button"
              class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
              (click)="refreshFiles()"
            >
              Refresh
            </button>
          </div>

          @if (listError()) {
            <app-inline-alert title="Unable to load files" [message]="listError()" tone="error"></app-inline-alert>
          }

          @if (isLoadingFiles()) {
            <app-loading-state
              title="Loading files"
              description="Fetching the latest file listing from the API."
            ></app-loading-state>
          } @else if (!files().length) {
            <app-empty-state
              icon="/"
              title="No files matched your search"
              description="Try a broader prefix or upload a file using the standard flow on the right."
            ></app-empty-state>
          } @else {
            <div class="max-h-[38rem] space-y-3 overflow-y-auto pr-1">
              @for (file of files(); track file.logicalPath) {
                <button
                  type="button"
                  class="block w-full rounded-3xl border px-5 py-4 text-left transition"
                  [class.border-cyan-400/40]="selectedFile()?.logicalPath === file.logicalPath"
                  [class.bg-cyan-400/10]="selectedFile()?.logicalPath === file.logicalPath"
                  [class.border-white/10]="selectedFile()?.logicalPath !== file.logicalPath"
                  [class.bg-white/5]="selectedFile()?.logicalPath !== file.logicalPath"
                  (click)="selectFile(file)"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-white">{{ file.logicalPath }}</p>
                      <p class="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">Latest version {{ file.latestVersionId }}</p>
                    </div>
                    <div class="text-right">
                      <p class="text-sm font-medium text-slate-200">{{ formatBytes(file.sizeBytes) }}</p>
                      <p class="mt-1 text-xs text-slate-400">{{ formatDateTime(file.createdAt) }}</p>
                    </div>
                  </div>
                </button>
              }
            </div>
          }
        </section>

        <div class="space-y-6">
          <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-6">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-white">Standard upload</p>
                <p class="mt-1 text-sm text-slate-400">Convert the file to base64 and send it through <code class="rounded bg-white/5 px-1.5 py-0.5 text-xs text-cyan-200">POST /api/v1/files</code>.</p>
              </div>
              <button
                type="button"
                class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
                (click)="regenerateIdempotencyKey()"
              >
                New key
              </button>
            </div>

            <form class="mt-6 space-y-5" (ngSubmit)="submitUpload()">
              @if (uploadError()) {
                <app-inline-alert title="Upload failed" [message]="uploadError()" tone="error"></app-inline-alert>
              }

              <app-dropzone
                label="Drop a file for standard upload"
                hint="The file will be converted to base64 before calling the API."
                [fileName]="selectedUploadFile()?.name || ''"
                [disabled]="isUploading()"
                (fileSelected)="handleUploadFileSelected($event)"
              ></app-dropzone>

              <div>
                <label class="mb-2 block text-sm font-medium text-slate-200" for="logical-path">Logical path</label>
                <input
                  id="logical-path"
                  type="text"
                  [formControl]="logicalPathControl"
                  class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                  placeholder="/docs/report.pdf"
                >
                @if (logicalPathControl.invalid && logicalPathControl.touched) {
                  <p class="mt-2 text-sm text-rose-300">Logical paths must start with a forward slash.</p>
                }
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-slate-200" for="upload-idempotency-key">Idempotency key</label>
                <input
                  id="upload-idempotency-key"
                  type="text"
                  [formControl]="idempotencyKeyControl"
                  class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                  placeholder="Optional idempotency key"
                >
                <p class="mt-2 text-xs text-slate-500">Keep the same key for a safe retry if the request or connection fails before you get a response.</p>
              </div>

              <button
                type="submit"
                class="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                [disabled]="isUploading()"
              >
                {{ isUploading() ? 'Uploading…' : 'Upload file' }}
              </button>
            </form>
          </section>

          <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-6">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-white">Selected file metadata</p>
                <p class="mt-1 text-sm text-slate-400">Inspect the latest manifest, jump into version history, or download the current content.</p>
              </div>
              @if (selectedManifest()) {
                <button
                  type="button"
                  class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
                  (click)="openDetails(selectedManifest()!.logicalPath)"
                >
                  Open details
                </button>
              }
            </div>

            @if (isLoadingManifest()) {
              <div class="mt-6">
                <app-loading-state
                  title="Loading manifest"
                  description="Fetching manifest metadata for the selected file."
                ></app-loading-state>
              </div>
            } @else if (selectedManifest(); as manifest) {
              <div class="mt-6 space-y-4">
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Logical path</p>
                  <p class="mt-2 break-all text-lg font-semibold text-white">{{ manifest.logicalPath }}</p>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Latest version</p>
                    <p class="mt-2 text-sm font-medium text-slate-100">{{ manifest.versionId }}</p>
                  </div>
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Size</p>
                    <p class="mt-2 text-sm font-medium text-slate-100">{{ formatBytes(manifest.sizeBytes) }}</p>
                  </div>
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Checksum</p>
                    <p class="mt-2 break-all text-sm font-medium text-slate-100">{{ manifest.checksum }}</p>
                  </div>
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Created at</p>
                    <p class="mt-2 text-sm font-medium text-slate-100">{{ formatDateTime(manifest.createdAt) }}</p>
                  </div>
                </div>

                <div class="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    class="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
                    (click)="downloadManifest(manifest)"
                  >
                    Download latest content
                  </button>
                  <button
                    type="button"
                    class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-slate-100 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
                    (click)="openDetails(manifest.logicalPath)"
                  >
                    View version history
                  </button>
                </div>
              </div>
            } @else {
              <div class="mt-6">
                <app-empty-state
                  icon="i"
                  title="Select a file"
                  description="Choose a file from the listing to inspect its latest manifest and actions."
                ></app-empty-state>
              </div>
            }
          </section>

          @if (uploadResult(); as manifest) {
            <section class="rounded-[2rem] border border-emerald-400/25 bg-emerald-500/10 p-5 shadow-2xl shadow-emerald-950/20 sm:p-6">
              <p class="text-sm font-semibold text-emerald-100">Latest upload committed</p>
              <p class="mt-2 text-lg font-semibold text-white">{{ manifest.logicalPath }}</p>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <div class="rounded-2xl border border-emerald-300/20 bg-slate-950/40 p-4">
                  <p class="text-xs uppercase tracking-[0.24em] text-emerald-200/70">Version</p>
                  <p class="mt-2 text-sm font-medium text-white">{{ manifest.versionId }}</p>
                </div>
                <div class="rounded-2xl border border-emerald-300/20 bg-slate-950/40 p-4">
                  <p class="text-xs uppercase tracking-[0.24em] text-emerald-200/70">Checksum</p>
                  <p class="mt-2 break-all text-sm font-medium text-white">{{ manifest.checksum }}</p>
                </div>
              </div>
            </section>
          }
        </div>
      </div>
    </section>
  `
})
export class FilesDashboardPageComponent {
  private readonly filesService = inject(FilesService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly prefixControl = new FormControl('', { nonNullable: true });
  protected readonly logicalPathControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\/.*$/)]
  });
  protected readonly idempotencyKeyControl = new FormControl(createIdempotencyKey(), {
    nonNullable: true
  });

  protected readonly files = signal<FileListingResponse[]>([]);
  protected readonly selectedFile = signal<FileListingResponse | null>(null);
  protected readonly selectedManifest = signal<FileManifestResponse | null>(null);
  protected readonly selectedUploadFile = signal<File | null>(null);
  protected readonly uploadResult = signal<FileManifestResponse | null>(null);
  protected readonly isLoadingFiles = signal(true);
  protected readonly isLoadingManifest = signal(false);
  protected readonly isUploading = signal(false);
  protected readonly listError = signal('');
  protected readonly uploadError = signal('');
  protected readonly formatBytes = formatBytes;
  protected readonly formatDateTime = formatDateTime;

  constructor() {
    void this.refreshFiles();
  }

  protected async refreshFiles(): Promise<void> {
    this.isLoadingFiles.set(true);
    this.listError.set('');

    try {
      const prefix = this.prefixControl.getRawValue().trim();
      const files = await firstValueFrom(this.filesService.listFiles(prefix || undefined));
      this.files.set(files);

      if (!files.length) {
        this.selectedFile.set(null);
        this.selectedManifest.set(null);
        return;
      }

      const currentSelection = this.selectedFile()?.logicalPath;
      const matchedFile = files.find((file) => file.logicalPath === currentSelection) ?? files[0];
      await this.selectFile(matchedFile);
    } catch (error) {
      const message = getErrorMessage(error, 'The file listing request failed.');
      this.listError.set(message);
      this.toast.error('Unable to load files', message);
    } finally {
      this.isLoadingFiles.set(false);
    }
  }

  protected async selectFile(file: FileListingResponse): Promise<void> {
    this.selectedFile.set(file);
    this.isLoadingManifest.set(true);

    try {
      const manifest = await firstValueFrom(this.filesService.getManifest(file.logicalPath));
      this.selectedManifest.set(manifest);
    } catch (error) {
      const message = getErrorMessage(error, 'The manifest request failed.');
      this.selectedManifest.set(null);
      this.toast.error('Unable to load manifest', message);
    } finally {
      this.isLoadingManifest.set(false);
    }
  }

  protected handleUploadFileSelected(file: File): void {
    this.selectedUploadFile.set(file);

    if (!this.logicalPathControl.getRawValue().trim()) {
      this.logicalPathControl.setValue(`/${file.name}`);
    }
  }

  protected regenerateIdempotencyKey(): void {
    this.idempotencyKeyControl.setValue(createIdempotencyKey());
  }

  protected async submitUpload(): Promise<void> {
    this.logicalPathControl.markAsTouched();
    this.uploadError.set('');

    if (this.logicalPathControl.invalid || !this.selectedUploadFile()) {
      if (!this.selectedUploadFile()) {
        this.uploadError.set('Choose a file to upload first.');
      }
      return;
    }

    this.isUploading.set(true);

    try {
      const file = this.selectedUploadFile()!;
      const manifest = (
        await firstValueFrom(
          this.filesService.uploadFile({
            logicalPath: this.logicalPathControl.getRawValue().trim(),
            payloadBase64: await fileToBase64(file),
            idempotencyKey: this.idempotencyKeyControl.getRawValue().trim() || undefined
          })
        )
      ).manifest;

      this.uploadResult.set(manifest);
      this.selectedUploadFile.set(null);
      this.regenerateIdempotencyKey();
      this.toast.success('Upload complete', `${manifest.logicalPath} committed as version ${manifest.versionId}.`);
      await this.refreshFiles();
    } catch (error) {
      const message = getErrorMessage(error, 'The file upload request failed.');
      this.uploadError.set(message);
      this.toast.error('Upload failed', message);
    } finally {
      this.isUploading.set(false);
    }
  }

  protected async downloadManifest(manifest: FileManifestResponse): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.filesService.downloadFile(manifest.logicalPath, manifest.versionId)
      );
      const blob = base64ToBlob(response.payloadBase64);
      triggerBrowserDownload(extractFileName(manifest.logicalPath), blob);
      this.toast.success('Download ready', `Fetched ${manifest.logicalPath}.`);
    } catch (error) {
      const message = getErrorMessage(error, 'The download request failed.');
      this.toast.error('Download failed', message);
    }
  }

  protected openDetails(logicalPath: string): void {
    void this.router.navigate(['/files', encodePathToBase64Url(logicalPath)]);
  }
}
