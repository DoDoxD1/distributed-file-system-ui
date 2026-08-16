import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { FileCacheService } from '../../../core/services/file-cache.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ToastService } from '../../../core/services/toast.service';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InlineAlertComponent],
  templateUrl: './settings-page.component.html'
})
export class SettingsPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly fileCache = inject(FileCacheService);
  private readonly router = inject(Router);

  protected readonly displayNameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(1)]
  });

  protected readonly isSaving = signal(false);
  protected readonly saveError = signal('');
  protected readonly saveSuccess = signal(false);

  constructor() {
    const current = this.auth.user()?.displayName;
    if (current) {
      this.displayNameControl.setValue(current);
    }
  }

  protected async saveDisplayName(): Promise<void> {
    this.displayNameControl.markAsTouched();

    if (this.displayNameControl.invalid) {
      return;
    }

    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSuccess.set(false);

    try {
      await firstValueFrom(
        this.auth.updateDisplayName({ displayName: this.displayNameControl.value.trim() })
      );
      this.saveSuccess.set(true);
      this.toast.success('Display name updated', 'Your name has been saved.');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.auth.clearSession();
        void this.router.navigateByUrl('/login');
        return;
      }
      const message = getErrorMessage(error, 'Failed to update display name.');
      this.saveError.set(message);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.fileCache.clearAll();
    await this.auth.logout();
    this.toast.info('Signed out', 'Your session was cleared.');
  }
}
