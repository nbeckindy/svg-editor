import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgService } from '../../services/svg.service';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.css'
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
