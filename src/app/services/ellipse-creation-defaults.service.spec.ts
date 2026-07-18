import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { EllipseCreationDefaultsService } from './ellipse-creation-defaults.service';

describe('EllipseCreationDefaultsService', () => {
  let service: EllipseCreationDefaultsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EllipseCreationDefaultsService);
  });

  it('defaults to 100×100, top-left', () => {
    expect(service.snapshot()).toEqual({
      width: 100,
      height: 100,
      orientation: 'top-left'
    });
  });

  it('rejects non-positive width/height', () => {
    service.setWidth(0);
    service.setHeight(-5);
    expect(service.width()).toBe(100);
    expect(service.height()).toBe(100);
  });

  it('updates width and height', () => {
    service.setWidth(80);
    service.setHeight(40);
    expect(service.width()).toBe(80);
    expect(service.height()).toBe(40);
  });

  it('updates orientation', () => {
    service.setOrientation('center');
    expect(service.orientation()).toBe('center');
  });
});
