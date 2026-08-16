import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  templateUrl: './loading-state.component.html'
})
export class LoadingStateComponent {
  @Input() title = 'Loading';
  @Input() description = 'Please wait while data loads.';
}
