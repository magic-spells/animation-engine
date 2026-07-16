import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The ESM build externalizes the @magic-spells deps (consumers install them via
// npm — no duplicate frame-engine for projects already using it). The UMD build
// stays self-contained for script-tag use. Vite applies `external` per build, so
// the two formats are built in separate passes keyed off BUILD_FORMAT.
const format = process.env.BUILD_FORMAT || 'es';

const config = {
  build: {
    lib: {
      entry: resolve(__dirname, 'src/animation-engine.js'),
      name: 'AnimationEngine',
      formats: [format],
      fileName: () => (format === 'es' ? 'animation-engine.esm.js' : 'animation-engine.min.js'),
    },
    outDir: 'dist',
    emptyOutDir: format === 'es',
    esbuild: {
      keepNames: true,
    },
    copyPublicDir: false,
  },
  server: {
    port: 3060,
    open: '/demo/index.html',
  },
  plugins: [
    {
      name: 'copy-types',
      closeBundle() {
        copyFileSync('src/animation-engine.d.ts', 'dist/animation-engine.d.ts');
      },
    },
  ],
};

if (format === 'es') {
  config.build.rollupOptions = {
    external: [
      '@magic-spells/frame-engine',
      '@magic-spells/physics-engine',
      '@magic-spells/event-emitter',
    ],
  };
}

export default config;
