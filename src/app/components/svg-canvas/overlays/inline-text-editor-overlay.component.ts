import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { expandInlineTextEditorSizePx } from '../../../utils/measure-preformatted-text';

@Component({
  selector: 'app-inline-text-editor-overlay',
  templateUrl: './inline-text-editor-overlay.component.html',
  styleUrl: './inline-text-editor-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InlineTextEditorOverlayComponent implements AfterViewInit {
  readonly panX = input.required<number>();
  readonly panY = input.required<number>();
  readonly overlayRect = input.required<{ x: number; y: number; width: number; height: number }>();
  readonly value = input.required<string>();
  readonly hint = input.required<string>();
  readonly typographyStyle = input.required<string>();
  /** Minimum width from the SVG text bbox (overlay grows beyond this while typing). */
  readonly widthPx = input.required<number>();
  /** Minimum height from the SVG text bbox (overlay grows beyond this while typing). */
  readonly heightPx = input.required<number>();
  readonly valueChange = output<string>();
  readonly ready = output<InlineTextEditorOverlayComponent>();

  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('inlineTextEditor');

  /** Content-fitted size; at least the bbox mins from {@link widthPx} / {@link heightPx}. */
  readonly displayWidthPx = signal(24);
  readonly displayHeightPx = signal(18);

  constructor() {
    effect(() => {
      const text = this.value();
      const font = this.typographyStyle();
      const minW = this.widthPx();
      const minH = this.heightPx();
      queueMicrotask(() => this.applyAutosize(text, font, minW, minH));
    });
  }

  ngAfterViewInit(): void {
    this.applyAutosize(this.value(), this.typographyStyle(), this.widthPx(), this.heightPx());
    this.ready.emit(this);
  }

  textareaElement(): HTMLTextAreaElement | null {
    return this.textareaRef()?.nativeElement ?? null;
  }

  focusEditor(): void {
    const input = this.textareaRef()?.nativeElement;
    if (!input) return;
    input.focus();
    input.select();
  }

  onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    const next = target?.value ?? '';
    this.applyAutosize(next, this.typographyStyle(), this.widthPx(), this.heightPx());
    this.valueChange.emit(next);
  }

  private applyAutosize(text: string, font: string, minW: number, minH: number): void {
    const size = expandInlineTextEditorSizePx(text, font, minW, minH, {
      paddingXPx: 2,
      paddingYPx: 1,
      gutterPx: 4
    });
    this.displayWidthPx.set(size.width);
    this.displayHeightPx.set(size.height);
  }
}
