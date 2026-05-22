import { TestBed } from '@angular/core/testing';
import { SvgSelectionGeometryService } from './svg-selection-geometry.service';

describe('SvgSelectionGeometryService', () => {
  it('getShapeBBox returns null when document is not initialized', () => {
    TestBed.configureTestingModule({});
    const geometry = TestBed.inject(SvgSelectionGeometryService);
    expect(geometry.getShapeBBox('any-id')).toBeNull();
  });
});
