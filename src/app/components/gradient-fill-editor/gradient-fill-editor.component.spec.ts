import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GradientFillEditorComponent } from './gradient-fill-editor.component';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { GradientFillSnapshotCommand } from '../../models/editor-commands';

describe('GradientFillEditorComponent', () => {
  let fixture: ComponentFixture<GradientFillEditorComponent>;
  let component: GradientFillEditorComponent;

  const baseline = {
    gradientId: 'sg1',
    shapePaintAttr: 'url(#sg1)',
    gradientOuterHtml: '<linearGradient id="sg1"></linearGradient>'
  };

  const model = {
    id: 'sg1',
    kind: 'linear' as const,
    gradientUnits: 'objectBoundingBox' as const,
    x1: '0%',
    y1: '0%',
    x2: '100%',
    y2: '0%',
    stops: [
      { offset: '0%', color: '#111111' },
      { offset: '100%', color: '#222222' }
    ]
  };

  const svgMock = {
    findOne: vi.fn(() => ({
      attr: vi.fn((name: string) => (name === 'stroke' ? 'url(#sg1)' : null))
    }))
  };

  const svcMock = {
    documentRevision: signal(0),
    getSVGInstance: vi.fn(() => svgMock),
    ensureDedicatedPaintGradient: vi.fn(),
    readEditableGradientModelById: vi.fn(() => model),
    capturePaintGradientSnapshot: vi.fn(() => baseline),
    setGradientKindForShape: vi.fn(),
    applyPaintGradientSnapshot: vi.fn(),
    countPaintUrlReferencesToDefId: vi.fn().mockReturnValue(0),
    removeGradientDefById: vi.fn()
  };

  const historyMock = {
    revision: signal(0),
    pushAndExecute: vi.fn((cmd: { execute(): void }) => cmd.execute())
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    svcMock.readEditableGradientModelById.mockReturnValue(model);
    svcMock.capturePaintGradientSnapshot.mockReturnValue(baseline);

    await TestBed.configureTestingModule({
      imports: [GradientFillEditorComponent],
      providers: [
        { provide: SvgManipulationService, useValue: svcMock },
        { provide: EditorHistoryService, useValue: historyMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GradientFillEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('shapeId', 'shape-1');
    fixture.componentRef.setInput('paintProperty', 'stroke');
    fixture.detectChanges();
  });

  it('loads stroke gradient draft and dedicates defs for stroke', () => {
    expect(svcMock.ensureDedicatedPaintGradient).toHaveBeenCalledWith('shape-1', 'stroke');
    expect(component.draftModel?.id).toBe('sg1');
    expect(fixture.nativeElement.querySelector('[data-testid="gradient-fill-editor-root"]')).toBeTruthy();
  });

  it('commit pushes GradientFillSnapshotCommand for stroke paint', () => {
    component.draftModel!.stops[0].color = '#abcdef';
    component.commit();

    expect(historyMock.pushAndExecute).toHaveBeenCalled();
    const cmd = historyMock.pushAndExecute.mock.calls[0][0] as GradientFillSnapshotCommand;
    expect(cmd).toBeInstanceOf(GradientFillSnapshotCommand);
    expect(svcMock.applyPaintGradientSnapshot).toHaveBeenCalledWith(
      'shape-1',
      'stroke',
      expect.objectContaining({
        gradientId: 'sg1',
        shapePaintAttr: 'url(#sg1)',
        gradientOuterHtml: expect.stringContaining('#abcdef')
      })
    );
  });

  it('does not commit when disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    component.commit();
    expect(historyMock.pushAndExecute).not.toHaveBeenCalled();
  });
});
