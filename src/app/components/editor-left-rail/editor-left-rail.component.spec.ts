import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorLeftRailComponent } from './editor-left-rail.component';
import { editorPortTestProviders } from '../../testing/editor-port-test-providers';

describe('EditorLeftRailComponent', () => {
  let fixture: ComponentFixture<EditorLeftRailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorLeftRailComponent],
      providers: [...editorPortTestProviders]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorLeftRailComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should only render assets trigger in dev mode', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    if (fixture.componentInstance.showDevAssetsMenu) {
      expect(compiled.querySelector('[data-testid="editor-assets-menu-button"]')).toBeTruthy();
    } else {
      expect(compiled.querySelector('[data-testid="editor-assets-menu-button"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="editor-assets-dev-menu"]')).toBeNull();
    }
  });

  it('should toggle assets popover when Assets button is clicked', () => {
    if (!fixture.componentInstance.showDevAssetsMenu) return;

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('[data-testid="editor-assets-menu-button"]') as HTMLElement;

    expect(fixture.componentInstance.assetsMenuOpen()).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.assetsMenuOpen()).toBe(true);
    expect(compiled.querySelector('[data-testid="editor-assets-popover"]')).toBeTruthy();

    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.assetsMenuOpen()).toBe(false);
    expect(compiled.querySelector('[data-testid="editor-assets-popover"]')).toBeNull();
  });

  it('should close assets popover on outside document click', () => {
    if (!fixture.componentInstance.showDevAssetsMenu) return;

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('[data-testid="editor-assets-menu-button"]') as HTMLElement;
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.assetsMenuOpen()).toBe(true);

    document.body.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.assetsMenuOpen()).toBe(false);
  });
});
