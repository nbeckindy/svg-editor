# Setup Commands - Angular SVG Editor

## Initial Project Setup

### 1. Create Angular Project

```bash
# Navigate to the svg-editor directory
cd ~/Documents/svg-editor

# Create the Angular application
# This uses: --routing (enables routing), --style=scss (SCSS for styling), --standalone (standalone components)
ng new svg-editor-app --routing --style=scss --standalone

# When prompted, answer:
# - Would you like to add Angular routing? Yes
# - Which stylesheet format would you like to use? SCSS

# Navigate into the project
cd svg-editor-app
```

### 2. Install Dependencies

```bash
# Install SVG.js for SVG manipulation
npm install @svgdotjs/svg.js

# Install Vitest and Angular testing tools
npm install -D vitest @vitest/ui @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom @types/node

# Verify installation
npm list @svgdotjs/svg.js vitest
```

### 3. Configure Vitest

Create `vitest.config.ts` in the project root:

```bash
cat > vitest.config.ts << 'EOF'
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
EOF
```

Create `src/test-setup.ts`:

```bash
cat > src/test-setup.ts << 'EOF'
import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);
EOF
```

### 4. Update package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "watch": "ng build --watch --configuration development",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

### 5. Create Project Structure

```bash
# Create directories
mkdir -p src/app/components/{file-upload,svg-canvas,properties-panel,color-picker}
mkdir -p src/app/services
mkdir -p src/app/models
mkdir -p src/assets/sample-svgs

# Create model files
touch src/app/models/shape-properties.interface.ts
touch src/app/models/svg-file.interface.ts

# Create service files
touch src/app/services/svg.service.ts
touch src/app/services/svg.service.spec.ts
touch src/app/services/svg-manipulation.service.ts
touch src/app/services/svg-manipulation.service.spec.ts
touch src/app/services/shape-selection.service.ts
touch src/app/services/shape-selection.service.spec.ts
```

### 6. Verify Setup

```bash
# Start development server
npm start

# In another terminal, run tests
npm run test

# Open test UI
npm run test:ui
```

## Quick Reference Commands

### Development
```bash
# Start dev server (http://localhost:4200)
npm start

# Build for production
npm run build

# Serve production build
npx http-server dist/svg-editor-app/browser
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test src/app/services/svg.service.spec.ts
```

### Generate Components/Services
```bash
# Generate a new component (if needed)
ng generate component components/new-component --standalone

# Generate a new service
ng generate service services/new-service

# Generate an interface
ng generate interface models/new-interface
```

## Troubleshooting Setup

### Issue: Vitest not found
```bash
# Reinstall dev dependencies
npm install -D vitest @vitest/ui @analogjs/vite-plugin-angular @analogjs/vitest-angular
```

### Issue: Angular CLI not found
```bash
# Install Angular CLI globally
npm install -g @angular/cli

# Or use npx
npx @angular/cli new svg-editor-app --routing --style=scss --standalone
```

### Issue: Port 4200 already in use
```bash
# Use a different port
ng serve --port 4300
```

### Issue: TypeScript errors
```bash
# Check TypeScript version
npm list typescript

# Should be ~5.4.0 for Angular 18
```

## Next Steps After Setup

1. **Verify the app runs**: `npm start` and visit http://localhost:4200
2. **Verify tests work**: `npm test`
3. **Start implementing services** (see IMPLEMENTATION_GUIDE.md)
4. **Follow the todo list** in the planning documents

## Sample SVG Files

Create some test SVG files in `src/assets/sample-svgs/`:

**simple-circle.svg**:
```xml
<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <circle id="c1" cx="50" cy="50" r="40" fill="#ff0000"/>
</svg>
```

**multiple-shapes.svg**:
```xml
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect id="r1" x="10" y="10" width="80" height="80" fill="#00ff00"/>
  <circle id="c1" cx="150" cy="150" r="30" fill="#0000ff"/>
  <path id="p1" d="M 50 150 L 100 150 L 75 100 Z" fill="#ffff00"/>
</svg>
```

## Useful Resources

- Angular CLI Documentation: https://angular.dev/cli
- Vitest Documentation: https://vitest.dev/
- SVG.js Documentation: https://svgjs.dev/
- Project Planning Docs: See ARCHITECTURE.md, IMPLEMENTATION_GUIDE.md, TESTING_STRATEGY.md

---

**Ready to build! 🚀**
