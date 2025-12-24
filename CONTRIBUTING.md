# Contributing to kohlrabi Docs

Thanks for your interest in contributing! This guide covers the development workflow and release process.

## Table of Contents

- [Development Setup](#-development-setup)
- [Project Structure](#-project-structure)
- [Making Changes](#-making-changes)
- [Release Process](#-release-process)
- [npm Publishing Setup](#-npm-publishing-setup-one-time)

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

---

## npm Publishing Setup (One-Time)

### 1. Create npm Account

If you don't have one: https://www.npmjs.com/signup

### 2. Choose Package Name

Update `package.json` with your chosen name:

```json
{
  "name": "kohlrabi",
  // or scoped: "@your-org/kohlrabi"
}
```

Check availability: `npm view <package-name>`

### 3. Generate npm Access Token

1. Go to https://www.npmjs.com → Click your avatar → **Access Tokens**
2. Click **Generate New Token** → **Classic Token**
3. Select **Automation** (for CI/CD)
4. Copy the token (you won't see it again!)

### 4. Add Token to GitHub

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Value: Paste your npm token
5. Click **Add secret**

### 5. Update package.json URLs

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/adambeck7/kohlrabi.git"
  },
  "homepage": "https://github.com/adambeck7/kohlrabi#readme",
  "bugs": {
    "url": "https://github.com/adambeck7/kohlrabi/issues"
  }
}
```

### 6. First Publish (Manual)

For the very first publish, do it manually:

```bash
# Login to npm
npm login

# Publish (use --access public for scoped packages)
npm publish --access public
```

After this, GitHub Actions handles all future releases.

---

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

### npm publish fails

- Check that `NPM_TOKEN` secret is set correctly
- Ensure the package name isn't taken
- For scoped packages, use `--access public`

### npm publish requires OTP (one-time password)

If you see `npm error code EOTP`, this means npm is requiring 2FA authentication:

1. **Regenerate your token as an Automation token:**
   - Go to https://www.npmjs.com → Your avatar → **Access Tokens**
   - Delete the old token
   - Click **Generate New Token** → **Automation** (NOT Classic Token)
   - Copy the new token
   - Update the `NPM_TOKEN` secret in GitHub

2. **Check your npm account 2FA settings:**
   - Go to https://www.npmjs.com/settings/[your-username]/profile
   - Under "Two-Factor Authentication", ensure automation tokens are allowed
   - If 2FA is set to "Authorization" mode, automation tokens should still work without OTP

3. **Verify the token type:**
   - Automation tokens (type: `automation`) don't require OTP
   - Classic tokens with 2FA enabled will require OTP

### GitHub Action not triggering

- Make sure the release is **published**, not just a draft
- Tag must start with `v` (e.g., `v0.2.0`)

### Build fails in CI

- Test locally first: `npm run build`
- Check Node version matches CI (20.x)

---

## Questions?

Open an issue on GitHub or reach out to the maintainers.

