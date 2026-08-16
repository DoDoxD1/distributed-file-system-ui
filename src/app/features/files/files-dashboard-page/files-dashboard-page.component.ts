import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { FileListingResponse, FileManifestResponse } from '../../../core/models/api.models';
import { FilesService } from '../../../core/services/files.service';
import { ToastService } from '../../../core/services/toast.service';
import { encodePathToBase64Url } from '../../../core/utils/encoding.util';
import {
  type FolderNode as FolderNodeType,
  base64ToBlob,
  buildFolderTree,
  extractFileName,
  extractParentFolder,
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

type TreeEntry =
  | { kind: 'folder'; node: FolderNodeType; depth: number }
  | { kind: 'file'; file: FileListingResponse; depth: number };

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
  templateUrl: './files-dashboard-page.component.html'
})
export class FilesDashboardPageComponent {
  private readonly filesService = inject(FilesService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly searchForm = new FormGroup({
    prefix: new FormControl('', { nonNullable: true })
  });
  protected readonly uploadForm = new FormGroup({
    logicalPath: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\/.*$/)]
    })
  });

  protected readonly files = signal<FileListingResponse[]>([]);
  protected readonly expandedFolders = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly treeEntries = computed(() => {
    const expanded = this.expandedFolders();
    const root = buildFolderTree(this.files());
    const entries: TreeEntry[] = [];

    const walk = (node: FolderNodeType, depth: number): void => {
      for (const child of node.children) {
        entries.push({ kind: 'folder', node: child, depth });
        if (expanded.has(child.path)) {
          walk(child, depth + 1);
          for (const file of child.files) {
            entries.push({ kind: 'file', file, depth: depth + 1 });
          }
        }
      }
      if (node === root) {
        for (const file of node.files) {
          entries.push({ kind: 'file', file, depth });
        }
      }
    };

    walk(root, 0);
    return entries;
  });
  protected readonly selectedFile = signal<FileListingResponse | null>(null);
  protected readonly selectedManifest = signal<FileManifestResponse | null>(null);
  protected readonly selectedUploadFile = signal<File | null>(null);
  protected readonly uploadResult = signal<FileManifestResponse | null>(null);
  protected readonly uploadRequestKey = signal(createIdempotencyKey());
  protected readonly isLoadingFiles = signal(true);
  protected readonly isLoadingManifest = signal(false);
  protected readonly isUploading = signal(false);
  protected readonly listError = signal('');
  protected readonly uploadError = signal('');
  protected readonly formatBytes = formatBytes;
  protected readonly formatDateTime = formatDateTime;
  protected readonly getFileName = extractFileName;
  protected readonly getFolderPath = extractParentFolder;

  constructor() {
    void this.refreshFiles();
  }

  protected async refreshFiles(): Promise<void> {
    this.isLoadingFiles.set(true);
    this.listError.set('');

    try {
      const prefix = this.searchForm.controls.prefix.getRawValue().trim();
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
      const message = getErrorMessage(error, 'The file list could not be loaded.');
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
      const message = getErrorMessage(error, 'The file details could not be loaded.');
      this.selectedManifest.set(null);
      this.toast.error('Unable to load file details', message);
    } finally {
      this.isLoadingManifest.set(false);
    }
  }

  protected handleUploadFileSelected(file: File): void {
    this.selectedUploadFile.set(file);

    if (!this.uploadForm.controls.logicalPath.getRawValue().trim()) {
      this.uploadForm.controls.logicalPath.setValue(`/${file.name}`);
    }
  }

  protected async submitUpload(): Promise<void> {
    this.uploadForm.markAllAsTouched();
    this.uploadError.set('');

    if (this.uploadForm.invalid || !this.selectedUploadFile()) {
      if (!this.selectedUploadFile()) {
        this.uploadError.set('Choose a file before uploading.');
      }
      return;
    }

    this.isUploading.set(true);

    try {
      const file = this.selectedUploadFile()!;
      const manifest = (
        await firstValueFrom(
          this.filesService.uploadFile({
            logicalPath: this.uploadForm.controls.logicalPath.getRawValue().trim(),
            payloadBase64: await fileToBase64(file),
            idempotencyKey: this.uploadRequestKey()
          })
        )
      ).manifest;

      this.uploadResult.set(manifest);
      this.selectedUploadFile.set(null);
      this.uploadRequestKey.set(createIdempotencyKey());
      this.toast.success('Upload complete', `${extractFileName(manifest.logicalPath)} has been saved.`);
      await this.refreshFiles();
    } catch (error) {
      const message = getErrorMessage(error, 'The file could not be uploaded.');
      this.uploadError.set(message);
      this.toast.error('Upload failed', message);
    } finally {
      this.isUploading.set(false);
    }
  }

  protected async downloadFile(file: FileListingResponse): Promise<void> {
    try {
      const response = await firstValueFrom(this.filesService.downloadFile(file.logicalPath));
      const blob = base64ToBlob(response.payloadBase64);
      triggerBrowserDownload(extractFileName(file.logicalPath), blob);
      this.toast.success('Download ready', `${extractFileName(file.logicalPath)} is ready.`);
    } catch (error) {
      const message = getErrorMessage(error, 'The file could not be downloaded.');
      this.toast.error('Download failed', message);
    }
  }

  protected async downloadManifest(manifest: FileManifestResponse): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.filesService.downloadFile(manifest.logicalPath, manifest.versionId)
      );
      const blob = base64ToBlob(response.payloadBase64);
      triggerBrowserDownload(extractFileName(manifest.logicalPath), blob);
      this.toast.success('Download ready', `${extractFileName(manifest.logicalPath)} is ready.`);
    } catch (error) {
      const message = getErrorMessage(error, 'The file could not be downloaded.');
      this.toast.error('Download failed', message);
    }
  }

  protected toggleFolder(path: string): void {
    this.expandedFolders.update((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  protected isFolderExpanded(path: string): boolean {
    return this.expandedFolders().has(path);
  }

  protected openDetails(logicalPath: string): void {
    void this.router.navigate(['/files', encodePathToBase64Url(logicalPath)]);
  }
}
