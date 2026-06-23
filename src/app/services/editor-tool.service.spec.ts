import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorToolService } from './editor-tool.service';
import { registerDefaultToolDescriptors } from '../tools/register-default-tool-descriptors';
import { ToolRegistryService } from '../tools/tool-registry.service';

describe('EditorToolService', () => {
  let service: EditorToolService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EditorToolService, ToolRegistryService]
    });
    registerDefaultToolDescriptors(TestBed.inject(ToolRegistryService));
    service = TestBed.inject(EditorToolService);
    service.currentTool.set('selector');
    service.penAltCurveMode.set(true);
  });

  it('setTool clears penAltCurveMode when leaving pen', () => {
    service.setTool('pen');
    service.setPenAltCurveMode(true);
    expect(service.penAltCurveMode()).toBe(true);
    service.setTool('selector');
    expect(service.penAltCurveMode()).toBe(false);
  });

  it('setTool does not clear penAltCurveMode when switching to pen', () => {
    service.setPenAltCurveMode(true);
    service.setTool('pen');
    expect(service.penAltCurveMode()).toBe(true);
  });

  it('isCreationTool is true only for rect, ellipse, and line', () => {
    service.setTool('rect');
    expect(service.isCreationTool()).toBe(true);
    service.setTool('ellipse');
    expect(service.isCreationTool()).toBe(true);
    service.setTool('line');
    expect(service.isCreationTool()).toBe(true);
    service.setTool('pen');
    expect(service.isCreationTool()).toBe(false);
    service.setTool('selector');
    expect(service.isCreationTool('rect')).toBe(true);
    expect(service.isCreationTool('selector')).toBe(false);
  });
});
