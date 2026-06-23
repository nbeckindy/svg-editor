import { Injectable, signal } from '@angular/core';
import type { GroupStructureChangePayload, GroupStructureChangePort } from './group-structure-change.port';

@Injectable({ providedIn: 'root' })
export class GroupStructureChangeService implements GroupStructureChangePort {
  private readonly revision = signal(0);
  private readonly lastPayload = signal<GroupStructureChangePayload | null>(null);

  readonly changeRevision = this.revision.asReadonly();
  readonly lastChange = this.lastPayload.asReadonly();

  notifyGroupStructureChange(payload: GroupStructureChangePayload): void {
    this.lastPayload.set(payload);
    this.revision.update((n) => n + 1);
  }
}
