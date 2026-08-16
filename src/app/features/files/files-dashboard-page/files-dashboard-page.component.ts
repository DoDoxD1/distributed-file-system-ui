import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { FileListingResponse, FileManifestResponse } from '../../../core/models/api.models';
import { FileCacheService } from '../../../core/services/file-cache.service';
import { FilesService } from '../../../core/services/files.service';
import { ToastService } from '../../../core/services/toast.service';
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

type PreviewType = 'image' | 'text' | 'pdf' | 'none';

const getPreviewType = (filename: string): PreviewType => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'log', 'ts', 'js', 'html', 'css', 'sh', 'env'].includes(ext)) return 'text';
  return 'none';
};

const PREVIEW_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  pdf: 'application/pdf'
};

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
  private readonly fileCache = inject(FileCacheService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);

  private static readonly LISTING_CACHE_KEY = 'all';

  protected readonly searchQuery = signal('');
  protected readonly uploadForm = new FormGroup({
    logicalPath: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\/.*$/)]
    })
  });

  protected readonly files = signal<FileListingResponse[]>([]);
  protected readonly filteredFiles = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.files();
    return this.files().filter((f) => f.logicalPath.toLowerCase().includes(q));
  });
  protected readonly expandedFolders = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly treeEntries = computed(() => {
    const expanded = this.expandedFolders();
    const root = buildFolderTree(this.filteredFiles());
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
  protected readonly selectedUploadFile = signal<File | null>(null);
  protected readonly pendingDeleteFile = signal<FileListingResponse | null>(null);
  protected readonly isDeleting = signal(false);
  protected readonly previewFile = signal<FileListingResponse | null>(null);
  protected readonly previewObjectUrl = signal<string | null>(null);
  protected readonly safePdfUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewObjectUrl();
    return url && this.previewType() === 'pdf' ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });
  protected readonly safeImageUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewObjectUrl();
    return url && this.previewType() === 'image' ? this.sanitizer.bypassSecurityTrustUrl(url) : null;
  });
  protected readonly previewText = signal<string | null>(null);
  protected readonly previewType = signal<PreviewType>('none');
  protected readonly previewModalOpen = signal(false);
  protected readonly isLoadingPreview = signal(false);
  protected readonly uploadResult = signal<FileManifestResponse | null>(null);
  protected readonly uploadRequestKey = signal(createIdempotencyKey());
  protected readonly isLoadingFiles = signal(true);
  protected readonly isUploading = signal(false);
  protected readonly uploadModalOpen = signal(false);
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
    this.listError.set('');

    const cached = await this.fileCache.getListing(FilesDashboardPageComponent.LISTING_CACHE_KEY);
    if (cached) {
      this.applyFileList(cached);
    } else {
      this.isLoadingFiles.set(true);
    }

    try {
      const files = await firstValueFrom(this.filesService.listFiles());
      void this.fileCache.putListing(FilesDashboardPageComponent.LISTING_CACHE_KEY, files);
      this.applyFileList(files);
    } catch (error) {
      if (!cached) {
        const message = getErrorMessage(error, 'The file list could not be loaded.');
        this.listError.set(message);
        this.toast.error('Unable to load files', message);
      }
    } finally {
      this.isLoadingFiles.set(false);
    }
  }

  private applyFileList(files: FileListingResponse[]): void {
    this.files.set(files);

    if (!files.length) {
      this.selectedFile.set(null);
      return;
    }

    const currentSelection = this.selectedFile()?.logicalPath;
    const matchedFile = files.find((f) => f.logicalPath === currentSelection) ?? files[0];
    this.selectFile(matchedFile);
  }

  protected selectFile(file: FileListingResponse): void {
    this.selectedFile.set(file);
  }

  protected async openPreview(file: FileListingResponse): Promise<void> {
    const prevUrl = this.previewObjectUrl();
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
      this.previewObjectUrl.set(null);
    }
    this.previewText.set(null);
    this.previewFile.set(file);
    this.previewModalOpen.set(true);
    this.isLoadingPreview.set(true);

    const filename = extractFileName(file.logicalPath);
    const type = getPreviewType(filename);
    this.previewType.set(type);

    try {
      let response = await this.fileCache.getContent(file.logicalPath, file.latestVersionId);
      if (!response) {
        response = await firstValueFrom(this.filesService.downloadFile(file.logicalPath));
        void this.fileCache.putContent(file.logicalPath, file.latestVersionId, response);
      }

      const ext = filename.split('.').pop()?.toLowerCase() ?? '';
      const mime = PREVIEW_MIME[ext] ?? 'application/octet-stream';
      const blob = base64ToBlob(response.payloadBase64, mime);

      if (type === 'text') {
        this.previewText.set(await blob.text());
      } else if (type === 'image' || type === 'pdf') {
        this.previewObjectUrl.set(URL.createObjectURL(blob));
      }
    } catch (error) {
      const message = getErrorMessage(error, 'The file preview could not be loaded.');
      this.toast.error('Preview failed', message);
      this.previewModalOpen.set(false);
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  protected closePreview(): void {
    const url = this.previewObjectUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewObjectUrl.set(null);
    }
    this.previewText.set(null);
    this.previewModalOpen.set(false);
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
      this.uploadModalOpen.set(false);
      this.toast.success('Upload complete', `${extractFileName(manifest.logicalPath)} has been saved.`);
      await Promise.all([
        this.fileCache.invalidateListing(FilesDashboardPageComponent.LISTING_CACHE_KEY),
        this.fileCache.evictContent(manifest.logicalPath)
      ]);
      await this.refreshFiles();
    } catch (error) {
      const message = getErrorMessage(error, 'The file could not be uploaded.');
      this.uploadError.set(message);
      this.toast.error('Upload failed', message);
    } finally {
      this.isUploading.set(false);
    }
  }

  protected requestDelete(file: FileListingResponse): void {
    this.pendingDeleteFile.set(file);
  }

  protected cancelDelete(): void {
    this.pendingDeleteFile.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const file = this.pendingDeleteFile();
    if (!file) return;

    this.isDeleting.set(true);

    try {
      await firstValueFrom(this.filesService.deleteFile(file.logicalPath));
      await Promise.all([
        this.fileCache.invalidateListing(FilesDashboardPageComponent.LISTING_CACHE_KEY),
        this.fileCache.evictContent(file.logicalPath)
      ]);
      this.files.update((current) => current.filter((f) => f.logicalPath !== file.logicalPath));
      this.pendingDeleteFile.set(null);
      this.toast.success('File deleted', `${extractFileName(file.logicalPath)} has been removed.`);
    } catch (error) {
      const message = getErrorMessage(error, 'The file could not be deleted.');
      this.toast.error('Delete failed', message);
    } finally {
      this.isDeleting.set(false);
    }
  }

  protected async downloadFile(file: FileListingResponse): Promise<void> {
    try {
      let response = await this.fileCache.getContent(file.logicalPath, file.latestVersionId);
      if (!response) {
        response = await firstValueFrom(this.filesService.downloadFile(file.logicalPath));
        void this.fileCache.putContent(file.logicalPath, file.latestVersionId, response);
      }
      const blob = base64ToBlob(response.payloadBase64);
      triggerBrowserDownload(extractFileName(file.logicalPath), blob);
      this.toast.success('Download ready', `${extractFileName(file.logicalPath)} is ready.`);
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

  protected openUploadModal(): void {
    this.uploadForm.reset();
    this.selectedUploadFile.set(null);
    this.uploadError.set('');
    this.uploadModalOpen.set(true);
  }

  protected closeUploadModal(): void {
    if (this.isUploading()) {
      return;
    }
    this.uploadModalOpen.set(false);
  }

}
