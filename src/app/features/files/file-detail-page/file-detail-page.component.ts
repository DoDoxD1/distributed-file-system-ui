import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { FileManifestResponse } from '../../../core/models/api.models';
import { FilesService } from '../../../core/services/files.service';
import { ToastService } from '../../../core/services/toast.service';
import { decodeBase64Url } from '../../../core/utils/encoding.util';
import {
  base64ToBlob,
  extractFileName,
  triggerBrowserDownload
} from '../../../core/utils/file.util';
import { formatBytes, formatDateTime } from '../../../core/utils/format.util';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';

@Component({
  selector: 'app-file-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, EmptyStateComponent, InlineAlertComponent, LoadingStateComponent],
  template: `
    <section class="space-y-6">
      <div class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/10 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">File Details</p>
            <h2 class="mt-3 break-all text-3xl font-semibold tracking-tight text-white">{{ logicalPath() }}</h2>
            <p class="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
              Browse manifest history, download a specific version, or delete an existing version while keeping the audit trail visible.
            </p>
          </div>
          <a
            routerLink="/files"
            class="inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
          >
            Back to files
          </a>
        </div>
      </div>

      @if (pageError()) {
        <app-inline-alert title="Unable to load file details" [message]="pageError()" tone="error"></app-inline-alert>
      }

      <div class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-white">Version history</p>
              <p class="text-sm text-slate-400">{{ versions().length }} version{{ versions().length === 1 ? '' : 's' }}</p>
            </div>
            <button
              type="button"
              class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
              (click)="reload()"
            >
              Refresh
            </button>
          </div>

          @if (isLoadingVersions()) {
            <div class="mt-6">
              <app-loading-state
                title="Loading versions"
                description="Reading the available manifest history for this file."
              ></app-loading-state>
            </div>
          } @else if (!versions().length) {
            <div class="mt-6">
              <app-empty-state
                icon="#"
                title="No versions available"
                description="This file does not currently expose any manifest history."
              ></app-empty-state>
            </div>
          } @else {
            <div class="mt-6 max-h-[36rem] space-y-3 overflow-y-auto pr-1">
              @for (version of versions(); track version.versionId) {
                <button
                  type="button"
                  class="block w-full rounded-3xl border px-5 py-4 text-left transition"
                  [class.border-cyan-400/40]="selectedManifest()?.versionId === version.versionId"
                  [class.bg-cyan-400/10]="selectedManifest()?.versionId === version.versionId"
                  [class.border-white/10]="selectedManifest()?.versionId !== version.versionId"
                  [class.bg-white/5]="selectedManifest()?.versionId !== version.versionId"
                  (click)="selectVersion(version.versionId)"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-semibold text-white">{{ version.versionId }}</p>
                        @if (version.deleted) {
                          <span class="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-200">
                            Deleted
                          </span>
                        }
                      </div>
                      <p class="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">{{ formatDateTime(version.createdAt) }}</p>
                    </div>
                    <div class="text-right">
                      <p class="text-sm font-medium text-slate-200">{{ formatBytes(version.sizeBytes) }}</p>
                      <p class="mt-2 text-xs text-slate-400">{{ version.chunkIds.length }} chunk{{ version.chunkIds.length === 1 ? '' : 's' }}</p>
                    </div>
                  </div>
                </button>
              }
            </div>
          }
        </section>

        <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl sm:p-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-white">Manifest details</p>
              <p class="text-sm text-slate-400">Inspect the selected version or fetch its file payload for download.</p>
            </div>
            @if (selectedManifest(); as manifest) {
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                  [disabled]="isDownloading()"
                  (click)="downloadSelected()"
                >
                  {{ isDownloading() ? 'Downloading…' : 'Download version' }}
                </button>
                <button
                  type="button"
                  class="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  [disabled]="isDeleting() || manifest.deleted"
                  (click)="deleteSelected()"
                >
                  {{ manifest.deleted ? 'Already deleted' : isDeleting() ? 'Deleting…' : 'Delete version' }}
                </button>
              </div>
            }
          </div>

          @if (isLoadingManifest()) {
            <div class="mt-6">
              <app-loading-state
                title="Loading manifest"
                description="Fetching manifest details for the selected version."
              ></app-loading-state>
            </div>
          } @else if (selectedManifest(); as manifest) {
            <div class="mt-6 space-y-4">
              <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div class="flex flex-wrap items-center gap-3">
                  <p class="text-lg font-semibold text-white">{{ manifest.versionId }}</p>
                  @if (manifest.deleted) {
                    <span class="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">
                      Deleted {{ manifest.deletedAt ? '· ' + formatDateTime(manifest.deletedAt) : '' }}
                    </span>
                  }
                </div>
                <p class="mt-3 break-all text-sm text-slate-300">{{ manifest.logicalPath }}</p>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Checksum</p>
                  <p class="mt-2 break-all text-sm font-medium text-slate-100">{{ manifest.checksum }}</p>
                </div>
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Created</p>
                  <p class="mt-2 text-sm font-medium text-slate-100">{{ formatDateTime(manifest.createdAt) }}</p>
                </div>
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Size</p>
                  <p class="mt-2 text-sm font-medium text-slate-100">{{ formatBytes(manifest.sizeBytes) }}</p>
                </div>
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Chunk IDs</p>
                  <p class="mt-2 break-all text-sm font-medium text-slate-100">{{ manifest.chunkIds.length ? manifest.chunkIds.join(', ') : 'Direct upload or empty chunk list' }}</p>
                </div>
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Owner user</p>
                  <p class="mt-2 text-sm font-medium text-slate-100">{{ manifest.ownerUserId }}</p>
                </div>
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Idempotency key</p>
                  <p class="mt-2 break-all text-sm font-medium text-slate-100">{{ manifest.idempotencyKey || '—' }}</p>
                </div>
              </div>
            </div>
          } @else {
            <div class="mt-6">
              <app-empty-state
                icon="i"
                title="Select a version"
                description="Choose a version from the left to inspect its manifest and actions."
              ></app-empty-state>
            </div>
          }
        </section>
      </div>
    </section>
  `
})
export class FileDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly filesService = inject(FilesService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly logicalPath = signal('');
  protected readonly versions = signal<FileManifestResponse[]>([]);
  protected readonly selectedManifest = signal<FileManifestResponse | null>(null);
  protected readonly isLoadingVersions = signal(true);
  protected readonly isLoadingManifest = signal(false);
  protected readonly isDownloading = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly pageError = signal('');
  protected readonly formatBytes = formatBytes;
  protected readonly formatDateTime = formatDateTime;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const encodedPath = params.get('encodedPath');

      if (!encodedPath) {
        this.pageError.set('The file path is missing from the route.');
        return;
      }

      const logicalPath = decodeBase64Url(encodedPath);
      this.logicalPath.set(logicalPath);
      void this.loadVersions();
    });
  }

  protected async reload(): Promise<void> {
    await this.loadVersions();
  }

  protected async selectVersion(versionId: string): Promise<void> {
    this.isLoadingManifest.set(true);

    try {
      const manifest = await firstValueFrom(
        this.filesService.getManifest(this.logicalPath(), versionId, true)
      );
      this.selectedManifest.set(manifest);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load the selected manifest.');
      this.pageError.set(message);
      this.toast.error('Manifest load failed', message);
    } finally {
      this.isLoadingManifest.set(false);
    }
  }

  protected async downloadSelected(): Promise<void> {
    const manifest = this.selectedManifest();

    if (!manifest) {
      return;
    }

    this.isDownloading.set(true);

    try {
      const response = await firstValueFrom(
        this.filesService.downloadFile(this.logicalPath(), manifest.versionId)
      );
      triggerBrowserDownload(extractFileName(this.logicalPath()), base64ToBlob(response.payloadBase64));
      this.toast.success('Download ready', `Fetched version ${manifest.versionId}.`);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to download the selected version.');
      this.toast.error('Download failed', message);
    } finally {
      this.isDownloading.set(false);
    }
  }

  protected async deleteSelected(): Promise<void> {
    const manifest = this.selectedManifest();

    if (!manifest || manifest.deleted) {
      return;
    }

    const confirmed = window.confirm(
      `Delete version ${manifest.versionId} for ${manifest.logicalPath}?`
    );

    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);

    try {
      await firstValueFrom(this.filesService.deleteFile(this.logicalPath(), manifest.versionId));
      this.toast.success('Version deleted', `${manifest.versionId} was marked as deleted.`);
      await this.loadVersions(manifest.versionId);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to delete the selected version.');
      this.toast.error('Delete failed', message);
    } finally {
      this.isDeleting.set(false);
    }
  }

  private async loadVersions(preferredVersionId?: string): Promise<void> {
    this.isLoadingVersions.set(true);
    this.pageError.set('');

    try {
      const versions = await firstValueFrom(this.filesService.listVersions(this.logicalPath()));
      this.versions.set(versions);

      if (!versions.length) {
        this.selectedManifest.set(null);
        return;
      }

      const versionToSelect =
        preferredVersionId ??
        this.selectedManifest()?.versionId ??
        versions.find((version) => !version.deleted)?.versionId ??
        versions[0].versionId;

      await this.selectVersion(versionToSelect);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to list versions for this file.');
      this.pageError.set(message);
      this.toast.error('Unable to load versions', message);
    } finally {
      this.isLoadingVersions.set(false);
    }
  }
}
