export interface GroupStructureChangePayload {
  movedElementIds: string[];
  targetGroupId?: string | null;
}

/** Notifies listeners when layer panel group membership changes (canvas drill-in sync). */
export interface GroupStructureChangePort {
  readonly changeRevision: import('@angular/core').Signal<number>;
  readonly lastChange: import('@angular/core').Signal<GroupStructureChangePayload | null>;
  notifyGroupStructureChange(payload: GroupStructureChangePayload): void;
}
