import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import {
  DirectUploadSessionResponse,
  FileManifestResponse
} from '../../../core/models/api.models';
import { FilesService } from '../../../core/services/files.service';
import { ToastService } from '../../../core/services/toast.service';
import { computeSha256Hex, extractFileName, extractParentFolder } from '../../../core/utils/file.util';
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
  templateUrl: './direct-upload-page.component.html'
})
export class DirectUploadPageComponent {
  private readonly filesService = inject(FilesService);
  private readonly toast = inject(ToastService);

  protected readonly sessionForm = new FormGroup({
    logicalPath: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\/.*$/)]
    })
  });

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly checksum = signal('');
  protected readonly currentSession = signal<DirectUploadSessionResponse | null>(null);
  protected readonly committedManifest = signal<FileManifestResponse | null>(null);
  protected readonly directUploadKey = signal(createIdempotencyKey());
  protected readonly formError = signal('');
  protected readonly isHashing = signal(false);
  protected readonly isWorking = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly formatBytes = formatBytes;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatRelativeTime = formatRelativeTime;
  protected readonly getFileName = extractFileName;
  protected readonly getFolderPath = extractParentFolder;

  protected async handleFileSelected(file: File): Promise<void> {
    this.selectedFile.set(file);
    this.formError.set('');
    this.committedManifest.set(null);
    this.uploadProgress.set(0);

    if (!this.sessionForm.controls.logicalPath.getRawValue().trim()) {
      this.sessionForm.controls.logicalPath.setValue(`/${file.name}`);
    }

    await this.computeChecksum(file);
  }

  protected async startSession(): Promise<void> {
    this.sessionForm.markAllAsTouched();
    this.formError.set('');

    if (this.sessionForm.invalid || !this.selectedFile()) {
      if (!this.selectedFile()) {
        this.formError.set('Choose a file before starting the upload.');
      }
      return;
    }

    this.isWorking.set(true);

    try {
      const file = this.selectedFile()!;
      const checksum = this.checksum() || (await this.computeChecksum(file));
      const session = await firstValueFrom(
        this.filesService.createDirectUploadSession({
          logicalPath: this.sessionForm.controls.logicalPath.getRawValue().trim(),
          checksumSha256: checksum,
          sizeBytes: file.size,
          contentType: file.type || 'application/octet-stream',
          idempotencyKey: this.directUploadKey()
        })
      );

      this.currentSession.set(session);
      this.toast.info('Upload started', `${extractFileName(session.logicalPath)} is ready to upload.`);
      await this.continueSession(session, file);
    } catch (error) {
      const message = getErrorMessage(error, 'We could not start the upload.');
      this.formError.set(message);
      this.toast.error('Upload failed', message);
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
        this.toast.info('Already finished', 'This upload has already been completed.');
        return;
      }

      if (session.uploadRequired && !this.selectedFile()) {
        throw new Error('Choose the original file again to continue this upload.');
      }

      await this.continueSession(session, this.selectedFile() ?? undefined);
    } catch (error) {
      const message = getErrorMessage(error, 'We could not continue the upload.');
      this.formError.set(message);
      this.toast.error('Continue failed', message);
    } finally {
      this.isWorking.set(false);
    }
  }

  protected getStatusLabel(session: DirectUploadSessionResponse): string {
    switch (session.status) {
      case 'AWAITING_UPLOAD':
        return 'Uploading';
      case 'READY_TO_COMMIT':
        return 'Finishing up';
      case 'COMPLETED':
        return 'Done';
    }
  }

  protected getNextStepLabel(session: DirectUploadSessionResponse): string {
    if (session.status === 'COMPLETED') {
      return 'Your file has already been saved.';
    }

    if (session.uploadRequired && session.status === 'AWAITING_UPLOAD') {
      return 'We still need to transfer the file.';
    }

    return 'The file is ready to be saved to your account.';
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
        throw new Error('The original file is required to continue this upload.');
      }

      this.uploadProgress.set(0);
      await firstValueFrom(this.filesService.uploadToObjectStorage(session, file));
      this.uploadProgress.set(100);
      this.toast.success('Upload finished', 'Your file transfer completed successfully.');
    }

    await this.finalizeSession(session.sessionId);
  }

  private async finalizeSession(sessionId: string): Promise<void> {
    const result = await firstValueFrom(this.filesService.finalizeDirectUploadSession(sessionId));
    const refreshedSession = await firstValueFrom(this.filesService.getDirectUploadSession(sessionId));

    this.currentSession.set(refreshedSession);
    this.committedManifest.set(result.manifest);
    this.directUploadKey.set(createIdempotencyKey());
    this.toast.success('File saved', `${extractFileName(result.manifest.logicalPath)} is now available.`);
  }

  private async computeChecksum(file: File): Promise<string> {
    this.isHashing.set(true);

    try {
      const checksum = await computeSha256Hex(file);
      this.checksum.set(checksum);
      return checksum;
    } catch (error) {
      const message = getErrorMessage(error, 'We could not prepare the file for upload.');
      this.formError.set(message);
      throw error;
    } finally {
      this.isHashing.set(false);
    }
  }
}
