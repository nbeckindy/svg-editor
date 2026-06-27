import { afterNextRender, Injector } from '@angular/core';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import { take } from 'rxjs';

export interface OpenEditorContextMenuAtPointerArgs {
  trigger: MatMenuTrigger;
  triggerEl: HTMLElement;
  menu: MatMenu;
  event: MouseEvent;
  injector: Injector;
  /** CSS class on the menu panel (without `.mat-mdc-menu-panel`). Defaults to `editor-context-menu-panel`. */
  panelClass?: string;
}

/** Opens a Material menu at the pointer and resets spurious keyboard focus on the first item. */
export function openEditorContextMenuAtPointer(args: OpenEditorContextMenuAtPointerArgs): void {
  const { trigger, triggerEl, menu, event, injector } = args;
  const panelClass = args.panelClass ?? 'editor-context-menu-panel';

  triggerEl.style.position = 'fixed';
  triggerEl.style.left = `${event.clientX}px`;
  triggerEl.style.top = `${event.clientY}px`;
  trigger.openMenu();
  trigger.menuOpened.pipe(take(1)).subscribe(() => {
    afterNextRender(
      () => {
        menu.resetActiveItem();
        const panel = document.querySelector(
          `.${panelClass}.mat-mdc-menu-panel`
        ) as HTMLElement | null;
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.classList.contains('mat-mdc-menu-item')) {
          active.blur();
        }
        panel?.focus({ preventScroll: true });
      },
      { injector }
    );
  });
}
