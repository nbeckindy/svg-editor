import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorLayoutService } from './editor-layout.service';
import { DockPanelAutoShowService } from '../panels/dock-panel-auto-show.service';
import { DockPanelRegistryService } from '../panels/dock-panel-registry.service';
import { EditorToolService } from './editor-tool.service';
import { ShapeSelectionService } from './shape-selection.service';
import { registerDefaultDockPanels } from '../panels/register-default-dock-panels';

describe('EditorLayoutService', () => {
  let layout: EditorLayoutService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EditorLayoutService,
        DockPanelAutoShowService,
        DockPanelRegistryService,
        EditorToolService,
        ShapeSelectionService
      ]
    });
    registerDefaultDockPanels(TestBed.inject(DockPanelRegistryService));
    layout = TestBed.inject(EditorLayoutService);
  });

  it('defaults to expanded document, properties, and layers with token-aligned widths', () => {
    expect(layout.isSectionExpanded('document')).toBe(true);
    expect(layout.isSectionExpanded('properties')).toBe(true);
    expect(layout.isSectionExpanded('layers')).toBe(true);
    expect(layout.isSectionExpanded('pathOps')).toBe(false);
    expect(layout.dockCollapsed()).toBe(false);
    expect(layout.leftRailCollapsed()).toBe(false);
    expect(layout.effectiveRightDockWidthPx()).toBe(320);
    expect(layout.effectiveLeftRailWidthPx()).toBe(72);
  });

  it('uses collapsed dock width when dock is collapsed', () => {
    layout.collapseDock();
    expect(layout.dockCollapsed()).toBe(true);
    expect(layout.effectiveRightDockWidthPx()).toBe(36);
  });

  it('hides left rail width when rail is collapsed', () => {
    layout.setLeftRailCollapsed(true);
    expect(layout.effectiveLeftRailWidthPx()).toBe(0);
  });

  it('preserves section expand state when collapsing and expanding the dock', () => {
    layout.expandSection('pathOps');
    layout.collapseSection('properties');
    layout.collapseDock();
    layout.expandDock();
    expect(layout.isSectionExpanded('pathOps')).toBe(true);
    expect(layout.isSectionExpanded('properties')).toBe(false);
  });

  it('toggles individual stack sections', () => {
    expect(layout.isSectionExpanded('document')).toBe(true);
    layout.toggleSection('document');
    expect(layout.isSectionExpanded('document')).toBe(false);
    layout.toggleSection('document');
    expect(layout.isSectionExpanded('document')).toBe(true);
  });
});
