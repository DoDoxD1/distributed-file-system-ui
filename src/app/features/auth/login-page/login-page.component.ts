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
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-400/15 via-slate-900 to-slate-950 p-8 shadow-2xl shadow-cyan-950/20 sm:p-10">
          <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">Distributed File Storage System</p>
          <h1 class="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Store, organize, and download your files in one place.
          </h1>
          <p class="mt-4 max-w-xl text-base text-slate-300 sm:text-lg">
            Sign in to browse your folders, upload new files, and keep everything easy to find.
          </p>
          <div class="mt-8 grid gap-4 sm:grid-cols-2">
            <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p class="text-sm font-semibold text-white">Easy sign-in</p>
              <p class="mt-2 text-sm text-slate-400">Your session stays active in the background so you can keep working without extra steps.</p>
            </div>
            <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p class="text-sm font-semibold text-white">Made for larger files</p>
              <p class="mt-2 text-sm text-slate-400">Use the faster upload option when you need a smoother experience for bigger files.</p>
            </div>
          </div>
        </section>

        <section class="rounded-[2rem] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-10">
          <div>
            <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">Welcome back</p>
            <h2 class="mt-3 text-2xl font-semibold text-white">Sign in</h2>
            <p class="mt-2 text-sm text-slate-400">Use your account credentials to continue to the dashboard.</p>
          </div>

          <form class="mt-8 space-y-5" [formGroup]="form" (ngSubmit)="submit()">
            @if (submitError()) {
              <app-inline-alert title="Unable to sign in" [message]="submitError()" tone="error"></app-inline-alert>
            }

            <div>
              <label class="mb-2 block text-sm font-medium text-slate-200" for="email">Email</label>
              <input
                id="email"
                type="email"
                formControlName="email"
                class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                placeholder="user@example.com"
              >
              @if (form.controls.email.invalid && form.controls.email.touched) {
                <p class="mt-2 text-sm text-rose-300">Enter a valid email address.</p>
              }
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-slate-200" for="password">Password</label>
              <input
                id="password"
                type="password"
                formControlName="password"
                class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                placeholder="Enter your password"
              >
              @if (form.controls.password.invalid && form.controls.password.touched) {
                <p class="mt-2 text-sm text-rose-300">Password must be at least 8 characters.</p>
              }
            </div>

            <button
              type="submit"
              class="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="isSubmitting()"
            >
              {{ isSubmitting() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <p class="mt-6 text-sm text-slate-400">
            Need an account?
            <a routerLink="/register" class="font-medium text-cyan-300 transition hover:text-cyan-200">Create one</a>
          </p>
        </section>
      </div>
    </div>
  `
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
