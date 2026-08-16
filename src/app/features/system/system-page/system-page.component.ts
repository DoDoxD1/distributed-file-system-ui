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
  templateUrl: './system-page.component.html'
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
