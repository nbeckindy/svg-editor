import { Component, computed, inject } from '@angular/core';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { LAYER_LOCK_READ_PORT } from '../../services/manipulation-port-tokens';

@Component({
  selector: 'app-text-panel',
  imports: [],
  templateUrl: './text-panel.component.html',
  styleUrl: './text-panel.component.css'
})
export class TextPanelComponent {
  readonly fontFamilies = [
    'Arial, sans-serif',
    'Helvetica, Arial, sans-serif',
    '"Times New Roman", serif',
    'Georgia, serif',
    '"Courier New", monospace',
    'Verdana, sans-serif'
  ] as const;

  private readonly shapeSelectionService = inject(ShapeSelectionService);
  private readonly drawingDefaults = inject(DrawingStyleDefaultsService);
  private readonly editorTool = inject(EditorToolService);
  private readonly chromeApply = inject(ChromeEditorApplyService);
  private readonly layerLock = inject(LAYER_LOCK_READ_PORT);

  /**
   * True when selected `<text>` nodes include any that are under a lock
   * (typography commands are blocked only for those paths).
   */
  readonly textSelectionTouchesLocked = computed(() => {
    const texts = this.shapeSelectionService.getSelectedShapes().filter((s) => s.type === 'text');
    return texts.length > 0 && texts.some((t) => this.layerLock.isElementOrAncestorLocked(t.id));
  });

  /** Text tool active: typography controls edit placement defaults when nothing is selected. */
  readonly textToolPlacementMode = computed(() => this.editorTool.currentTool() === 'text');

  private textSelection(): ShapeProperties[] {
    return this.shapeSelectionService.getSelectedShapes().filter((s) => s.type === 'text');
  }

  hasTextSelection(): boolean {
    return this.textSelection().length > 0;
  }

  /** Text typography controls: selected `<text>` or defaults while the text tool is active. */
  hasTextTypographyPanel(): boolean {
    return this.hasTextSelection() || this.textToolPlacementMode();
  }

  fontFamilyControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontFamilyValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.fontFamily();
    return 'Arial, sans-serif';
  }

  fontSizeControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontSizeValue();
    if (this.textToolPlacementMode()) return String(this.drawingDefaults.fontSize());
    return '16';
  }

  fontWeightControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontWeightValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.fontWeight();
    return 'normal';
  }

  fontStyleControlValue(): string {
    if (this.hasTextSelection()) return this.selectedFontStyleValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.fontStyle();
    return 'normal';
  }

  textAnchorControlValue(): 'start' | 'middle' | 'end' {
    if (this.hasTextSelection()) return this.selectedTextAnchorValue();
    if (this.textToolPlacementMode()) return this.drawingDefaults.textAnchor();
    return 'start';
  }

  textSelectionMixed(getter: (shape: ShapeProperties) => string | number | undefined): boolean {
    const textShapes = this.textSelection();
    if (textShapes.length <= 1) return false;
    const keys = new Set(textShapes.map((s) => String(getter(s) ?? '')));
    return keys.size > 1;
  }

  textSelectionValue(
    getter: (shape: ShapeProperties) => string | number | undefined,
    fallback: string
  ): string {
    const textShapes = this.textSelection();
    if (textShapes.length === 0) return fallback;
    if (this.textSelectionMixed(getter)) return '';
    const value = getter(textShapes[0]);
    return value == null ? fallback : String(value);
  }

  fontFamiliesMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontFamily);
  }

  fontSizesMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontSize);
  }

  fontWeightsMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontWeight);
  }

  fontStylesMixed(): boolean {
    return this.textSelectionMixed((s) => s.fontStyle);
  }

  textAnchorsMixed(): boolean {
    return this.textSelectionMixed((s) => s.textAnchor);
  }

  selectedFontFamilyValue(): string {
    return this.textSelectionValue((s) => s.fontFamily, 'Arial, sans-serif');
  }

  selectedFontSizeValue(): string {
    return this.textSelectionValue((s) => s.fontSize, '16');
  }

  selectedFontWeightValue(): string {
    return this.textSelectionValue((s) => s.fontWeight, 'normal');
  }

  selectedFontStyleValue(): string {
    return this.textSelectionValue((s) => s.fontStyle, 'normal');
  }

  selectedTextAnchorValue(): 'start' | 'middle' | 'end' {
    const value = this.textSelectionValue((s) => s.textAnchor, 'start');
    return value === 'middle' || value === 'end' ? value : 'start';
  }

  onFontFamilyChange(event: Event): void {
    const fontFamily = (event.target as HTMLSelectElement).value;
    this.chromeApply.applyTextFontFamilyFromChrome(
      fontFamily,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onFontSizeChange(event: Event): void {
    const fontSize = Number.parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(fontSize) || fontSize <= 0) return;
    this.chromeApply.applyTextFontSizeFromChrome(
      fontSize,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onToggleBold(): void {
    this.chromeApply.applyTextToggleBoldFromChrome(
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onToggleItalic(): void {
    this.chromeApply.applyTextToggleItalicFromChrome(
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  onTextAlignChange(textAnchor: 'start' | 'middle' | 'end'): void {
    this.chromeApply.applyTextAnchorFromChrome(
      textAnchor,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  dominantBaselinePresets = [
    { value: 'auto', label: 'Auto' },
    { value: 'middle', label: 'Middle' },
    { value: 'hanging', label: 'Hanging' },
    { value: 'text-before-edge', label: 'Text before edge' }
  ] as const;

  private normalizeDominantBaselineKey(raw: string | undefined): string {
    const t = (raw ?? '').trim().toLowerCase();
    if (!t || t === 'auto') return 'auto';
    if (t === 'middle' || t === 'hanging' || t === 'text-before-edge') return t;
    return t;
  }

  dominantBaselinesMixed(): boolean {
    return this.textSelectionMixed((s) => this.normalizeDominantBaselineKey(s.dominantBaseline));
  }

  dominantBaselineControlValue(): string {
    if (this.hasTextSelection()) {
      if (this.dominantBaselinesMixed()) return '';
      return this.normalizeDominantBaselineKey(this.textSelection()[0]?.dominantBaseline);
    }
    if (this.textToolPlacementMode()) return this.drawingDefaults.dominantBaseline();
    return 'auto';
  }

  onDominantBaselineChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    if (raw === '') return;
    const next =
      raw === 'middle' || raw === 'hanging' || raw === 'text-before-edge' || raw === 'auto'
        ? raw
        : 'auto';
    this.chromeApply.applyTextDominantBaselineFromChrome(
      next,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  letterSpacingsMixed(): boolean {
    return this.textSelectionMixed((s) => s.letterSpacing);
  }

  letterSpacingControlValue(): string {
    if (this.hasTextSelection()) {
      return this.textSelectionValue((s) => s.letterSpacing, '0');
    }
    if (this.textToolPlacementMode()) return String(this.drawingDefaults.letterSpacing());
    return '0';
  }

  onLetterSpacingChange(event: Event): void {
    const letterSpacing = Number.parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(letterSpacing)) return;
    this.chromeApply.applyTextLetterSpacingFromChrome(
      letterSpacing,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  wordSpacingsMixed(): boolean {
    return this.textSelectionMixed((s) => s.wordSpacing);
  }

  wordSpacingControlValue(): string {
    if (this.hasTextSelection()) {
      return this.textSelectionValue((s) => s.wordSpacing, '0');
    }
    if (this.textToolPlacementMode()) return String(this.drawingDefaults.wordSpacing());
    return '0';
  }

  onWordSpacingChange(event: Event): void {
    const wordSpacing = Number.parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(wordSpacing)) return;
    this.chromeApply.applyTextWordSpacingFromChrome(
      wordSpacing,
      this.textSelection(),
      this.textToolPlacementMode()
    );
  }

  private normalizeTextPaintOrderKey(raw: string | undefined): string {
    const t = (raw ?? '').trim().toLowerCase();
    if (!t || t === 'normal') return 'normal';
    if (t === 'stroke fill' || t.startsWith('stroke fill')) return 'stroke fill';
    return t;
  }

  textPaintOrdersMixed(): boolean {
    return this.textSelectionMixed((s) => this.normalizeTextPaintOrderKey(s.paintOrder));
  }

  /** `normal` | `stroke fill` | `''` when mixed / non-canonical paint-order values disagree. */
  selectedTextPaintOrderForSelect(): string {
    const texts = this.textSelection();
    if (texts.length === 0) return 'normal';
    if (this.textPaintOrdersMixed()) return '';
    return this.normalizeTextPaintOrderKey(texts[0].paintOrder);
  }

  onTextPaintOrderChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    if (raw === '') return;
    const next = raw === 'stroke fill' ? 'stroke fill' : undefined;
    this.chromeApply.applyTextPaintOrderFromChrome(this.textSelection(), next);
  }

  textVectorEffectsMixed(): boolean {
    return this.textSelectionMixed((s) => (s.vectorEffect ?? '').toLowerCase());
  }

  /** All selected text shapes use `vector-effect="non-scaling-stroke"`. */
  textNonScalingStrokeOutline(): boolean {
    const texts = this.textSelection();
    if (texts.length === 0) return false;
    return texts.every((s) => (s.vectorEffect ?? '').toLowerCase() === 'non-scaling-stroke');
  }

  onTextNonScalingStrokeChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = checked ? 'non-scaling-stroke' : undefined;
    this.chromeApply.applyTextVectorEffectFromChrome(this.textSelection(), next);
  }
}
