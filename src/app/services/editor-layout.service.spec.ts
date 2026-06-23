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

  it('defaults to expanded properties dock with token-aligned widths', () => {
    expect(layout.activeDockPanel()).toBe('properties');
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

  it('preserves active tab when collapsing and expanding the dock', () => {
    layout.selectDockPanel('layers');
    layout.collapseDock();
    layout.expandDock();
    expect(layout.activeDockPanel()).toBe('layers');
  });
});
