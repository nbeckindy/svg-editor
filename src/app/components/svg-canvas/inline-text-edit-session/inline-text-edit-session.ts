import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { TextContentCommand } from '../../../models/editor-commands';
import type { EditorShapeLifecycleSvgPort } from '../../../history/editor-shape-lifecycle-svg.port';
import {
  inlineTextEditorFontShorthand,
  resolveInlineTextEditorTypography
} from '../../../utils/svg-inline-text-typography';
import type { InlineTextEditState } from './inline-text-edit-session-types';
import type { InlineTextEditSessionPorts } from './inline-text-edit-session-ports';

export type { InlineTextEditState } from './inline-text-edit-session-types';
export type { InlineTextEditSessionPorts } from './inline-text-edit-session-ports';

/**
 * Orchestrates floating inline editing of canvas `<text>` (overlay positioning, draft, commit).
 * Document effects cross {@link InlineTextEditSessionPorts} so the **Canvas adapter** stays a
 * DOM/view adapter and this module stays unit-testable without full TestBed.
 */
export class InlineTextEditSession {
  private state: InlineTextEditState | null = null;
  private draft = '';

  /** Tooltip for the floating SVG text editor (a11y / TER polish). */
  readonly inlineTextEditorHint =
    'Edits canvas text. Press Escape or click outside the editor to apply changes.';

  constructor(private readonly getPorts: () => InlineTextEditSessionPorts) {}

  get isActive(): boolean {
    return this.state !== null;
  }

  get value(): string {
    return this.draft;
  }

  get overlayRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.state) return null;
    const ports = this.getPorts();
    const bbox =
      ports.svgManipulation.getShapeBBox(this.state.textId) ??
      ports.svgManipulation.getShapeBBox(this.state.textId, { preferScreenBounds: false });
    if (!bbox) return null;
    return ports.svgBboxToOverlayPixels(bbox);
  }

  overlayWidthPx(rect: { width: number }): number {
    return Math.max(24, rect.width);
  }

  overlayHeightPx(rect: { height: number }): number {
    return Math.max(18, rect.height);
  }

  /**
   * `font` shorthand for the inline HTML editor so it tracks the target `<text>` (see
   * `resolveInlineTextEditorTypography` for SVG vs DOM font limitations).
   */
  typographyStyle(): string {
    if (!this.state) {
      return inlineTextEditorFontShorthand({
        fontSizePx: 14,
        fontFamily: 'sans-serif',
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.2
      });
    }
    const ports = this.getPorts();
    const svg = ports.svgManipulation.getSVGInstance();
    const shape = svg?.findOne(`#${this.state.textId}`) as SvgJsElement | undefined;
    const node = shape?.node ?? null;
    const props = shape ? ports.svgManipulation.getShapeProperties(shape) : null;
    const t = resolveInlineTextEditorTypography(node, props, (b) => ports.svgBboxToOverlayPixels(b));
    return inlineTextEditorFontShorthand(t);
  }

  enterInlineTextEditMode(textId: string): void {
    const ports = this.getPorts();
    const selected = ports.shapeSelection.getSelectedShapes();
    if (selected.length !== 1) return;
    const text = ports.svgManipulation.getTextContent(textId);
    if (text === null) return;
    this.state = {
      textId,
      originalText: text
    };
    this.draft = text;
    ports.markForCheck();
    ports.focusInlineTextEditor();
  }

  /** Enter inline edit after text-tool placement when the new shape is a `<text>` element. */
  tryEnterAfterTextCreate(shapeId: string): void {
    const svgInstance = this.getPorts().svgManipulation.getSVGInstance();
    const shape = svgInstance?.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    const node = shape?.node;
    if (!node || node.tagName.toLowerCase() !== 'text') return;
    this.enterInlineTextEditMode(shapeId);
  }

  onInput(value: string): void {
    this.draft = value;
  }

  commitIfActive(): boolean {
    if (!this.state) return false;
    const ports = this.getPorts();
    const { textId, originalText } = this.state;
    const nextText = this.draft;
    if (nextText !== originalText) {
      const cmd = new TextContentCommand(
        ports.svgManipulation as unknown as EditorShapeLifecycleSvgPort,
        textId,
        originalText,
        nextText
      );
      ports.editorHistory.pushAndExecute(cmd);
    }
    this.state = null;
    this.draft = '';
    ports.markForCheck();
    return true;
  }

  isInlineTextEditTarget(target: Element | null): boolean {
    if (!target) return false;
    const editor = this.getPorts().getInlineTextEditorElement();
    return !!editor && (target === editor || editor.contains(target));
  }
}
