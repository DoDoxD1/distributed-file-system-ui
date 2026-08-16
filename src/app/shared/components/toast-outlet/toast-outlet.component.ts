import { NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-outlet',
  standalone: true,
  imports: [NgClass],
  templateUrl: './toast-outlet.component.html'
})
export class ToastOutletComponent {
  protected readonly toastService = inject(ToastService);
  protected readonly toneClasses = {
    error: 'border-rose-500/40 text-rose-600 dark:border-rose-400/30 dark:text-rose-300',
    info: 'border-cyan-500/40 text-cyan-700 dark:border-cyan-400/30 dark:text-cyan-300',
    success: 'border-emerald-500/40 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300'
  } as const;
}
