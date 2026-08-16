import { NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-outlet',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="pointer-events-auto overflow-hidden rounded-2xl border bg-slate-950/95 p-4 shadow-2xl backdrop-blur"
          [ngClass]="toneClasses[toast.tone]"
        >
          <div class="flex items-start gap-3">
            <div class="mt-0.5 h-2.5 w-2.5 rounded-full bg-current"></div>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-white">{{ toast.title }}</p>
              @if (toast.description) {
                <p class="mt-1 text-sm text-slate-300">{{ toast.description }}</p>
              }
            </div>
            <button
              type="button"
              class="rounded-full p-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
              (click)="toastService.remove(toast.id)"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      }
    </div>
  `
})
export class ToastOutletComponent {
  protected readonly toastService = inject(ToastService);
  protected readonly toneClasses = {
    error: 'border-rose-400/30 text-rose-300',
    info: 'border-cyan-400/30 text-cyan-300',
    success: 'border-emerald-400/30 text-emerald-300'
  } as const;
}
