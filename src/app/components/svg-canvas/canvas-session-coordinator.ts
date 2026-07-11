/**
 * Owns pen, path-node edit, and inline-text session lifecycle plus pointer-stack assembly so
 * {@link SvgCanvasComponent} constructor stays view-ref wiring.
 */
import {
  PathNodeEditSession,
  type PathNodeEditSessionPorts
} from './path-node-edit-session/path-node-edit-session';
import {
  InlineTextEditSession,
  type InlineTextEditSessionPorts
} from './inline-text-edit-session/inline-text-edit-session';
import {
  createSvgCanvasPointerStack,
  type CreateSvgCanvasPointerStackArgs,
  type SvgCanvasPointerStack
} from './svg-canvas-pointer-stack.factory';
import type { PenToolSession } from './pen-tool-session/pen-tool-session';

export interface CanvasSessionBundle extends SvgCanvasPointerStack {
  readonly pathNodeEditSession: PathNodeEditSession;
  readonly inlineTextEditSession: InlineTextEditSession;
}

export interface CreateCanvasSessionBundleArgs {
  createPathNodeEditSessionPorts: () => PathNodeEditSessionPorts;
  createInlineTextEditSessionPorts: () => InlineTextEditSessionPorts;
  pointerStack: CreateSvgCanvasPointerStackArgs;
}

export function createCanvasSessionBundle(args: CreateCanvasSessionBundleArgs): CanvasSessionBundle {
  const pathNodeEditSession = new PathNodeEditSession(args.createPathNodeEditSessionPorts());
  const inlineTextEditSession = new InlineTextEditSession(() => args.createInlineTextEditSessionPorts());
  const pointerStack = createSvgCanvasPointerStack(args.pointerStack);

  return {
    ...pointerStack,
    pathNodeEditSession,
    inlineTextEditSession
  };
}

export type { PenToolSession };
