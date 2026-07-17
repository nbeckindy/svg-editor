/**
 * Public entry for **History** (undo/redo): command contract, concrete command classes,
 * and narrow **ports** those commands depend on. Not a generic `models` package — prefer
 * adding new port types here and keeping command constructors on ports + plain data only.
 */
export type { EditorCommand, CoalesceableCommand, ProvisionalCommand } from './editor-command';
export { CompositeCommand, isCoalesceable, isProvisionalCommand } from './editor-command';
export type {
  TransformGestureSvgPort,
  TransformGestureUnionRect,
  TransformGestureDocSvgPort,
  GhostUnionSvgPort,
  SelectionTransformApplySvgPort
} from '../history/transform-gesture-svg.port';
export type { ChromeEditorApplySvgPort, SelectionPaintStrokeDashSvgPort } from '../history/chrome-editor-apply-svg.port';
export type { SelectionTransformReadoutSvgPort } from '../history/selection-transform-readout-svg.port';
export type { DocumentArtboardCommandSvgPort, DocumentSettingsSvgPort } from '../history/document-settings-svg.port';
export type { SvgDebugPanelSvgPort, AppRootSvgManipulationPort } from '../history/editor-chrome-svg.port';
export type { GradientFillSnapshotSvgPort, GradientFillEditorSvgPort } from '../history/gradient-fill-editor-svg.port';
export type { LayerReorderGroupSvgPort, LayersPanelSvgPort, ChangeElementIdSvgPort } from '../history/layers-panel-svg.port';
export type { ClipPathSvgPort } from '../history/clip-path-svg.port';
export type { ElementParentSnapshot } from '../services/svg-layer-structure.port';
export type { AlignDistributeSvgPort } from '../history/align-distribute-svg.port';
export type {
  PropertiesPanelTextSvgPort,
  BakePresentationSvgPort,
  BakedFillBefore,
  BakedStrokeBefore,
  PropertiesPanelSvgPort
} from '../history/properties-panel-svg.port';
export type { EditorShapeLifecycleSvgPort, PathDataEditorSvgPort, PathNodeHandleLinkSvgPort } from '../history/editor-shape-lifecycle-svg.port';
export type { DrawingStyleDefaultsWritePort } from '../history/drawing-style-defaults.port';
export * from '../history/commands/editor-command-implementations';
