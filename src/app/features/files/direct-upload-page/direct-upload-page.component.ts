import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import {
  DirectUploadSessionResponse,
  DirectUploadSessionStatus,
  FileManifestResponse
} from '../../../core/models/api.models';
import { FilesService } from '../../../core/services/files.service';
import { ToastService } from '../../../core/services/toast.service';
import { computeSha256Hex } from '../../../core/utils/file.util';
import { formatBytes, formatDateTime, formatRelativeTime } from '../../../core/utils/format.util';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { createIdempotencyKey } from '../../../core/utils/idempotency.util';
import { DropzoneComponent } from '../../../shared/components/dropzone/dropzone.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';

@Component({
  selector: 'app-direct-upload-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DropzoneComponent, EmptyStateComponent, InlineAlertComponent],
  template: `
    <section class="space-y-6">
      <div class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-400/15 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-cyan-950/20 sm:p-8">
        <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">Direct Upload</p>
        <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">Two-phase object storage upload flow</h2>
        <p class="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
          Create a direct upload session, send raw bytes to the object storage URL exactly as the backend specifies, then finalize the committed version through the API.
        </p>
      </div>

      <div class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-white">Start a new session</p>
              <p class="text-sm text-slate-400">This flow computes SHA-256 in the browser before requesting the upload session.</p>
            </div>
            <button
              type="button"
              class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
              (click)="regenerateIdempotencyKey()"
            >
              New key
            </button>
          </div>

          <form class="mt-6 space-y-5" (ngSubmit)="startSession()">
            @if (formError()) {
              <app-inline-alert title="Direct upload blocked" [message]="formError()" tone="error"></app-inline-alert>
            }

            <app-dropzone
              label="Drop a file for direct upload"
              hint="Raw bytes will be uploaded to the storage URL returned by the API."
              [fileName]="selectedFile()?.name || ''"
              [disabled]="isWorking()"
              (fileSelected)="handleFileSelected($event)"
            ></app-dropzone>

            <div>
              <label class="mb-2 block text-sm font-medium text-slate-200" for="direct-logical-path">Logical path</label>
              <input
                id="direct-logical-path"
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
              <label class="mb-2 block text-sm font-medium text-slate-200" for="direct-idempotency-key">Idempotency key</label>
              <input
                id="direct-idempotency-key"
                type="text"
                [formControl]="idempotencyKeyControl"
                class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                placeholder="Optional idempotency key"
              >
              <p class="mt-2 text-xs text-slate-500">Keep this key stable if you need to create a safe duplicate request after an uncertain failure.</p>
            </div>

            <div class="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
              <div>
                <p class="text-xs uppercase tracking-[0.24em] text-slate-500">File size</p>
                <p class="mt-2 text-sm font-medium text-slate-100">{{ selectedFile() ? formatBytes(selectedFile()!.size) : '—' }}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-[0.24em] text-slate-500">SHA-256</p>
                @if (isHashing()) {
                  <p class="mt-2 text-sm font-medium text-cyan-200">Computing checksum…</p>
                } @else {
                  <p class="mt-2 break-all text-sm font-medium text-slate-100">{{ checksum() || 'Select a file to compute the checksum.' }}</p>
                }
              </div>
            </div>

            <button
              type="submit"
              class="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="isWorking() || isHashing()"
            >
              {{ isWorking() ? 'Processing…' : 'Create session and upload' }}
            </button>
          </form>
        </section>

        <div class="space-y-6">
          <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-6">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-white">Current session</p>
                <p class="text-sm text-slate-400">Resume or finalize the current session without creating a new one.</p>
              </div>
              @if (currentSession()) {
                <button
                  type="button"
                  class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
                  [disabled]="isWorking()"
                  (click)="resumeCurrentSession()"
                >
                  Resume current session
                </button>
              }
            </div>

            @if (currentSession(); as session) {
              <div class="mt-6 space-y-4">
                <div class="flex flex-wrap items-center gap-3">
                  <span class="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]"
                    [class.border-amber-400/30]="session.status === 'AWAITING_UPLOAD'"
                    [class.bg-amber-400/10]="session.status === 'AWAITING_UPLOAD'"
                    [class.text-amber-200]="session.status === 'AWAITING_UPLOAD'"
                    [class.border-cyan-400/30]="session.status === 'READY_TO_COMMIT'"
                    [class.bg-cyan-400/10]="session.status === 'READY_TO_COMMIT'"
                    [class.text-cyan-200]="session.status === 'READY_TO_COMMIT'"
                    [class.border-emerald-400/30]="session.status === 'COMPLETED'"
                    [class.bg-emerald-400/10]="session.status === 'COMPLETED'"
                    [class.text-emerald-200]="session.status === 'COMPLETED'"
                  >
                    {{ session.status }}
                  </span>
                  <span class="text-sm text-slate-400">Session {{ session.sessionId }}</span>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Logical path</p>
                    <p class="mt-2 break-all text-sm font-medium text-slate-100">{{ session.logicalPath }}</p>
                  </div>
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Binary upload required</p>
                    <p class="mt-2 text-sm font-medium text-slate-100">{{ session.uploadRequired ? 'Yes' : 'No, deduplicated object can be finalized now.' }}</p>
                  </div>
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Created</p>
                    <p class="mt-2 text-sm font-medium text-slate-100">{{ formatDateTime(session.createdAt) }}</p>
                  </div>
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Expires</p>
                    <p class="mt-2 text-sm font-medium text-slate-100">{{ formatDateTime(session.expiresAt) }} · {{ formatRelativeTime(session.expiresAt) }}</p>
                  </div>
                </div>

                @if (uploadProgress() > 0 && session.uploadRequired) {
                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm text-slate-300">
                      <span>Binary upload progress</span>
                      <span>{{ uploadProgress() }}%</span>
                    </div>
                    <div class="h-3 overflow-hidden rounded-full bg-slate-800">
                      <div class="h-full rounded-full bg-cyan-400 transition-all" [style.width.%]="uploadProgress()"></div>
                    </div>
                  </div>
                }

                @if (session.uploadRequired) {
                  <div class="rounded-3xl border border-dashed border-slate-700 bg-slate-950/40 p-5">
                    <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Upload target</p>
                    <p class="mt-2 break-all text-sm text-slate-300">{{ session.uploadUrl || 'Upload URL unavailable' }}</p>
                    <p class="mt-3 text-xs text-slate-500">Method: {{ session.uploadMethod }} · Headers are sent exactly as returned by the backend.</p>
                  </div>
                }
              </div>
            } @else {
              <div class="mt-6">
                <app-empty-state
                  icon="⇅"
                  title="No direct upload session yet"
                  description="Create a session to stage the binary upload and then finalize it into a committed file version."
                ></app-empty-state>
              </div>
            }
          </section>

          @if (committedManifest(); as manifest) {
            <section class="rounded-[2rem] border border-emerald-400/25 bg-emerald-500/10 p-5 shadow-2xl shadow-emerald-950/20 sm:p-6">
              <p class="text-sm font-semibold text-emerald-100">Direct upload finalized</p>
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
export class DirectUploadPageComponent {
  private readonly filesService = inject(FilesService);
  private readonly toast = inject(ToastService);

  protected readonly logicalPathControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\/.*$/)]
  });
  protected readonly idempotencyKeyControl = new FormControl(createIdempotencyKey(), {
    nonNullable: true
  });

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly checksum = signal('');
  protected readonly currentSession = signal<DirectUploadSessionResponse | null>(null);
  protected readonly committedManifest = signal<FileManifestResponse | null>(null);
  protected readonly formError = signal('');
  protected readonly isHashing = signal(false);
  protected readonly isWorking = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly formatBytes = formatBytes;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatRelativeTime = formatRelativeTime;

  protected regenerateIdempotencyKey(): void {
    this.idempotencyKeyControl.setValue(createIdempotencyKey());
  }

  protected async handleFileSelected(file: File): Promise<void> {
    this.selectedFile.set(file);
    this.formError.set('');
    this.committedManifest.set(null);
    this.uploadProgress.set(0);

    if (!this.logicalPathControl.getRawValue().trim()) {
      this.logicalPathControl.setValue(`/${file.name}`);
    }

    await this.computeChecksum(file);
  }

  protected async startSession(): Promise<void> {
    this.logicalPathControl.markAsTouched();
    this.formError.set('');

    if (this.logicalPathControl.invalid || !this.selectedFile()) {
      if (!this.selectedFile()) {
        this.formError.set('Choose a file before starting a direct upload session.');
      }
      return;
    }

    this.isWorking.set(true);

    try {
      const file = this.selectedFile()!;
      const checksum = this.checksum() || (await this.computeChecksum(file));
      const session = await firstValueFrom(
        this.filesService.createDirectUploadSession({
          logicalPath: this.logicalPathControl.getRawValue().trim(),
          checksumSha256: checksum,
          sizeBytes: file.size,
          contentType: file.type || 'application/octet-stream',
          idempotencyKey: this.idempotencyKeyControl.getRawValue().trim() || undefined
        })
      );

      this.currentSession.set(session);
      this.toast.info('Session created', `Upload session ${session.sessionId} is ready.`);
      await this.continueSession(session, file);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to create the direct upload session.');
      this.formError.set(message);
      this.toast.error('Direct upload failed', message);
    } finally {
      this.isWorking.set(false);
    }
  }

  protected async resumeCurrentSession(): Promise<void> {
    if (!this.currentSession()) {
      return;
    }

    this.isWorking.set(true);
    this.formError.set('');

    try {
      const session = await firstValueFrom(
        this.filesService.getDirectUploadSession(this.currentSession()!.sessionId)
      );
      this.currentSession.set(session);

      if (session.status === 'COMPLETED') {
        this.toast.info('Session already completed', 'This session has already been finalized.');
        return;
      }

      if (session.uploadRequired && !this.selectedFile()) {
        throw new Error('Select the original file to resume the staged binary upload.');
      }

      await this.continueSession(session, this.selectedFile() ?? undefined);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to resume the direct upload session.');
      this.formError.set(message);
      this.toast.error('Resume failed', message);
    } finally {
      this.isWorking.set(false);
    }
  }

  private async continueSession(
    session: DirectUploadSessionResponse,
    file?: File
  ): Promise<void> {
    if (session.status === 'COMPLETED') {
      return;
    }

    if (session.uploadRequired && session.status === 'AWAITING_UPLOAD') {
      if (!file) {
        throw new Error('The original file is required to finish the binary upload step.');
      }

      this.uploadProgress.set(0);
      await firstValueFrom(this.filesService.uploadToObjectStorage(session, file));
      this.uploadProgress.set(100);
      this.toast.success('Binary upload complete', 'Raw bytes were transferred to object storage.');
    }

    await this.finalizeSession(session.sessionId);
  }

  private async finalizeSession(sessionId: string): Promise<void> {
    const result = await firstValueFrom(this.filesService.finalizeDirectUploadSession(sessionId));
    const refreshedSession = await firstValueFrom(this.filesService.getDirectUploadSession(sessionId));

    this.currentSession.set(refreshedSession);
    this.committedManifest.set(result.manifest);
    this.regenerateIdempotencyKey();
    this.toast.success(
      'Session finalized',
      `${result.manifest.logicalPath} committed as version ${result.manifest.versionId}.`
    );
  }

  private async computeChecksum(file: File): Promise<string> {
    this.isHashing.set(true);

    try {
      const checksum = await computeSha256Hex(file);
      this.checksum.set(checksum);
      return checksum;
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to compute the SHA-256 checksum.');
      this.formError.set(message);
      throw error;
    } finally {
      this.isHashing.set(false);
    }
  }

  protected readonly statusValues: DirectUploadSessionStatus[] = [
    'AWAITING_UPLOAD',
    'READY_TO_COMMIT',
    'COMPLETED'
  ];
}
