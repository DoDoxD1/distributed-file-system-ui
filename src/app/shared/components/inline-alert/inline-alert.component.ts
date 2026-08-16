import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

import { ToastTone } from '../../../core/services/toast.service';

@Component({
  selector: 'app-inline-alert',
  standalone: true,
  imports: [NgClass],
  templateUrl: './inline-alert.component.html'
})
export class InlineAlertComponent {
  @Input() title = 'Notice';
  @Input() message = '';
  @Input() tone: ToastTone = 'info';

  protected readonly toneClasses: Record<ToastTone, string> = {
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200',
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200'
  };
}
