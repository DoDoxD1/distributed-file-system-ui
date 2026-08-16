import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  templateUrl: './empty-state.component.html'
})
export class EmptyStateComponent {
  @Input() icon = '·';
  @Input() title = 'Nothing here yet';
  @Input() description = 'There is no data to show right now.';
}
