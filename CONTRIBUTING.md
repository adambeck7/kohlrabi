# Contributing to kohlrabi Docs

Thanks for your interest in contributing! This guide covers the development workflow and release process.

## Table of Contents

- [Development Setup](#-development-setup)
- [Project Structure](#-project-structure)
- [Making Changes](#-making-changes)
- [Release Process](#-release-process)

---

## Development Setup

### Prerequisites

- Node.js 18+ 
- npm 9+
- Git

### Clone & Install

```bash
# Clone the repo
git clone https://github.com/adambeck7/kohlrabi.git
cd kohlrabi

# Install dependencies
npm install

# Copy example spec for testing, or just add your own swagger.json
cp example/swagger.json public/swagger.json

# Start development server
npm run dev
```

The dev server will open at `http://localhost:5173`.

### Test the Build

```bash
npm run build
```

This creates a `dist/` folder with production-ready files.

---

## Project Structure

```
kohlrabi/
├── bin/
│   └── cli.js              # CLI entry point (serve/build commands)
├── lib/
│   ├── index.html          # HTML template
│   ├── main.js             # Core renderer & parser
│   └── styles.css          # All styles
├── example/
│   └── swagger.json        # Example spec for testing
├── public/                  # Your local test spec (gitignored)
│   └── swagger.json
├── .github/
│   └── workflows/
│       └── release.yml     # Auto-publish on GitHub release
├── package.json
├── README.md               # User documentation
└── CONTRIBUTING.md         # This file
```

### Key Files

| File | Purpose |
|------|---------|
| `bin/cli.js` | CLI commands (`serve`, `build`). Uses Vite programmatically. |
| `lib/main.js` | OpenAPI parser, code generators, DOM renderer |
| `lib/styles.css` | All CSS including dark theme, responsive design |
| `lib/index.html` | HTML shell that loads the JS |

---

## Making Changes

### Modifying the Renderer

1. Edit files in `lib/`
2. The dev server hot-reloads changes
3. Test with different OpenAPI specs

### Modifying the CLI

1. Edit `bin/cli.js`
2. Test with: `node bin/cli.js serve` or `node bin/cli.js build`

### Adding Features

1. Create a branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Test thoroughly with `npm run dev` and `npm run build`
4. Submit a pull request

---

## Release Process

We use GitHub Releases to trigger npm publishing. The version in `package.json` is automatically updated to match the release tag.

### Step-by-Step Release

#### 1. Ensure Everything Works

```bash
# Pull latest changes
git checkout main
git pull origin main

# Test the build
npm run build

# Test serving
npm run dev
```

#### 2. Update the Changelog (Optional)

Add release notes to a `CHANGELOG.md` if you maintain one.

#### 3. Create a GitHub Release

1. Go to your repo on GitHub
2. Click **Releases** → **Create a new release**
3. Click **Choose a tag** → Type your new version (e.g., `v0.2.0`) → **Create new tag**
4. **Release title:** `v0.2.0`
5. **Description:** Add release notes (new features, fixes, breaking changes)
6. Click **Publish release**

#### 4. GitHub Actions Does the Rest

The `release.yml` workflow automatically:

1. Checks out the code
2. Updates `package.json` version to match the tag (e.g., `0.2.0`)
3. Runs `npm publish` with provenance
4. Publishes to npm registry

#### 5. Verify the Release

```bash
# Check npm for the new version
npm view kohlrabi version

# Users can now install it
npm install kohlrabi@latest
```


## Version Guidelines

We follow [Semantic Versioning](https://semver.org/):

| Version | When to Use |
|---------|-------------|
| `v0.x.y` | Pre-1.0 development (breaking changes allowed in minor) |
| `vX.0.0` | Breaking changes (major) |
| `vX.Y.0` | New features, backwards compatible (minor) |
| `vX.Y.Z` | Bug fixes only (patch) |

### Examples

- `v0.1.0` → `v0.2.0`: Added new feature during pre-1.0
- `v1.0.0` → `v1.1.0`: Added API switcher feature
- `v1.1.0` → `v1.1.1`: Fixed mobile menu bug
- `v1.1.1` → `v2.0.0`: Changed CLI command names (breaking)

---

## Troubleshooting

### GitHub Action not triggering

- Make sure the release is **published**, not just a draft
- Tag must start with `v` (e.g., `v0.2.0`)

### Build fails in CI

- Test locally first: `npm run build`
- Check Node version matches CI (20.x)

---

## Questions?

Open an issue on GitHub or reach out to the maintainers.

