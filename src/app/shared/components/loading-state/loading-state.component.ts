import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  template: `
    <div class="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"></div>
      <h3 class="mt-4 text-lg font-semibold text-white">{{ title }}</h3>
      <p class="mt-2 text-sm text-slate-400">{{ description }}</p>
    </div>
  `
})
export class LoadingStateComponent {
  @Input() title = 'Loading';
  @Input() description = 'Please wait while data loads.';
}
