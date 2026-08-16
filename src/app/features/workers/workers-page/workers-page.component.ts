import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { WorkerRunResponse } from '../../../core/models/api.models';
import { ToastService } from '../../../core/services/toast.service';
import { WorkersService } from '../../../core/services/workers.service';
import { formatDateTime } from '../../../core/utils/format.util';
import { getErrorMessage } from '../../../core/utils/http-error.util';
import { InlineAlertComponent } from '../../../shared/components/inline-alert/inline-alert.component';

interface WorkerCard {
  key: 'scan' | 'repair' | 'gc' | 'migrate';
  title: string;
  description: string;
  endpoint: string;
  buttonLabel: string;
}

const isoInstantValidator = (
  control: AbstractControl<string>
): ValidationErrors | null => {
  const value = control.value?.trim();

  if (!value) {
    return null;
  }

  return Number.isNaN(Date.parse(value)) || !value.includes('T') ? { isoInstant: true } : null;
};

@Component({
  selector: 'app-workers-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InlineAlertComponent],
  template: `
    <section class="space-y-6">
      <div class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-amber-400/15 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-amber-950/20 sm:p-8">
        <p class="text-sm uppercase tracking-[0.34em] text-amber-200/80">Admin Workers</p>
        <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">Privileged maintenance operations</h2>
        <p class="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
          Run backend worker jobs for pruning, repair, garbage collection, and migration. These controls are route-guarded and only rendered for administrator sessions.
        </p>
      </div>

      <div class="grid gap-6 xl:grid-cols-2">
        @for (worker of workerCards; track worker.key) {
          <section class="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-lg font-semibold text-white">{{ worker.title }}</p>
                <p class="mt-2 text-sm text-slate-400">{{ worker.description }}</p>
                <p class="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">{{ worker.endpoint }}</p>
              </div>
              <button
                type="button"
                class="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                [disabled]="runningWorker() === worker.key"
                (click)="runWorker(worker.key)"
              >
                {{ runningWorker() === worker.key ? 'Running…' : worker.buttonLabel }}
              </button>
            </div>

            @if (worker.key === 'gc') {
              <div class="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
                <label class="mb-2 block text-sm font-medium text-slate-200" for="reference-time">Reference time (optional)</label>
                <input
                  id="reference-time"
                  type="text"
                  [formControl]="referenceTimeControl"
                  class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                  placeholder="2026-08-16T12:34:56Z"
                >
                @if (referenceTimeControl.invalid && referenceTimeControl.touched) {
                  <p class="mt-2 text-sm text-rose-300">Use an ISO-8601 instant such as 2026-08-16T12:34:56Z.</p>
                }
              </div>
            }

            @if (errorFor(worker.key)) {
              <div class="mt-5">
                <app-inline-alert title="Worker failed" [message]="errorFor(worker.key)" tone="error"></app-inline-alert>
              </div>
            }

            @if (resultFor(worker.key); as result) {
              <div class="mt-5 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-5">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-emerald-100">Last successful run</p>
                    <p class="mt-2 text-base font-semibold text-white">{{ result.worker }}</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-300/20 bg-slate-950/40 px-4 py-3 text-right">
                    <p class="text-xs uppercase tracking-[0.24em] text-emerald-200/70">Affected count</p>
                    <p class="mt-2 text-2xl font-semibold text-white">{{ result.affectedCount }}</p>
                  </div>
                </div>
                <p class="mt-4 text-sm text-emerald-100/80">Completed {{ formatDateTime(lastRunTimes()[worker.key] || null) }}</p>
              </div>
            }
          </section>
        }
      </div>
    </section>
  `
})
export class WorkersPageComponent {
  private readonly workersService = inject(WorkersService);
  private readonly toast = inject(ToastService);

  protected readonly referenceTimeControl = new FormControl('', {
    nonNullable: true,
    validators: [isoInstantValidator]
  });
  protected readonly runningWorker = signal<WorkerCard['key'] | null>(null);
  protected readonly results = signal<Partial<Record<WorkerCard['key'], WorkerRunResponse>>>({});
  protected readonly errors = signal<Partial<Record<WorkerCard['key'], string>>>({});
  protected readonly lastRunTimes = signal<Partial<Record<WorkerCard['key'], string>>>({});
  protected readonly formatDateTime = formatDateTime;

  protected readonly workerCards: WorkerCard[] = [
    {
      key: 'scan',
      title: 'Scan and prune missing replicas',
      description: 'Scans the cluster for replicas that no longer exist and prunes invalid references.',
      endpoint: 'POST /api/v1/workers/scan',
      buttonLabel: 'Run scan'
    },
    {
      key: 'repair',
      title: 'Repair under-replicated chunks',
      description: 'Repairs chunks that do not currently satisfy the replication policy.',
      endpoint: 'POST /api/v1/workers/repair',
      buttonLabel: 'Run repair'
    },
    {
      key: 'gc',
      title: 'Garbage collect unreferenced chunks',
      description: 'Removes chunks that are no longer referenced, optionally using a reference-time cutoff.',
      endpoint: 'POST /api/v1/workers/gc?referenceTime=<optional-ISO-8601-instant>',
      buttonLabel: 'Run GC'
    },
    {
      key: 'migrate',
      title: 'Migrate local chunks to bucket',
      description: 'Moves legacy local chunks into the Oracle-backed bucket storage layer.',
      endpoint: 'POST /api/v1/workers/migrate-local-chunks',
      buttonLabel: 'Run migration'
    }
  ];

  protected async runWorker(key: WorkerCard['key']): Promise<void> {
    if (key === 'gc') {
      this.referenceTimeControl.markAsTouched();
      if (this.referenceTimeControl.invalid) {
        return;
      }
    }

    this.runningWorker.set(key);
    this.setError(key, '');

    try {
      const result = await firstValueFrom(this.resolveWorkerRequest(key));
      this.results.update((current) => ({ ...current, [key]: result }));
      this.lastRunTimes.update((current) => ({ ...current, [key]: new Date().toISOString() }));
      this.toast.success('Worker completed', `${result.worker} affected ${result.affectedCount} records.`);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to run the worker operation.');
      this.setError(key, message);
      this.toast.error('Worker failed', message);
    } finally {
      this.runningWorker.set(null);
    }
  }

  protected resultFor(key: WorkerCard['key']): WorkerRunResponse | null {
    return this.results()[key] ?? null;
  }

  protected errorFor(key: WorkerCard['key']): string {
    return this.errors()[key] ?? '';
  }

  private resolveWorkerRequest(key: WorkerCard['key']) {
    switch (key) {
      case 'scan':
        return this.workersService.runScan();
      case 'repair':
        return this.workersService.runRepair();
      case 'gc':
        return this.workersService.runGarbageCollection(
          this.referenceTimeControl.getRawValue().trim() || undefined
        );
      case 'migrate':
        return this.workersService.runMigration();
    }
  }

  private setError(key: WorkerCard['key'], message: string): void {
    this.errors.update((current) => ({ ...current, [key]: message }));
  }
}
