/** Barrel: History command contract lives in `editor-command`; implementations in `history/commands`. */
export type { EditorCommand, CoalesceableCommand } from './editor-command';
export { CompositeCommand, isCoalesceable } from './editor-command';
export * from '../history/commands/editor-command-implementations';
