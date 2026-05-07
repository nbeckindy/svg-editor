import { TestBed } from '@angular/core/testing';
import {
  BASE_DRAWING_STYLE_DEFAULTS,
  DrawingStyleDefaultsService
} from './drawing-style-defaults.service';

describe('DrawingStyleDefaultsService', () => {
  let service: DrawingStyleDefaultsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DrawingStyleDefaultsService);
  });

  it('initializes with baseline creation defaults', () => {
    expect(service.defaults()).toEqual(BASE_DRAWING_STYLE_DEFAULTS);
    expect(service.fill()).toBe('#000000');
    expect(service.stroke()).toBe('#000000');
    expect(service.strokeWidth()).toBe(2);
  });

  it('updates defaults through the partial update API', () => {
    service.updateDefaults({ fill: '#ff0000', strokeWidth: 5 });

    expect(service.defaults()).toEqual({
      fill: '#ff0000',
      stroke: '#000000',
      strokeWidth: 5
    });
  });

  it('replaces defaults through setDefaults', () => {
    service.setDefaults({
      fill: '#112233',
      stroke: '#abcdef',
      strokeWidth: 3
    });

    expect(service.defaults()).toEqual({
      fill: '#112233',
      stroke: '#abcdef',
      strokeWidth: 3
    });
  });

  it('retains previous values when update input is invalid', () => {
    service.updateDefaults({ fill: '#123456', stroke: '#654321', strokeWidth: 7 });
    service.updateDefaults({
      fill: ' ',
      stroke: '',
      strokeWidth: Number.NaN
    });

    expect(service.defaults()).toEqual({
      fill: '#123456',
      stroke: '#654321',
      strokeWidth: 7
    });
  });

  it('resets defaults to baseline values', () => {
    service.updateDefaults({ fill: '#00ff00', stroke: '#111111', strokeWidth: 9 });

    service.resetDefaults();

    expect(service.defaults()).toEqual(BASE_DRAWING_STYLE_DEFAULTS);
  });
});
