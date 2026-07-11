import { TestBed } from '@angular/core/testing';
import { editorPortTestProviders } from '../testing/editor-port-test-providers';
import { SvgService } from './svg.service';

describe('SvgService', () => {
  let service: SvgService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: editorPortTestProviders });
    service = TestBed.inject(SvgService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should validate correct SVG content', () => {
    const validSVG = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    expect(service.validateSVG(validSVG)).toBe(true);
  });

  it('should reject invalid SVG content', () => {
    const invalidSVG = '<div>Not an SVG</div>';
    expect(service.validateSVG(invalidSVG)).toBe(false);
  });

  it('should load SVG file', async () => {
    const svgContent = '<svg><rect width="100" height="100"/></svg>';
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const file = new File([blob], 'test.svg', { type: 'image/svg+xml' });

    service.loadSVG(file).subscribe(content => {
      expect(content).toContain('<svg>');
      expect(content).toContain('<rect');
    });
  });
});
