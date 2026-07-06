import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { LAYERS_PANEL_SVG_PORT } from '../../services/manipulation-port-tokens';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';

export type DropZone = 'before' | 'after' | 'intoGroup' | 'none';

export type LayerDropAction =
  | { kind: 'reorderBeforeSibling'; referenceNextSiblingId: string | null }
  | { kind: 'addToGroup'; targetGroupId: string }
  | {
      kind: 'reparentToParent';
      targetParentId: string | null;
      referenceNextSiblingId: string | null;
    };

export interface LayerDropIntent {
  valid: boolean;
  zone: DropZone;
  targetId?: string;
  action?: LayerDropAction;
}

export interface LayerDropPreviewState {
  pendingIntent: LayerDropIntent | null;
  dropPreview: { targetId: string; zone: DropZone; valid: boolean } | null;
}

/** Drag-and-drop intent resolution and chrome apply for the layers panel. */
@Injectable({ providedIn: 'root' })
export class LayersPanelDndService {
  private readonly svg = inject(LAYERS_PANEL_SVG_PORT);
  private readonly chromeApply = inject(ChromeEditorApplyService);

  isStrictAncestor(ancestorId: string, descendantId: string): boolean {
    const svg = this.svg.getSVGInstance();
    if (!svg) return false;
    const anc = svg.findOne(`#${ancestorId}`)?.node as Element | undefined;
    const desc = svg.findOne(`#${descendantId}`)?.node as Element | undefined;
    if (!anc || !desc) return false;
    return anc !== desc && anc.contains(desc);
  }

  /** Hit-test layer rows by pointer position (avoids CDK drag preview blocking elementsFromPoint). */
  findLayerRowFromPointer(
    pointer: { x: number; y: number },
    draggedId?: string
  ): HTMLElement | null {
    if (typeof document === 'undefined') return null;

    const list = document.querySelector('[data-testid="layers-list"]');
    if (!list) return null;

    for (const row of list.querySelectorAll('[data-testid^="layer-row-"]')) {
      const el = row as HTMLElement;
      if (el.classList.contains('cdk-drag-preview')) continue;
      if (el.classList.contains('cdk-drag-placeholder')) continue;
      const targetId = el.getAttribute('data-testid')?.replace('layer-row-', '');
      if (draggedId && targetId === draggedId) continue;
      const rect = el.getBoundingClientRect();
      if (
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom &&
        pointer.x >= rect.left &&
        pointer.x <= rect.right
      ) {
        return el;
      }
    }
    return null;
  }

  resolveDropIntentFromPointer(
    draggedId: string,
    pointer: { x: number; y: number },
    targetIsGroup: (targetId: string) => boolean
  ): LayerDropIntent {
    const row = this.findLayerRowFromPointer(pointer, draggedId);
    if (!row) return { valid: false, zone: 'none' };
    const targetId = row.getAttribute('data-testid')?.replace('layer-row-', '');
    if (!targetId) return { valid: false, zone: 'none' };
    const rect = row.getBoundingClientRect();
    const relY = rect.height > 0 ? (pointer.y - rect.top) / rect.height : 0.5;
    const intent = this.resolveLayerDropIntent(draggedId, targetId, relY, targetIsGroup(targetId));
    if (!intent.valid) return intent;
    return { ...intent, targetId };
  }

  resolveLayerDropIntent(
    draggedId: string,
    targetId: string,
    relY: number,
    targetIsGroup: boolean
  ): LayerDropIntent {
    if (!draggedId || !targetId || draggedId === targetId) {
      return { valid: false, zone: 'none' };
    }
    if (
      this.svg.isElementOrAncestorLocked(draggedId) ||
      this.svg.isElementOrAncestorLocked(targetId)
    ) {
      return { valid: false, zone: 'none' };
    }

    const topEdge = relY < 0.25;
    const bottomEdge = relY > 0.75;
    const middleZone = !topEdge && !bottomEdge;
    const frontHalf = relY < 0.5;

    const svg = this.svg.getSVGInstance();
    if (!svg) return { valid: false, zone: 'none' };
    const draggedNode = svg.findOne(`#${draggedId}`)?.node as Element | undefined;
    const targetNode = svg.findOne(`#${targetId}`)?.node as Element | undefined;
    if (!draggedNode || !targetNode) return { valid: false, zone: 'none' };

    if (targetIsGroup && middleZone) {
      if (this.isStrictAncestor(draggedId, targetId)) {
        return { valid: false, zone: 'none' };
      }
      if (this.svg.isGroupClipMaskCarrier(targetId)) {
        return { valid: false, zone: 'none' };
      }
      return {
        valid: true,
        zone: 'intoGroup',
        action: { kind: 'addToGroup', targetGroupId: targetId }
      };
    }

    const zone: DropZone = topEdge ? 'before' : bottomEdge ? 'after' : frontHalf ? 'before' : 'after';

    const sameParent = draggedNode.parentElement === targetNode.parentElement;
    if (sameParent) {
      const res = this.resolveSameParentDropReferenceSibling(draggedId, targetId, frontHalf);
      if (!res.ok) return { valid: false, zone: 'none' };
      return {
        valid: true,
        zone,
        action: { kind: 'reorderBeforeSibling', referenceNextSiblingId: res.ref }
      };
    }

    const cross = this.resolveCrossParentDrop(
      draggedId,
      targetId,
      targetIsGroup,
      topEdge,
      bottomEdge,
      frontHalf
    );
    if (!cross.ok) return { valid: false, zone: 'none' };
    return {
      valid: true,
      zone,
      action: cross.action
    };
  }

  computeDropPreview(
    draggedId: string,
    pointer: { x: number; y: number },
    targetIsGroup: (targetId: string) => boolean
  ): LayerDropPreviewState {
    const intent = this.resolveDropIntentFromPointer(draggedId, pointer, targetIsGroup);
    if (!intent.valid || !intent.targetId) {
      return { pendingIntent: null, dropPreview: null };
    }
    return {
      pendingIntent: intent,
      dropPreview: { targetId: intent.targetId, zone: intent.zone, valid: true }
    };
  }

  executeDropAction(draggedId: string, action: LayerDropAction): void {
    switch (action.kind) {
      case 'reorderBeforeSibling':
        this.chromeApply.moveLayerBeforeSibling(draggedId, action.referenceNextSiblingId);
        break;
      case 'addToGroup':
        this.chromeApply.reparentLayerDrag([draggedId], {
          kind: 'addToGroup',
          targetGroupId: action.targetGroupId
        });
        break;
      case 'reparentToParent':
        this.chromeApply.reparentLayerDrag([draggedId], action);
        break;
    }
  }

  private resolveSameParentDropReferenceSibling(
    draggedId: string,
    targetId: string,
    frontHalf: boolean
  ): { ok: true; ref: string | null } | { ok: false } {
    const svg = this.svg.getSVGInstance();
    if (!svg) return { ok: false };
    const d = svg.findOne(`#${draggedId}`) as SvgJsElement | undefined;
    const t = svg.findOne(`#${targetId}`) as SvgJsElement | undefined;
    if (!d?.node || !t?.node) return { ok: false };
    const dn = d.node as Element;
    const tn = t.node as Element;
    if (dn.parentElement !== tn.parentElement) return { ok: false };

    if (frontHalf) {
      let s: Element | null = tn.nextElementSibling;
      while (s && (!s.id || s.id === draggedId)) {
        s = s.nextElementSibling;
      }
      const ref: string | null = s?.id ?? null;
      return { ok: true, ref };
    }
    return { ok: true, ref: targetId };
  }

  private resolveCrossParentDrop(
    draggedId: string,
    targetId: string,
    targetIsGroup: boolean,
    topEdge: boolean,
    bottomEdge: boolean,
    frontHalf: boolean
  ):
    | {
        ok: true;
        action: {
          kind: 'reparentToParent';
          targetParentId: string | null;
          referenceNextSiblingId: string | null;
        };
      }
    | { ok: false } {
    const svg = this.svg.getSVGInstance();
    if (!svg) return { ok: false };
    const draggedNode = svg.findOne(`#${draggedId}`)?.node as Element | undefined;
    const targetNode = svg.findOne(`#${targetId}`)?.node as Element | undefined;
    if (!draggedNode || !targetNode) return { ok: false };

    if (draggedId === targetId || this.isStrictAncestor(draggedId, targetId)) return { ok: false };
    if (targetIsGroup && this.svg.isGroupClipMaskCarrier(targetId)) return { ok: false };

    const targetParentId = this.getElementParentId(targetNode);

    if (targetIsGroup && (topEdge || bottomEdge)) {
      if (topEdge) {
        return {
          ok: true,
          action: {
            kind: 'reparentToParent',
            targetParentId,
            referenceNextSiblingId: targetId
          }
        };
      }
      let next: Element | null = targetNode.nextElementSibling;
      while (next && (!next.id || next.id === draggedId)) {
        next = next.nextElementSibling;
      }
      return {
        ok: true,
        action: {
          kind: 'reparentToParent',
          targetParentId,
          referenceNextSiblingId: next?.id ?? null
        }
      };
    }

    if (frontHalf) {
      return {
        ok: true,
        action: {
          kind: 'reparentToParent',
          targetParentId,
          referenceNextSiblingId: targetId
        }
      };
    }

    let next: Element | null = targetNode.nextElementSibling;
    while (next && (!next.id || next.id === draggedId)) {
      next = next.nextElementSibling;
    }
    return {
      ok: true,
      action: {
        kind: 'reparentToParent',
        targetParentId,
        referenceNextSiblingId: next?.id ?? null
      }
    };
  }

  private getContentRoot(): Element | null {
    return (
      (this.svg.getSVGInstance()?.findOne('[data-editor-content-group]')?.node as Element | null) ??
      null
    );
  }

  private getElementParentId(node: Element): string | null {
    const contentRoot = this.getContentRoot();
    const parent = node.parentElement;
    if (!parent || parent === contentRoot) return null;
    return parent.id || null;
  }
}
