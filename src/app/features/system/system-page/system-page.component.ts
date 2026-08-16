import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { HealthResponse, VersionResponse } from '../../../core/models/api.models';
import { SystemService } from '../../../core/services/system.service';
import { ToastService } from '../../../core/services/toast.service';
import { formatDateTime } from '../../../core/utils/format.util';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';

@Component({
  selector: 'app-system-page',
  standalone: true,
  imports: [CommonModule, InlineAlertComponent, LoadingStateComponent],
  template: `
    <section class="space-y-6">
      <div class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/10 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-sm uppercase tracking-[0.34em] text-cyan-300/80">System</p>
            <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">Platform health and release info</h2>
            <p class="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
              Check backend availability and verify which application version is currently serving the API.
            </p>
          </div>
          <button
            type="button"
            class="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
            (click)="reload()"
          >
            Refresh status
          </button>
        </div>
      </div>

      @if (pageError()) {
        <app-inline-alert title="System data is unavailable" [message]="pageError()" tone="error"></app-inline-alert>
      }

      @if (isLoading()) {
        <app-loading-state
          title="Loading system information"
          description="Fetching health and version metadata from the backend."
        ></app-loading-state>
      } @else {
        <div class="grid gap-6 lg:grid-cols-2">
          <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-semibold text-white">Health check</p>
                <p class="text-sm text-slate-400">GET /api/v1/system/health</p>
              </div>
              @if (health(); as health) {
                <span
                  class="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]"
                  [class.border-emerald-400/30]="health.status === 'UP'"
                  [class.bg-emerald-400/10]="health.status === 'UP'"
                  [class.text-emerald-200]="health.status === 'UP'"
                  [class.border-rose-400/30]="health.status !== 'UP'"
                  [class.bg-rose-400/10]="health.status !== 'UP'"
                  [class.text-rose-200]="health.status !== 'UP'"
                >
                  {{ health.status }}
                </span>
              }
            </div>

            @if (health(); as health) {
              <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Service status</p>
                  <p class="mt-2 text-lg font-semibold text-white">{{ health.status }}</p>
                </div>
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Database</p>
                  <p class="mt-2 text-lg font-semibold text-white">{{ health.database }}</p>
                </div>
              </div>
              <p class="mt-4 text-sm text-slate-400">Last checked {{ formatDateTime(health.checkedAt) }}</p>
            }
          </section>

          <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
            <p class="text-sm font-semibold text-white">Application version</p>
            <p class="text-sm text-slate-400">GET /api/v1/system/version</p>

            @if (version(); as version) {
              <div class="mt-6 space-y-4">
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Application</p>
                  <p class="mt-2 text-lg font-semibold text-white">{{ version.application }}</p>
                </div>
                <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Version</p>
                  <p class="mt-2 text-lg font-semibold text-white">{{ version.version }}</p>
                </div>
              </div>
            }
          </section>
        </div>
      }
    </section>
  `
})
export class SystemPageComponent {
  private readonly systemService = inject(SystemService);
  private readonly toast = inject(ToastService);

  protected readonly isLoading = signal(true);
  protected readonly pageError = signal('');
  protected readonly health = signal<HealthResponse | null>(null);
  protected readonly version = signal<VersionResponse | null>(null);
  protected readonly formatDateTime = formatDateTime;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.isLoading.set(true);
    this.pageError.set('');

    try {
      const [health, version] = await Promise.all([
        firstValueFrom(this.systemService.getHealth()),
        firstValueFrom(this.systemService.getVersion())
      ]);

      this.health.set(health);
      this.version.set(version);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load system data.');
      this.pageError.set(message);
      this.toast.error('System request failed', message);
    } finally {
      this.isLoading.set(false);
    }
  }
}
