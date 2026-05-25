/** Barrel: History command contract lives in `editor-command`; implementations in `history/commands`. */
export type { EditorCommand, CoalesceableCommand } from './editor-command';
export { CompositeCommand, isCoalesceable } from './editor-command';
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
export type { LayerReorderGroupSvgPort, LayersPanelSvgPort } from '../history/layers-panel-svg.port';
export type { AlignDistributeSvgPort } from '../history/align-distribute-svg.port';
export type {
  PropertiesPanelTextSvgPort,
  BakePresentationSvgPort,
  BakedFillBefore,
  BakedStrokeBefore,
  PropertiesPanelSvgPort
} from '../history/properties-panel-svg.port';
export type { EditorShapeLifecycleSvgPort, PathDataEditorSvgPort } from '../history/editor-shape-lifecycle-svg.port';
export * from '../history/commands/editor-command-implementations';
