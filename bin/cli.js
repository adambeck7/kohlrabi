#!/usr/bin/env node

/**
 * Kohlrabi Docs CLI
 * Serves and builds API documentation from OpenAPI specs
 * 
 * SDK Generation uses Fern (https://github.com/fern-api/fern)
 * Fern is licensed under Apache 2.0 - see THIRD_PARTY_LICENSES.md
 */

import { createServer, build } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve, join, isAbsolute, basename } from 'path';
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { execSync, spawn } from 'child_process';
import SwaggerParser from '@apidevtools/swagger-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package lib directory (where our core files live)
const libDir = resolve(__dirname, '../lib');

// User's current working directory
const userDir = process.cwd();

// Supported SDK languages
const SDK_LANGUAGES = ['typescript', 'python', 'java', 'go', 'ruby', 'csharp'];

// Parse CLI arguments for --spec, --theme, --theme-overrides, and --language flags
function parseArgs(args) {
  const result = { 
    spec: null, 
    theme: 'dark', 
    themeOverrides: null, 
    command: null,
    languages: [],
    output: null,
  };
  
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
    } else if (arg === '--theme-overrides' || arg === '-o') {
      result.themeOverrides = args[i + 1];
      i++; // Skip next arg
    } else if (arg.startsWith('--theme-overrides=')) {
      result.themeOverrides = arg.split('=')[1];
    } else if (arg.startsWith('-o=')) {
      result.themeOverrides = arg.split('=')[1];
    } else if (arg === '--language' || arg === '-l') {
      // Parse comma-separated languages
      const langs = args[i + 1]?.split(',').map(l => l.trim().toLowerCase()) || [];
      result.languages.push(...langs);
      i++; // Skip next arg
    } else if (arg.startsWith('--language=')) {
      const langs = arg.split('=')[1].split(',').map(l => l.trim().toLowerCase());
      result.languages.push(...langs);
    } else if (arg.startsWith('-l=')) {
      const langs = arg.split('=')[1].split(',').map(l => l.trim().toLowerCase());
      result.languages.push(...langs);
    } else if (arg === '--output' || arg === '-O') {
      result.output = args[i + 1];
      i++; // Skip next arg
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1];
    } else if (arg.startsWith('-O=')) {
      result.output = arg.split('=')[1];
    } else if (!arg.startsWith('-') && !result.command) {
      result.command = arg;
    }
  }
  
  // Validate theme (only for serve/build commands)
  if (['serve', 'dev', 'build'].includes(result.command)) {
    if (!['dark', 'light'].includes(result.theme)) {
      console.error(`\x1b[31m✖ Invalid theme: ${result.theme}\x1b[0m`);
      console.error('Available themes: dark, light');
      process.exit(1);
    }
  }
  
  // Validate theme overrides file exists if provided
  if (result.themeOverrides) {
    const overridesPath = isAbsolute(result.themeOverrides) 
      ? result.themeOverrides 
      : join(userDir, result.themeOverrides);
    if (!existsSync(overridesPath)) {
      console.error(`\x1b[31m✖ Theme overrides file not found: ${overridesPath}\x1b[0m`);
      process.exit(1);
    }
    result.themeOverrides = overridesPath;
  }
  
  // Validate SDK languages
  if (result.command === 'sdk') {
    if (result.languages.length === 0) {
      result.languages = ['typescript']; // Default to TypeScript
    }
    
    for (const lang of result.languages) {
      if (!SDK_LANGUAGES.includes(lang)) {
        console.error(`\x1b[31m✖ Invalid language: ${lang}\x1b[0m`);
        console.error(`Available languages: ${SDK_LANGUAGES.join(', ')}`);
        process.exit(1);
      }
    }
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
async function createViteConfig(command, specArg = null, theme = 'dark', themeOverrides = null) {
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
  
  // Copy theme overrides to .kohlrabi if provided
  const hasThemeOverrides = !!themeOverrides;
  if (hasThemeOverrides) {
    const overridesDestPath = join(publicDir, 'theme-overrides.css');
    copyFileSync(themeOverrides, overridesDestPath);
    console.log(`\x1b[32m✓\x1b[0m Using theme overrides: ${themeOverrides}`);
  }
  
  return {
    root: libDir,
    publicDir: publicDir,
    // Pass theme and overrides flag as environment variables
    define: {
      'import.meta.env.VITE_THEME': JSON.stringify(theme),
      'import.meta.env.VITE_THEME_OVERRIDES': JSON.stringify(hasThemeOverrides),
    },
    server: {
      open: true,
    },
    build: {
      outDir: join(userDir, 'dist'),
      emptyOutDir: true,
    },
    // Copy swagger and theme overrides to dist
    plugins: command === 'build' ? [{
      name: 'copy-assets',
      closeBundle() {
        const destDir = join(userDir, 'dist');
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        // Use the bundled spec
        copyFileSync(bundledPath, join(destDir, 'swagger.json'));
        console.log('\x1b[32m✓\x1b[0m Copied bundled swagger.json to dist/');
        
        // Copy theme overrides if present
        if (hasThemeOverrides) {
          copyFileSync(themeOverrides, join(destDir, 'theme-overrides.css'));
          console.log('\x1b[32m✓\x1b[0m Copied theme-overrides.css to dist/');
        }
      }
    }] : [],
  };
}

// Commands
async function serve(specArg, theme, themeOverrides) {
  console.log('\n\x1b[36m🚀 Starting API Docs development server...\x1b[0m\n');
  
  const config = await createViteConfig('serve', specArg, theme, themeOverrides);
  const server = await createServer(config);
  await server.listen();
  
  server.printUrls();
  console.log('\n\x1b[2mPress Ctrl+C to stop\x1b[0m\n');
}

async function buildDocs(specArg, theme, themeOverrides) {
  console.log('\n\x1b[36m📦 Building API Docs for production...\x1b[0m\n');
  
  const config = await createViteConfig('build', specArg, theme, themeOverrides);
  await build(config);
  
  console.log('\n\x1b[32m✓ Build complete!\x1b[0m Output: ./dist/\n');
}

// ============================================
// SDK Generation (using Fern)
// ============================================

/**
 * Run Fern CLI using npx (auto-downloads if not installed)
 */
function runFernGenerate(fernDir) {
  return new Promise((resolve, reject) => {
    // Use npx to run fern-api - force latest version with @latest
    const fern = spawn('npx', ['--yes', 'fern-api@latest', 'generate', '--local'], {
      cwd: fernDir,
      stdio: 'inherit',
      shell: true,
    });

    fern.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Fern generation failed with exit code ${code}`));
      }
    });

    fern.on('error', (err) => {
      reject(new Error(`Failed to run Fern: ${err.message}`));
    });
  });
}

/**
 * Get Fern generator ID for a language
 */
function getFernGenerator(language) {
  const generators = {
    typescript: 'fernapi/fern-typescript-node-sdk',
    python: 'fernapi/fern-python-sdk',
    java: 'fernapi/fern-java-sdk',
    go: 'fernapi/fern-go-sdk',
    ruby: 'fernapi/fern-ruby-sdk',
    csharp: 'fernapi/fern-csharp-sdk',
  };
  return generators[language];
}

/**
 * Get Fern generator version for a language
 * Returns version placeholders that users should update in generators.yml
 */
function getGeneratorVersion(language) {
  // Default versions - users should check Fern docs for latest versions
  // Each Fern SDK generator has independent versioning
  const versions = {
    typescript: '3.32.0',  // Check: https://github.com/fern-api/fern/releases
    python: '4.46.6',       // Check: https://github.com/fern-api/fern/releases
    java: '3.27.4',
    go: '1.21.8',
    ruby: '3.32.0',
    csharp: '3.32.0',
  };
  return versions[language] || '0.0.0';
}

/**
 * Sanitize API name for use in package names
 */
function sanitizePackageName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'api';
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str) {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Generate Fern configuration files
 */
function generateFernConfig(spec, languages, outputDir) {
  const apiName = sanitizePackageName(spec.info?.title || 'api');
  const apiVersion = spec.info?.version || '1.0.0';

  // Create fern directory structure
  const fernDir = join(outputDir, 'fern');

  mkdirSync(fernDir, { recursive: true });

  // Write fern.config.json
  const fernConfig = {
    organization: apiName,
    version: '3.35.2',
  };
  writeFileSync(join(fernDir, 'fern.config.json'), JSON.stringify(fernConfig, null, 2));

  // Only generate generators.yml if it doesn't already exist
  const generatorsPath = join(fernDir, 'generators.yml');
  if (!existsSync(generatorsPath)) {
    const generatorsConfig = generateGeneratorsYaml(languages, apiName);
    writeFileSync(generatorsPath, generatorsConfig);
    console.log('\x1b[32m✓\x1b[0m Generated generators.yml (edit this file to set SDK versions)');
  } else {
    console.log('\x1b[33m→\x1b[0m Using existing generators.yml (preserving your version settings)');
  }

  // Write the OpenAPI spec directly in the fern directory
  writeFileSync(join(fernDir, 'openapi.yml'), JSON.stringify(spec, null, 2));

  return fernDir;
}

/**
 * Generate generators.yml content
 */
function generateGeneratorsYaml(languages, apiName) {
  let yaml = `# Fern SDK Generator Configuration
# Generated by Kohlrabi - https://github.com/adambeck7/kohlrabi
# Fern is licensed under Apache 2.0 - https://github.com/fern-api/fern
#
# NOTE: Update the version numbers below to match the SDK generator versions you want to use.
# Each SDK has independent versioning. Find versions at: https://github.com/fern-api/fern/releases
# This file won't be overwritten on subsequent runs - your version settings are preserved.

api:
  specs:
    - openapi: openapi.yml

default-group: sdk
groups:
  sdk:
    generators:
`;

  for (const lang of languages) {
    const generator = getFernGenerator(lang);
    const version = getGeneratorVersion(lang);
    yaml += `      - name: ${generator}
        version: ${version}
        output:
          location: local-file-system
          path: ../sdks/${lang}
`;

    // Add language-specific config
    const config = getLanguageConfig(lang, apiName);
    if (Object.keys(config).length > 0) {
      yaml += `        config:\n`;
      for (const [key, value] of Object.entries(config)) {
        yaml += `          ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}\n`;
      }
    }
  }

  return yaml;
}

/**
 * Get language-specific Fern configuration
 */
function getLanguageConfig(language, apiName) {
  const pascalName = toPascalCase(apiName);
  
  const configs = {
    typescript: {
      namespaceExport: pascalName,
      outputSourceFiles: true,
    },
    python: {
      package_name: apiName.replace(/-/g, '_'),
    },
    java: {
      'package-prefix': `com.${apiName.replace(/-/g, '.')}`,
    },
    go: {
      module: `github.com/YOUR_ORG/${apiName}-go`,
    },
    ruby: {
      gem_name: apiName,
    },
    csharp: {
      namespace: pascalName,
    },
  };

  return configs[language] || {};
}

/**
 * Generate SDK README
 */
function generateSDKReadme(spec, languages, outputDir) {
  const apiName = sanitizePackageName(spec.info?.title || 'api');
  const pascalName = toPascalCase(apiName);
  
  let readme = `# ${spec.info?.title || 'API'} SDKs

Auto-generated SDKs using [Fern](https://github.com/fern-api/fern) and [Kohlrabi](https://github.com/adambeck7/kohlrabi).

## Generated SDKs

${languages.map(lang => `- **${lang}**: \`./sdks/${lang}/\``).join('\n')}

## Regenerating SDKs

\`\`\`bash
# Install Fern CLI (if not already installed)
npm install -g fern-api

# Generate SDKs
cd fern
fern generate --local
\`\`\`

## Publishing to Package Registries

### TypeScript/JavaScript (npm)

\`\`\`bash
cd sdks/typescript
npm publish
\`\`\`

### Python (PyPI)

\`\`\`bash
cd sdks/python
pip install build twine
python -m build
twine upload dist/*
\`\`\`

### Java (Maven Central)

See [Fern Java SDK publishing docs](https://docs.buildwithfern.com/sdks/publishing/maven).

### Go

Push to a GitHub repository and tag a release:

\`\`\`bash
cd sdks/go
git init
git remote add origin https://github.com/YOUR_ORG/${apiName}-go.git
git add .
git commit -m "v${spec.info?.version || '1.0.0'}"
git tag v${spec.info?.version || '1.0.0'}
git push origin main --tags
\`\`\`

## GitHub Actions Workflow

Add this to \`.github/workflows/sdk.yml\` to auto-publish on release:

\`\`\`yaml
name: Publish SDKs

on:
  release:
    types: [published]

jobs:
  publish-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install Fern
        run: npm install -g fern-api
      
      - name: Generate SDK
        run: cd fern && fern generate --local
      
      - name: Publish to npm
        working-directory: sdks/typescript
        run: npm publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}

  publish-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install Fern
        run: npm install -g fern-api
      
      - name: Generate SDK
        run: cd fern && fern generate --local
      
      - name: Publish to PyPI
        working-directory: sdks/python
        run: |
          pip install build twine
          python -m build
          twine upload dist/*
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: \${{ secrets.PYPI_TOKEN }}
\`\`\`

## Attribution

SDK generation powered by [Fern](https://github.com/fern-api/fern) (Apache 2.0 License).
`;

  writeFileSync(join(outputDir, 'SDK_README.md'), readme);
}

/**
 * Main SDK generation command
 */
async function generateSDK(specArg, languages, outputDir) {
  console.log('\n\x1b[36m🌿 Generating SDK with Fern...\x1b[0m\n');
  
  // Find and bundle the spec
  const swaggerPath = findSwaggerFile(specArg);
  
  if (!swaggerPath) {
    console.error('\x1b[31m✖ No OpenAPI spec found!\x1b[0m');
    console.error('Specify a spec with: kohlrabi sdk --spec ./path/to/openapi.json');
    process.exit(1);
  }
  
  console.log(`\x1b[32m✓\x1b[0m Using spec: ${swaggerPath}`);
  console.log(`\x1b[32m✓\x1b[0m Languages: ${languages.join(', ')}`);
  
  // Bundle and parse the spec
  console.log('\x1b[33m→\x1b[0m Bundling spec...');
  const spec = await SwaggerParser.bundle(swaggerPath);
  console.log('\x1b[32m✓\x1b[0m Spec bundled successfully');
  
  // Determine output directory
  const sdkOutputDir = outputDir 
    ? (isAbsolute(outputDir) ? outputDir : join(userDir, outputDir))
    : join(userDir, 'sdk-output');
  
  // Clean and create output directory
  if (existsSync(sdkOutputDir)) {
    console.log('\x1b[33m→\x1b[0m Cleaning existing output directory...');
    rmSync(sdkOutputDir, { recursive: true, force: true });
  }
  mkdirSync(sdkOutputDir, { recursive: true });
  
  console.log(`\x1b[32m✓\x1b[0m Output directory: ${sdkOutputDir}`);
  
  // Generate Fern configuration
  console.log('\x1b[33m→\x1b[0m Generating Fern configuration...');
  const fernDir = generateFernConfig(spec, languages, sdkOutputDir);
  console.log('\x1b[32m✓\x1b[0m Fern configuration created');
  
  // Generate README
  generateSDKReadme(spec, languages, sdkOutputDir);
  console.log('\x1b[32m✓\x1b[0m SDK README created');
  
  // Run Fern generate using npx (auto-downloads if needed)
  console.log('\x1b[33m→\x1b[0m Running Fern SDK generation (this may take a moment on first run)...\n');
  
  try {
    await runFernGenerate(fernDir);
    
    console.log('\n\x1b[32m✓ SDK generation complete!\x1b[0m\n');
    console.log('Generated files:');
    console.log(`  • Fern config: ${fernDir}/`);
    console.log(`  • SDKs: ${sdkOutputDir}/sdks/`);
    console.log(`  • README: ${sdkOutputDir}/SDK_README.md`);
    console.log('\nSee SDK_README.md for publishing instructions.\n');
    
  } catch (error) {
    console.error('\n\x1b[31m✖ Fern generation failed\x1b[0m');
    console.error(`Error: ${error.message}\n`);
    console.error('You can try running manually:');
    console.error(`  cd ${fernDir}`);
    console.error('  npx fern-api generate --local\n');
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
\x1b[36mKohlrabi\x1b[0m - Beautiful API documentation from OpenAPI specs

\x1b[33mUsage:\x1b[0m
  npx kohlrabi <command> [options]

\x1b[33mCommands:\x1b[0m
  serve     Start development server with hot reload
  build     Build production-ready static files
  sdk       Generate client SDKs using Fern
  help      Show this help message

\x1b[33mOptions (serve/build):\x1b[0m
  --spec, -s <path>            Path to your OpenAPI spec file (JSON or YAML)
                               Supports multi-file specs with external \$refs
  --theme, -t <theme>          Color theme: dark (default) or light
  --theme-overrides, -o <path> Custom CSS file to override theme colors

\x1b[33mOptions (sdk):\x1b[0m
  --spec, -s <path>            Path to your OpenAPI spec file
  --language, -l <langs>       Comma-separated list of languages (default: typescript)
                               Available: typescript, python, java, go, ruby, csharp
  --output, -O <path>          Output directory (default: ./sdk-output)

\x1b[33mExamples:\x1b[0m
  npx kohlrabi serve
  npx kohlrabi serve --theme light
  npx kohlrabi serve --spec ./api/openapi.yaml
  npx kohlrabi build -s ./specs/my-api.yaml --theme light
  npx kohlrabi build --theme dark --theme-overrides ./brand.css
  
  \x1b[36m# SDK Generation\x1b[0m
  npx kohlrabi sdk --language typescript
  npx kohlrabi sdk -l typescript,python,go
  npx kohlrabi sdk --spec ./api.yaml -l python -O ./my-sdks

\x1b[33mThemes:\x1b[0m
  dark      Dark background with light text (default)
  light     Light background with dark text

\x1b[33mCustom Brand Colors:\x1b[0m
  Override any theme colors with a custom CSS file:
  
    /* brand.css */
    :root {
      --accent-primary: #ff6b00;
      --accent-secondary: #e55d00;
      --method-get: #00b894;
    }
  
  Use with: npx kohlrabi build --theme light -o ./brand.css

\x1b[33mSDK Generation:\x1b[0m
  Generate type-safe client SDKs using Fern (Apache 2.0 License).
  Fern is automatically downloaded via npx - no separate install needed.
  
  The SDK command creates:
    • Fern configuration files
    • Generated SDK code for each language
    • README with publishing instructions
    • GitHub Actions workflow example

  Publish SDKs to registries:
    • TypeScript → npm
    • Python → PyPI  
    • Java → Maven Central
    • Go → GitHub releases
    • Ruby → RubyGems
    • C# → NuGet

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
  4. Run 'npx kohlrabi sdk' to generate client SDKs
`);
}

// Main
const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case 'serve':
  case 'dev':
    serve(args.spec, args.theme, args.themeOverrides).catch(console.error);
    break;
  case 'build':
    buildDocs(args.spec, args.theme, args.themeOverrides).catch(console.error);
    break;
  case 'sdk':
    generateSDK(args.spec, args.languages, args.output).catch(console.error);
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

