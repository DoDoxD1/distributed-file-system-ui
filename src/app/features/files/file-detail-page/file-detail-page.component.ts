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
  extractParentFolder,
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
  templateUrl: './file-detail-page.component.html'
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
        this.pageError.set('The file could not be found.');
        return;
      }

      const logicalPath = decodeBase64Url(encodedPath);
      this.logicalPath.set(logicalPath);
      void this.loadVersions();
    });
  }

  protected readonly fileName = () => extractFileName(this.logicalPath());
  protected readonly folderPath = () => extractParentFolder(this.logicalPath());

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
      const message = getErrorMessage(error, 'The selected version could not be loaded.');
      this.pageError.set(message);
      this.toast.error('Unable to load version', message);
    } finally {
      this.isLoadingManifest.set(false);
    }
  }

  protected async downloadSelected(): Promise<void> {
    const manifest = this.selectedManifest();

    if (!manifest || manifest.deleted) {
      return;
    }

    this.isDownloading.set(true);

    try {
      const response = await firstValueFrom(
        this.filesService.downloadFile(this.logicalPath(), manifest.versionId)
      );
      triggerBrowserDownload(extractFileName(this.logicalPath()), base64ToBlob(response.payloadBase64));
      this.toast.success('Download ready', `${this.fileName()} is ready.`);
    } catch (error) {
      const message = getErrorMessage(error, 'The selected version could not be downloaded.');
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

    const confirmed = window.confirm(`Remove this saved version of ${manifest.logicalPath}?`);

    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);

    try {
      await firstValueFrom(this.filesService.deleteFile(this.logicalPath(), manifest.versionId));
      this.toast.success('Version removed', 'The selected saved version was removed.');
      await this.loadVersions(manifest.versionId);
    } catch (error) {
      const message = getErrorMessage(error, 'The selected version could not be removed.');
      this.toast.error('Remove failed', message);
    } finally {
      this.isDeleting.set(false);
    }
  }

  protected isLatestVersion(manifest: FileManifestResponse): boolean {
    return this.versions()[0]?.versionId === manifest.versionId;
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
      const message = getErrorMessage(error, 'The saved versions for this file could not be loaded.');
      this.pageError.set(message);
      this.toast.error('Unable to load versions', message);
    } finally {
      this.isLoadingVersions.set(false);
    }
  }
}
