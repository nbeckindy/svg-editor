import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileUploadComponent } from './file-upload.component';
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('FileUploadComponent', () => {
  let component: FileUploadComponent;
  let fixture: ComponentFixture<FileUploadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUploadComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit svgLoaded event when file is successfully loaded', async () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    vi.spyOn(component as any, 'readFileAsText').mockResolvedValue(svgContent);
    vi.spyOn(component as any, 'isValidSvg').mockReturnValue(true);

    let emittedContent = '';
    component.svgLoaded.subscribe((content: string) => {
      emittedContent = content;
    });

    const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file] } } as unknown as Event;

    component.onFileSelected(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emittedContent).toBe(svgContent);
  });

  it('should also emit fileNameLoaded when file is successfully loaded', async () => {
    const svgContent = '<svg></svg>';
    vi.spyOn(component as any, 'readFileAsText').mockResolvedValue(svgContent);
    vi.spyOn(component as any, 'isValidSvg').mockReturnValue(true);

    let emittedName = '';
    component.fileNameLoaded.subscribe((name: string) => {
      emittedName = name;
    });

    const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file] } } as unknown as Event;

    component.onFileSelected(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emittedName).toBe('test.svg');
  });

  it('should show error message for non-SVG files', () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const event = { target: { files: [file] } } as unknown as Event;

    component.onFileSelected(event);

    expect(component.errorMessage).toBe('Please select an SVG file');
  });

  it('should show error message when file reading fails', async () => {
    vi.spyOn(component as any, 'readFileAsText').mockRejectedValue(new Error('Read failed'));

    const file = new File(['<svg></svg>'], 'test.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file] } } as unknown as Event;

    component.onFileSelected(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.errorMessage).toBe('Failed to load SVG file');
  });

  it('should show error message when content is not valid SVG', async () => {
    const invalidContent = '<div>Not an SVG</div>';
    vi.spyOn(component as any, 'readFileAsText').mockResolvedValue(invalidContent);
    vi.spyOn(component as any, 'isValidSvg').mockReturnValue(false);

    const file = new File([invalidContent], 'test.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file] } } as unknown as Event;

    component.onFileSelected(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.errorMessage).toBe('Invalid SVG file');
  });

  it('should handle drag over event', () => {
    const event = { preventDefault: vi.fn() } as unknown as DragEvent;

    component.onDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.isDragOver).toBe(true);
  });

  it('should handle drag leave event', () => {
    component.isDragOver = true;
    const event = { preventDefault: vi.fn() } as unknown as DragEvent;

    component.onDragLeave(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.isDragOver).toBe(false);
  });

  it('should handle drop event with SVG file', async () => {
    const svgContent = '<svg><rect width="100" height="100"/></svg>';
    vi.spyOn(component as any, 'readFileAsText').mockResolvedValue(svgContent);
    vi.spyOn(component as any, 'isValidSvg').mockReturnValue(true);

    let emittedContent = '';
    component.svgLoaded.subscribe((content: string) => {
      emittedContent = content;
    });

    const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent;

    component.onDrop(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.isDragOver).toBe(false);
    expect(emittedContent).toBe(svgContent);
  });

  it('should clear error message when loading new file', async () => {
    const svgContent = '<svg></svg>';
    vi.spyOn(component as any, 'readFileAsText').mockResolvedValue(svgContent);
    vi.spyOn(component as any, 'isValidSvg').mockReturnValue(true);
    component.errorMessage = 'Previous error';

    const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file] } } as unknown as Event;
    component.onFileSelected(event);

    expect(component.errorMessage).toBe('');
  });
});
