import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-file-upload',
  imports: [CommonModule],
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.css'
})
export class FileUploadComponent {
  readonly svgLoaded = output<string>();
  readonly fileNameLoaded = output<string>();

  isDragOver = false;
  errorMessage = '';

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.loadFile(input.files[0]);
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.loadFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  private loadFile(file: File): void {
    this.errorMessage = '';

    if (!file.type.includes('svg')) {
      this.errorMessage = 'Please select an SVG file';
      return;
    }

    this.readFileAsText(file).then(
      (content) => {
        if (!this.isValidSvg(content)) {
          this.errorMessage = 'Invalid SVG file';
          return;
        }
        this.svgLoaded.emit(content);
        this.fileNameLoaded.emit(file.name);
      },
      () => {
        this.errorMessage = 'Failed to load SVG file';
      }
    );
  }

  protected isValidSvg(content: string): boolean {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    return !doc.querySelector('parsererror') && doc.querySelector('svg') !== null;
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
}
