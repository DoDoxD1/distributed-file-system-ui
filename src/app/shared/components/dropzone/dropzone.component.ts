import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-dropzone',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dropzone.component.html'
})
export class DropzoneComponent {
  @Input() label = 'Drop a file here';
  @Input() hint = 'Or click to choose a file from your device.';
  @Input() accept = '*/*';
  @Input() disabled = false;
  @Input() fileName = '';

  @Output() fileSelected = new EventEmitter<File>();

  protected isDragging = false;

  protected handleDragOver(event: DragEvent): void {
    if (this.disabled) {
      return;
    }

    event.preventDefault();
    this.isDragging = true;
  }

  protected handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  protected handleDrop(event: DragEvent): void {
    if (this.disabled) {
      return;
    }

    event.preventDefault();
    this.isDragging = false;

    const file = event.dataTransfer?.files.item(0);

    if (file) {
      this.fileSelected.emit(file);
    }
  }

  protected handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);

    if (file) {
      this.fileSelected.emit(file);
    }

    input.value = '';
  }
}
