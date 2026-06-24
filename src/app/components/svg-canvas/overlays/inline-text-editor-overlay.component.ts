import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild
} from '@angular/core';

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
  readonly widthPx = input.required<number>();
  readonly heightPx = input.required<number>();
  readonly valueChange = output<string>();
  readonly ready = output<InlineTextEditorOverlayComponent>();

  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('inlineTextEditor');

  ngAfterViewInit(): void {
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
    this.valueChange.emit(target?.value ?? '');
  }
}
