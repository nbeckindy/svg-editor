import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header h1')?.textContent).toContain('Angular SVG Editor');
  });

  it('should have file upload, canvas, layers panel, properties panel, and svg debug panel', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-file-upload')).toBeTruthy();
    expect(compiled.querySelector('app-svg-canvas')).toBeTruthy();
    expect(compiled.querySelector('app-layers-panel')).toBeTruthy();
    expect(compiled.querySelector('app-properties-panel')).toBeTruthy();
    expect(compiled.querySelector('app-svg-debug-panel')).toBeTruthy();
  });

  it('should update svgContent when onSVGLoaded is called', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const content = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    app.onSVGLoaded(content);
    expect(app.svgContent).toBe(content);
  });
});
