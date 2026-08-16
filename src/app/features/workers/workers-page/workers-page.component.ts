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
  templateUrl: './workers-page.component.html'
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
