import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type EditorTool = 'selector' | 'zoom';

@Injectable({
  providedIn: 'root'
})
export class EditorToolService {
  private currentToolSubject = new BehaviorSubject<EditorTool>('selector');
  public currentTool$: Observable<EditorTool> = this.currentToolSubject.asObservable();

  setTool(tool: EditorTool): void {
    this.currentToolSubject.next(tool);
  }

  getCurrentTool(): EditorTool {
    return this.currentToolSubject.value;
  }
}
