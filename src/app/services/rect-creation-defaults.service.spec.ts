import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { RectCreationDefaultsService } from './rect-creation-defaults.service';

describe('RectCreationDefaultsService', () => {
  let service: RectCreationDefaultsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RectCreationDefaultsService);
  });

  it('defaults to 100×100, corner 0, top-left', () => {
    expect(service.snapshot()).toEqual({
      width: 100,
      height: 100,
      cornerRadius: 0,
      orientation: 'top-left'
    });
  });

  it('rejects non-positive width/height', () => {
    service.setWidth(0);
    service.setHeight(-5);
    expect(service.width()).toBe(100);
    expect(service.height()).toBe(100);
  });

  it('clamps corner when dimensions shrink', () => {
    service.setCornerRadius(40);
    expect(service.cornerRadius()).toBe(40);
    service.setHeight(60);
    expect(service.cornerRadius()).toBe(30);
  });

  it('exposes maxCornerRadius as half the shorter edge', () => {
    service.setWidth(100);
    service.setHeight(40);
    expect(service.maxCornerRadius()).toBe(20);
  });

  it('updates orientation', () => {
    service.setOrientation('center');
    expect(service.orientation()).toBe('center');
  });
});
