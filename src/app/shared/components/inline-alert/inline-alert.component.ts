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
    error: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    info: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
  };
}
