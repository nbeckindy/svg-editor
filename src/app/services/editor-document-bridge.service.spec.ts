import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_DOCUMENT_SVG } from '../models/default-document';
import { EditorDocumentBridgeService } from './editor-document-bridge.service';

describe('EditorDocumentBridgeService', () => {
  let service: EditorDocumentBridgeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorDocumentBridgeService);
  });

  it('replaceDocument returns false when no handlers are registered', () => {
    expect(service.replaceDocument('<svg></svg>')).toBe(false);
  });

  it('resetDocument returns false when no handlers are registered', () => {
    expect(service.resetDocument()).toBe(false);
  });

  it('replaceDocument delegates to registered handlers', () => {
    const replaceDocument = vi.fn().mockReturnValue(true);
    service.register({ replaceDocument });

    expect(service.replaceDocument('<svg><rect/></svg>')).toBe(true);
    expect(replaceDocument).toHaveBeenCalledWith('<svg><rect/></svg>');
  });

  it('resetDocument delegates replaceDocument with DEFAULT_DOCUMENT_SVG', () => {
    const replaceDocument = vi.fn().mockReturnValue(true);
    service.register({ replaceDocument });

    expect(service.resetDocument()).toBe(true);
    expect(replaceDocument).toHaveBeenCalledWith(DEFAULT_DOCUMENT_SVG);
  });

  it('register(null) clears handlers', () => {
    const replaceDocument = vi.fn().mockReturnValue(true);
    service.register({ replaceDocument });
    service.register(null);

    expect(service.replaceDocument('<svg></svg>')).toBe(false);
  });
});
