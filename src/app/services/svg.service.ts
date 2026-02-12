import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SvgService {
  private currentSVGContent: string = '';

  /**
   * Load SVG file and return its content as string
   */
  loadSVG(file: File): Observable<string> {
    return from(this.readFileAsText(file)).pipe(
      map(content => {
        if (this.validateSVG(content)) {
          this.currentSVGContent = content;
          return content;
        }
        throw new Error('Invalid SVG file');
      })
    );
  }

  /**
   * Validate if content is valid SVG
   */
  validateSVG(content: string): boolean {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    
    if (parserError) {
      return false;
    }
    
    const svgElement = doc.querySelector('svg');
    return svgElement !== null;
  }

  /**
   * Get current SVG content
   */
  getCurrentSVG(): string {
    return this.currentSVGContent;
  }

  /**
   * Read file as text
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
}
