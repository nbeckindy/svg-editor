import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { IconPaletteComponent } from './icon-palette.component';
import { TEST_ICONS } from '../../data/test-icons';

describe('IconPaletteComponent', () => {
  let component: IconPaletteComponent;
  let fixture: ComponentFixture<IconPaletteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconPaletteComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(IconPaletteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render test icons', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('.icon-item');
    expect(buttons.length).toBe(component.icons.length);
  });

  it('should emit svgLoaded with icon svg string when an icon is clicked', () => {
    const icon = TEST_ICONS[0];
    let emittedContent = '';
    component.svgLoaded.subscribe((content: string) => {
      emittedContent = content;
    });

    component.selectIcon(icon);

    // TEST_ICONS strings don't start with XML declarations, so marker is prepended.
    expect(emittedContent).toBe(`<!--svg-editor-test-icon-->${icon.svg}`);
  });

  it('should display icon labels', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const labels = compiled.querySelectorAll('.icon-label');
    component.icons.forEach((icon, index) => {
      expect(labels[index].textContent?.trim()).toBe(icon.label);
    });
  });
});
