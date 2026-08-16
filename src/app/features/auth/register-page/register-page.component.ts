import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, InlineAlertComponent],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid w-full max-w-5xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <section class="rounded-[2rem] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-10">
          <div>
            <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">Create account</p>
            <h1 class="mt-3 text-2xl font-semibold text-white">Create your account</h1>
            <p class="mt-2 text-sm text-slate-400">Get started in a few seconds and begin saving files right away.</p>
          </div>

          <form class="mt-8 space-y-5" (ngSubmit)="submit()">
            @if (submitError()) {
              <app-inline-alert title="Unable to register" [message]="submitError()" tone="error"></app-inline-alert>
            }

            <div>
              <label class="mb-2 block text-sm font-medium text-slate-200" for="register-email">Email</label>
              <input
                id="register-email"
                type="email"
                [formControl]="emailControl"
                class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                placeholder="user@example.com"
              >
              @if (emailControl.invalid && emailControl.touched) {
                <p class="mt-2 text-sm text-rose-300">Enter a valid email address.</p>
              }
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-slate-200" for="register-password">Password</label>
              <input
                id="register-password"
                type="password"
                [formControl]="passwordControl"
                class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                placeholder="At least 8 characters"
              >
              @if (passwordControl.invalid && passwordControl.touched) {
                <p class="mt-2 text-sm text-rose-300">Password must be at least 8 characters.</p>
              }
            </div>

            <button
              type="submit"
              class="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="isSubmitting()"
            >
              {{ isSubmitting() ? 'Creating account…' : 'Create account' }}
            </button>
          </form>

          <p class="mt-6 text-sm text-slate-400">
            Already have an account?
            <a routerLink="/login" class="font-medium text-cyan-300 transition hover:text-cyan-200">Sign in</a>
          </p>
        </section>

        <section class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-500/10 p-8 shadow-2xl shadow-cyan-950/20 sm:p-10">
          <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">Why people like it</p>
          <h2 class="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Built to feel simple, clear, and dependable.
          </h2>
          <div class="mt-8 space-y-4">
            <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p class="text-sm font-semibold text-white">Safer uploads</p>
              <p class="mt-2 text-sm text-slate-400">If something interrupts an upload, you can try again without starting from scratch.</p>
            </div>
            <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p class="text-sm font-semibold text-white">Simple navigation</p>
              <p class="mt-2 text-sm text-slate-400">Your files, uploads, and status pages stay easy to reach from anywhere in the app.</p>
            </div>
            <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p class="text-sm font-semibold text-white">Clear file history</p>
              <p class="mt-2 text-sm text-slate-400">Open a file to see when it was saved, download an older copy, or remove a version you no longer need.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  `
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly emailControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email]
  });
  protected readonly passwordControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(8)]
  });
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal('');

  protected async submit(): Promise<void> {
    this.emailControl.markAsTouched();
    this.passwordControl.markAsTouched();

    if (this.emailControl.invalid || this.passwordControl.invalid) {
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');

    try {
      await firstValueFrom(
        this.auth.register({
          email: this.emailControl.getRawValue().trim(),
          password: this.passwordControl.getRawValue()
        })
      );

      this.toast.success('Account created', 'You are signed in and ready to use the dashboard.');
      void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirectTo') || '/files');
    } catch (error) {
      const message = getErrorMessage(error, 'The registration request failed.');
      this.submitError.set(message);
      this.toast.error('Registration failed', message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
