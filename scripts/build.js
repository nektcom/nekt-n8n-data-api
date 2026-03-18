const esbuild = require('esbuild');
const fs = require('fs');

// Ensure dist directories exist
fs.mkdirSync('dist/nodes/Nekt', { recursive: true });
fs.mkdirSync('dist/credentials', { recursive: true });

// Copy SVG icon alongside the bundled node
fs.copyFileSync('src/nodes/Nekt/nekt.svg', 'dist/nodes/Nekt/nekt.svg');

const sharedConfig = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['n8n-workflow'],
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
};

Promise.all([
  esbuild.build({
    ...sharedConfig,
    entryPoints: ['src/nodes/Nekt/NektDataApi.node.ts'],
    outfile: 'dist/nodes/Nekt/NektDataApi.node.js',
  }),
  esbuild.build({
    ...sharedConfig,
    entryPoints: ['src/credentials/NektApi.credentials.ts'],
    outfile: 'dist/credentials/NektApi.credentials.js',
  }),
]).then(() => {
  console.log('Build complete.');
}).catch(() => {
  process.exit(1);
});
