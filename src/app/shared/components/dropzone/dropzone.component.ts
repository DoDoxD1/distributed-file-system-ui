import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-dropzone',
  standalone: true,
  imports: [CommonModule],
  template: `
    <label
      class="group block rounded-3xl border border-dashed p-6 transition"
      [class.cursor-pointer]="!disabled"
      [class.border-cyan-400/70]="isDragging"
      [class.bg-cyan-400/10]="isDragging"
      [class.border-slate-700]="!isDragging"
      [class.bg-slate-900/60]="!isDragging"
      [class.opacity-60]="disabled"
      (dragover)="handleDragOver($event)"
      (dragleave)="handleDragLeave($event)"
      (drop)="handleDrop($event)"
    >
      <input
        class="hidden"
        type="file"
        [accept]="accept"
        [disabled]="disabled"
        (change)="handleFileInput($event)"
      >

      <div class="flex flex-col gap-3 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-2xl text-cyan-300">
          ↑
        </div>
        <div>
          <p class="text-base font-semibold text-white">{{ label }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ hint }}</p>
        </div>
        @if (fileName) {
          <div class="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left">
            <p class="text-xs uppercase tracking-[0.24em] text-slate-500">Selected file</p>
            <p class="mt-1 truncate text-sm font-medium text-slate-100">{{ fileName }}</p>
          </div>
        }
      </div>
    </label>
  `
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
