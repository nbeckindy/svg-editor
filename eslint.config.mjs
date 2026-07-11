import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**'],
  },
  {
    files: ['src/app/tools/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/svg-canvas.component', '**/svg-canvas.component.ts'],
              message:
                'Tools must not import SvgCanvasComponent. Use narrow *CanvasToolDeps and ports instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/components/svg-canvas/pen-tool-session/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/svg-manipulation.service', '**/svg-manipulation.service.ts'],
              message:
                'Pen tool orchestrator code must use narrow *SvgPort interfaces instead of SvgManipulationService.',
            },
          ],
        },
      ],
    },
  },
];
