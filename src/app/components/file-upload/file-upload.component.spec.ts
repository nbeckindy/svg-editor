import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileUploadComponent } from './file-upload.component';
import { SvgService } from '../../services/svg.service';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

describe('FileUploadComponent', () => {
  let component: FileUploadComponent;
  let fixture: ComponentFixture<FileUploadComponent>;
  let svgService: SvgService;

  beforeEach(async () => {
    const svgServiceMock = {
      loadSVG: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [FileUploadComponent],
      providers: [
        { provide: SvgService, useValue: svgServiceMock }
      ]
    }).compileComponents();

    svgService = TestBed.inject(SvgService);
    fixture = TestBed.createComponent(FileUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit svgLoaded event when file is successfully loaded', () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    vi.spyOn(svgService, 'loadSVG').mockReturnValue(of(svgContent));

    let emittedContent = '';
    component.svgLoaded.subscribe((content: string) => {
      emittedContent = content;
    });

    const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file] } } as unknown as Event;
    
    component.onFileSelected(event);
    
    expect(emittedContent).toBe(svgContent);
  });

  it('should show error message for non-SVG files', () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const event = { target: { files: [file] } } as unknown as Event;
    
    component.onFileSelected(event);
    
    expect(component.errorMessage).toBe('Please select an SVG file');
  });

  it('should show error message when SVG loading fails', async () => {
    const errorMessage = 'Invalid SVG file';
    vi.spyOn(svgService, 'loadSVG').mockReturnValue(throwError(() => new Error(errorMessage)));

    const file = new File(['<svg></svg>'], 'test.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file] } } as unknown as Event;
    
    component.onFileSelected(event);
    
    // Wait for the next tick to allow the error callback to execute
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(component.errorMessage).toBe(errorMessage);
  });

  it('should handle drag over event', () => {
    const event = {
      preventDefault: vi.fn()
    } as unknown as DragEvent;
    
    component.onDragOver(event);
    
    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.isDragOver).toBe(true);
  });

  it('should handle drag leave event', () => {
    component.isDragOver = true;
    const event = {
      preventDefault: vi.fn()
    } as unknown as DragEvent;
    
    component.onDragLeave(event);
    
    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.isDragOver).toBe(false);
  });

  it('should handle drop event with SVG file', () => {
    const svgContent = '<svg><rect width="100" height="100"/></svg>';
    const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
    
    vi.spyOn(svgService, 'loadSVG').mockReturnValue(of(svgContent));
    
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [file]
      }
    } as unknown as DragEvent;
    
    component.onDrop(event);
    
    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.isDragOver).toBe(false);
    expect(svgService.loadSVG).toHaveBeenCalledWith(file);
  });

  it('should clear error message when loading new file', () => {
    component.errorMessage = 'Previous error';
    
    const svgContent = '<svg></svg>';
    const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
    vi.spyOn(svgService, 'loadSVG').mockReturnValue(of(svgContent));
    
    const event = { target: { files: [file] } } as unknown as Event;
    component.onFileSelected(event);
    
    expect(component.errorMessage).toBe('');
  });
});
