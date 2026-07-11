import { Matrix } from '@svgdotjs/svg.js';
import { BASE_DRAWING_STYLE_DEFAULTS, type DrawingStyleDefaults } from '../../../models/drawing-style-defaults';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { DrawingStyleDefaultsWritePort } from '../../drawing-style-defaults.port';
import { mockSvc, makeMockSvgElement } from '../command-test-helpers';
import { EditPathNodesCommand } from '../../../models/editor-commands';

describe('EditPathNodesCommand', () => {
  it('first execute() is a no-op when drag already applied', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20', true);
    cmd.execute();
    expect(svc.updatePathData).not.toHaveBeenCalled();
  });

  it('execute() applies new d when not pre-applied', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20');
    cmd.execute();
    expect(svc.updatePathData).toHaveBeenCalledWith('p1', 'M 0 0 L 20 20');
  });

  it('undo() restores old d', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20', true);
    cmd.undo();
    expect(svc.updatePathData).toHaveBeenCalledWith('p1', 'M 0 0 L 10 10');
  });

  it('redo re-applies new d after undo when drag was pre-applied', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20', true);

    cmd.execute(); // no-op first execute because drag already applied
    cmd.undo();
    cmd.execute(); // redo

    expect(svc.updatePathData).toHaveBeenNthCalledWith(1, 'p1', 'M 0 0 L 10 10');
    expect(svc.updatePathData).toHaveBeenNthCalledWith(2, 'p1', 'M 0 0 L 20 20');
  });
});
