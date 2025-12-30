#!/usr/bin/env node

/**
 * Kohlrabi Docs CLI
 * Serves and builds API documentation from OpenAPI specs
 */

import { createServer, build } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve, join, isAbsolute } from 'path';
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import SwaggerParser from '@apidevtools/swagger-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package lib directory (where our core files live)
const libDir = resolve(__dirname, '../lib');

// User's current working directory
const userDir = process.cwd();

// Parse CLI arguments for --spec and --theme flags
function parseArgs(args) {
  const result = { spec: null, theme: 'dark', command: null };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--spec' || arg === '-s') {
      result.spec = args[i + 1];
      i++; // Skip next arg
    } else if (arg.startsWith('--spec=')) {
      result.spec = arg.split('=')[1];
    } else if (arg.startsWith('-s=')) {
      result.spec = arg.split('=')[1];
    } else if (arg === '--theme' || arg === '-t') {
      result.theme = args[i + 1];
      i++; // Skip next arg
    } else if (arg.startsWith('--theme=')) {
      result.theme = arg.split('=')[1];
    } else if (arg.startsWith('-t=')) {
      result.theme = arg.split('=')[1];
    } else if (!arg.startsWith('-') && !result.command) {
      result.command = arg;
    }
  }
  
  // Validate theme
  if (!['dark', 'light'].includes(result.theme)) {
    console.error(`\x1b[31m✖ Invalid theme: ${result.theme}\x1b[0m`);
    console.error('Available themes: dark, light');
    process.exit(1);
  }
  
  return result;
}

// Check for swagger/openapi files (JSON or YAML)
function findSwaggerFile(specPath = null) {
  // If explicit path provided, use it
  if (specPath) {
    const resolvedPath = isAbsolute(specPath) ? specPath : join(userDir, specPath);
    if (existsSync(resolvedPath)) {
      return resolvedPath;
    }
    console.error(`\x1b[31m✖ Spec file not found: ${resolvedPath}\x1b[0m`);
    process.exit(1);
  }
  
  // Otherwise, search common locations
  const locations = [
    // JSON files
    join(userDir, 'public', 'swagger.json'),
    join(userDir, 'swagger.json'),
    join(userDir, 'public', 'openapi.json'),
    join(userDir, 'openapi.json'),
    // YAML files
    join(userDir, 'public', 'swagger.yaml'),
    join(userDir, 'swagger.yaml'),
    join(userDir, 'public', 'swagger.yml'),
    join(userDir, 'swagger.yml'),
    join(userDir, 'public', 'openapi.yaml'),
    join(userDir, 'openapi.yaml'),
    join(userDir, 'public', 'openapi.yml'),
    join(userDir, 'openapi.yml'),
  ];
  
  for (const loc of locations) {
    if (existsSync(loc)) {
      return loc;
    }
  }
  return null;
}

// Bundle and dereference the OpenAPI spec (resolves all $refs including external files)
async function bundleSpec(specPath) {
  try {
    console.log(`\x1b[33m→\x1b[0m Bundling spec and resolving \$refs...`);
    
    // Use swagger-parser to dereference all $refs (including external file refs)
    const bundled = await SwaggerParser.bundle(specPath);
    
    // Write bundled spec to .kohlrabi/ for serving (named swagger.json for consistency)
    const bundledPath = join(userDir, '.kohlrabi', 'swagger.json');
    const bundledDir = dirname(bundledPath);
    
    if (!existsSync(bundledDir)) {
      mkdirSync(bundledDir, { recursive: true });
    }
    
    writeFileSync(bundledPath, JSON.stringify(bundled, null, 2));
    console.log(`\x1b[32m✓\x1b[0m Bundled spec with all \$refs resolved`);
    
    return bundledPath;
  } catch (error) {
    console.error(`\x1b[31m✖ Failed to bundle spec: ${error.message}\x1b[0m`);
    console.error('\nThis often happens when external $refs cannot be resolved.');
    console.error('Make sure all referenced files exist and paths are correct.\n');
    process.exit(1);
  }
}

// Vite configuration
async function createViteConfig(command, specArg = null, theme = 'dark') {
  const swaggerPath = findSwaggerFile(specArg);
  
  if (!swaggerPath) {
    console.error('\x1b[31m✖ No swagger.json/openapi.json or swagger.yaml/openapi.yaml found!\x1b[0m');
    console.error('\nPlace your OpenAPI spec in one of these locations:');
    console.error('  • ./public/swagger.json (recommended)');
    console.error('  • ./swagger.json');
    console.error('  • ./public/openapi.json');
    console.error('  • ./openapi.json');
    console.error('  • ./public/swagger.yaml');
    console.error('  • ./swagger.yaml');
    console.error('  • ./public/openapi.yaml');
    console.error('  • ./openapi.yaml');
    console.error('\nOr specify a custom path with: kohlrabi serve --spec ./path/to/your-spec.yaml');
    process.exit(1);
  }
  
  console.log(`\x1b[32m✓\x1b[0m Using spec: ${swaggerPath}`);
  console.log(`\x1b[32m✓\x1b[0m Using theme: ${theme}`);
  
  // Bundle the spec (resolves all external $refs)
  const bundledPath = await bundleSpec(swaggerPath);
  
  // Use .kohlrabi directory as public dir to serve bundled spec
  const publicDir = join(userDir, '.kohlrabi');
  
  return {
    root: libDir,
    publicDir: publicDir,
    // Pass theme as environment variable
    define: {
      'import.meta.env.VITE_THEME': JSON.stringify(theme),
    },
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
        // Use the bundled spec
        copyFileSync(bundledPath, join(destDir, 'swagger.json'));
        console.log('\x1b[32m✓\x1b[0m Copied bundled swagger.json to dist/');
      }
    }] : [],
  };
}

// Commands
async function serve(specArg, theme) {
  console.log('\n\x1b[36m🚀 Starting API Docs development server...\x1b[0m\n');
  
  const config = await createViteConfig('serve', specArg, theme);
  const server = await createServer(config);
  await server.listen();
  
  server.printUrls();
  console.log('\n\x1b[2mPress Ctrl+C to stop\x1b[0m\n');
}

async function buildDocs(specArg, theme) {
  console.log('\n\x1b[36m📦 Building API Docs for production...\x1b[0m\n');
  
  const config = await createViteConfig('build', specArg, theme);
  await build(config);
  
  console.log('\n\x1b[32m✓ Build complete!\x1b[0m Output: ./dist/\n');
}

function showHelp() {
  console.log(`
\x1b[36mKohlrabi\x1b[0m - Beautiful API documentation from OpenAPI specs

\x1b[33mUsage:\x1b[0m
  npx kohlrabi <command> [options]

\x1b[33mCommands:\x1b[0m
  serve     Start development server with hot reload
  build     Build production-ready static files
  help      Show this help message

\x1b[33mOptions:\x1b[0m
  --spec, -s <path>     Path to your OpenAPI spec file (JSON or YAML)
                        Supports multi-file specs with external \$refs
  --theme, -t <theme>   Color theme: dark (default) or light

\x1b[33mExamples:\x1b[0m
  npx kohlrabi serve
  npx kohlrabi serve --theme light
  npx kohlrabi serve --spec ./api/openapi.yaml
  npx kohlrabi build -s ./specs/my-api.yaml --theme light
  npx kohlrabi build -t dark

\x1b[33mThemes:\x1b[0m
  dark      Dark background with light text (default)
  light     Light background with dark text

\x1b[33mMulti-file specs:\x1b[0m
  Kohlrabi automatically resolves external \$refs, so you can use specs like:
  
    paths:
      '/users':
        \$ref: paths/users.yaml
      '/orders':
        \$ref: paths/orders.yaml

\x1b[33mSetup:\x1b[0m
  1. Place your OpenAPI spec (or use --spec to specify location)
  2. Run 'npx kohlrabi serve' to preview
  3. Run 'npx kohlrabi build' to generate static files
`);
}

// Main
const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case 'serve':
  case 'dev':
    serve(args.spec, args.theme).catch(console.error);
    break;
  case 'build':
    buildDocs(args.spec, args.theme).catch(console.error);
    break;
  case 'help':
  case '--help':
  case '-h':
  case null:
  case undefined:
    showHelp();
    break;
  default:
    console.error(`\x1b[31mUnknown command: ${args.command}\x1b[0m`);
    showHelp();
    process.exit(1);
}

