#!/usr/bin/env node

/**
 * Kohlrabi Docs CLI
 * Serves and builds API documentation from OpenAPI specs
 */

import { createServer, build } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, copyFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package lib directory (where our core files live)
const libDir = resolve(__dirname, '../lib');

// User's current working directory
const userDir = process.cwd();

// Check for swagger.json
function findSwaggerFile() {
  const locations = [
    join(userDir, 'public', 'swagger.json'),
    join(userDir, 'swagger.json'),
    join(userDir, 'public', 'openapi.json'),
    join(userDir, 'openapi.json'),
  ];
  
  for (const loc of locations) {
    if (existsSync(loc)) {
      return loc;
    }
  }
  return null;
}

// Vite configuration
function createViteConfig(command) {
  const swaggerPath = findSwaggerFile();
  
  if (!swaggerPath) {
    console.error('\x1b[31m✖ No swagger.json or openapi.json found!\x1b[0m');
    console.error('\nPlace your OpenAPI spec in one of these locations:');
    console.error('  • ./public/swagger.json (recommended)');
    console.error('  • ./swagger.json');
    console.error('  • ./public/openapi.json');
    console.error('  • ./openapi.json');
    process.exit(1);
  }
  
  console.log(`\x1b[32m✓\x1b[0m Using spec: ${swaggerPath}`);
  
  // Determine public dir based on swagger location
  const publicDir = swaggerPath.includes('/public/') 
    ? join(userDir, 'public')
    : userDir;
  
  return {
    root: libDir,
    publicDir: publicDir,
    server: {
      open: true,
    },
    build: {
      outDir: join(userDir, 'dist'),
      emptyOutDir: true,
    },
    // Copy swagger to dist as swagger.json regardless of original name
    plugins: command === 'build' ? [{
      name: 'copy-swagger',
      closeBundle() {
        const destDir = join(userDir, 'dist');
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        copyFileSync(swaggerPath, join(destDir, 'swagger.json'));
        console.log('\x1b[32m✓\x1b[0m Copied swagger.json to dist/');
      }
    }] : [],
  };
}

// Commands
async function serve() {
  console.log('\n\x1b[36m🚀 Starting API Docs development server...\x1b[0m\n');
  
  const config = createViteConfig('serve');
  const server = await createServer(config);
  await server.listen();
  
  server.printUrls();
  console.log('\n\x1b[2mPress Ctrl+C to stop\x1b[0m\n');
}

async function buildDocs() {
  console.log('\n\x1b[36m📦 Building API Docs for production...\x1b[0m\n');
  
  const config = createViteConfig('build');
  await build(config);
  
  console.log('\n\x1b[32m✓ Build complete!\x1b[0m Output: ./dist/\n');
}

function showHelp() {
  console.log(`
\x1b[Kohlrabi\x1b[0m - Beautiful API documentation from OpenAPI specs

\x1b[33mUsage:\x1b[0m
  npx kohlrabi <command>

\x1b[33mCommands:\x1b[0m
  serve     Start development server with hot reload
  build     Build production-ready static files
  help      Show this help message

\x1b[33mExamples:\x1b[0m
  npx kohlrabi serve
  npx kohlrabi build

\x1b[33mSetup:\x1b[0m
  1. Place your swagger.json in ./public/swagger.json
  2. Run 'npx kohlrabi serve' to preview
  3. Run 'npx kohlrabi build' to generate static files
`);
}

// Main
const command = process.argv[2];

switch (command) {
  case 'serve':
  case 'dev':
    serve().catch(console.error);
    break;
  case 'build':
    buildDocs().catch(console.error);
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`);
    showHelp();
    process.exit(1);
}

