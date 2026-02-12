import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgService } from '../../services/svg.service';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload-container">
      <div class="upload-zone" 
           (drop)="onDrop($event)" 
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           [class.drag-over]="isDragOver">
        <input 
          type="file" 
          #fileInput 
          accept=".svg,image/svg+xml" 
          (change)="onFileSelected($event)"
          style="display: none">
        <button (click)="fileInput.click()" class="upload-button">
          Choose SVG File
        </button>
        <p>or drag and drop here</p>
        @if (errorMessage) {
          <div class="error">{{ errorMessage }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }
    .upload-container {
      padding: 20px;
      height: 100%;
      box-sizing: border-box;
    }
    .upload-zone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      transition: all 0.3s ease;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .upload-zone.drag-over {
      border-color: #2196F3;
      background-color: #e3f2fd;
    }
    .upload-button {
      padding: 10px 20px;
      background-color: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    .upload-button:hover {
      background-color: #1976D2;
    }
    .error {
      color: #f44336;
      margin-top: 10px;
    }
  `]
})
export class FileUploadComponent {
  @Output() svgLoaded = new EventEmitter<string>();
  
  isDragOver = false;
  errorMessage = '';

  constructor(private svgService: SvgService) {}

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

    this.svgService.loadSVG(file).subscribe({
      next: (content) => {
        this.svgLoaded.emit(content);
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load SVG file';
      }
    });
  }
}
