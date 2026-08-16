import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, InlineAlertComponent],
  templateUrl: './login-page.component.html'
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)]
    })
  });
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal('');

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');

    try {
      const { email, password } = this.form.getRawValue();
      await firstValueFrom(
        this.auth.login({ email: email.trim(), password })
      );

      this.toast.success('Signed in', 'Your authenticated session is ready.');
      void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirectTo') || '/files');
    } catch (error) {
      const message = getErrorMessage(error, 'The login request failed.');
      this.submitError.set(message);
      this.toast.error('Sign in failed', message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
