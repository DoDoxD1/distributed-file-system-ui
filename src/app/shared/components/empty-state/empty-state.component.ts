import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="rounded-3xl border border-dashed border-slate-700/80 bg-slate-900/40 p-8 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-xl text-slate-200">
        {{ icon }}
      </div>
      <h3 class="mt-4 text-lg font-semibold text-white">{{ title }}</h3>
      <p class="mx-auto mt-2 max-w-md text-sm text-slate-400">{{ description }}</p>
      <ng-content></ng-content>
    </div>
  `
})
export class EmptyStateComponent {
  @Input() icon = '·';
  @Input() title = 'Nothing here yet';
  @Input() description = 'There is no data to show right now.';
}
