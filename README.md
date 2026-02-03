# Kohlrabi

Beautiful API documentation from your OpenAPI spec. Zero config required. Why Kohlrabi? Broccoli was taken. 

![License](https://img.shields.io/npm/l/kohlrabi)
![npm version](https://img.shields.io/npm/v/kohlrabi)

## Features

- **Zero config** — Point to your OpenAPI spec and go
- **Try It** — Test API endpoints directly from the docs with OAuth2 support
- **Code examples** — Auto-generated cURL, JavaScript, and Python snippets
- **SDK Generation** — Generate client SDKs in TypeScript, Python, Go, Java, Ruby, and C#
- **Themes** — Dark and light themes with custom theme support
- **Multi-file specs** — Automatically resolves external `$ref` references
- **Fast** — Built on Vite for instant hot reload

## How Kohlrabi Compares

| Feature | Kohlrabi | Scalar | Swagger UI | Stoplight Elements |
|---------|:--------:|:------:|:----------:|:------------------:|
| Modern UI | ✅ | ✅ | ❌ | ❌ |
| Themeable | ✅ | ✅ | ❌ | ❌ |
| Zero Config | ✅ | ❌ | ❌ | ❌ |
| Code Snippets | ✅ | ✅ | ❌ | ✅ |
| OAuth2 & Bearer Token | ✅ | ✅ | ✅ | ✅ |
| No Attribution Required | ✅ | ❌ | ❌ | ❌ |
| License | MIT | MIT | Apache 2.0 | Apache 2.0 |

**Zero Config** means no `index.html` boilerplate — just point to your spec and go.

## Quick Start

```bash
# In your project directory with an OpenAPI spec
npx kohlrabi serve
```

That's it! Your docs are live at `http://localhost:5173`

## Commands

| Command | Description |
|---------|-------------|
| `npx kohlrabi serve` | Start dev server with hot reload |
| `npx kohlrabi build` | Build static files to `./dist` |
| `npx kohlrabi sdk` | Generate client SDKs using Fern |

### Options

| Option | Description |
|--------|-------------|
| `--spec, -s <path>` | Path to OpenAPI spec file |
| `--theme, -t <theme>` | Theme: `dark` (default) or `light` |
| `--theme-overrides, -o <path>` | Custom CSS file with brand colors |
| `--language, -l <langs>` | SDK languages (comma-separated) |
| `--output, -O <path>` | SDK output directory |

### Custom Spec Path

```bash
# Serve with a specific spec file
npx kohlrabi serve --spec ./api/openapi.yaml

# Build with a specific spec file
npx kohlrabi build --spec ./api/openapi.yaml
```

### Auto-Detection

Without `--spec`, Kohlrabi looks for your spec in these locations:

1. `./public/swagger.json` ← recommended
2. `./swagger.json`
3. `./public/openapi.json`
4. `./openapi.json`
5. Same paths with `.yaml` / `.yml` extensions

## Deployment

Run `npx kohlrabi build` and deploy the `./dist` folder to any static host.

### Cloudflare Pages / Vercel / Netlify

Connect your Git repo and configure:

- **Build command:** `npx kohlrabi build` (or with theme: `npx kohlrabi build --theme light -o ./brand.css`)
- **Output directory:** `dist`

### GitHub Pages

```yaml
# .github/workflows/deploy.yml
name: Deploy Docs

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx kohlrabi build --theme light --theme-overrides ./brand.css
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY swagger.json brand.css ./
RUN npx kohlrabi build --theme light --theme-overrides ./brand.css

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

## Themes & Custom Branding

Kohlrabi includes dark and light themes, plus support for custom brand colors.

### Built-in Themes

```bash
# Dark theme (default)
npx kohlrabi build

# Light theme
npx kohlrabi build --theme light
```

### Custom Brand Colors

Create a CSS file with your brand colors and pass it with `--theme-overrides`:

```css
/* brand.css */
:root {
  --accent-primary: #ff6b00;
  --accent-secondary: #e55d00;
  --accent-hover: #ff8533;
}
```

```bash
npx kohlrabi build --theme light --theme-overrides ./brand.css
```

Override as few or as many variables as you like. The rest inherit from the base theme.

### Available CSS Variables

| Category | Variables |
|----------|-----------|
| Backgrounds | `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-code`, `--bg-hover` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` |
| Accents | `--accent-primary`, `--accent-secondary`, `--accent-hover` |
| HTTP Methods | `--method-get`, `--method-post`, `--method-put`, `--method-patch`, `--method-delete` |
| Syntax | `--syntax-string`, `--syntax-number`, `--syntax-boolean`, `--syntax-null`, `--syntax-key` |
| Borders | `--border-color`, `--border-subtle` |

## Multi-File Specs

Kohlrabi automatically bundles specs with external references:

```yaml
# openapi.yaml
paths:
  '/users':
    $ref: paths/users.yaml
  '/orders':
    $ref: paths/orders.yaml
```

```bash
npx kohlrabi serve --spec ./openapi.yaml
```

## OAuth2 / Try It

If your spec includes OAuth2 security schemes, the token URL and scopes are auto-configured:

```yaml
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
```

Users can enter their Client ID/Secret in the sidebar to generate tokens and test endpoints directly.

## API Switcher

Link between multiple API docs with `x-api-family`:

```json
{
  "info": {
    "title": "Users API",
    "x-api-family": [
      { "name": "Users API", "url": "/docs/users", "current": true },
      { "name": "Payments API", "url": "/docs/payments" }
    ]
  }
}
```

## SDK Generation

Generate type-safe client SDKs from your OpenAPI spec using [Fern](https://github.com/fern-api/fern). Fern is automatically downloaded via npx — no separate installation required.

### Quick Start

```bash
# Generate a TypeScript SDK
npx kohlrabi sdk --language typescript

# Generate multiple SDKs
npx kohlrabi sdk -l typescript,python,go

# Custom spec and output
npx kohlrabi sdk --spec ./api.yaml -l python -O ./my-sdks
```

### Available Languages

| Language | Registry |
|----------|----------|
| `typescript` | npm |
| `python` | PyPI |
| `java` | Maven Central |
| `go` | GitHub releases |
| `ruby` | RubyGems |
| `csharp` | NuGet |

### Output Structure

```
sdk-output/
├── fern/
│   ├── fern.config.json
│   ├── generators.yml
│   └── openapi/
│       └── openapi.json
├── sdks/
│   ├── typescript/
│   ├── python/
│   └── go/
└── SDK_README.md
```

### Publishing to npm

```bash
cd sdk-output/sdks/typescript
npm publish
```

### Publishing to PyPI

```bash
cd sdk-output/sdks/python
pip install build twine
python -m build
twine upload dist/*
```

### GitHub Actions Workflow

Automatically publish SDKs when you create a release:

```yaml
# .github/workflows/sdk.yml
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
      
      - name: Generate SDK
        run: |
          npm install -g fern-api
          npx kohlrabi sdk -l typescript
      
      - name: Publish to npm
        working-directory: sdk-output/sdks/typescript
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  publish-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Generate SDK
        run: |
          npm install -g fern-api
          npx kohlrabi sdk -l python
      
      - name: Publish to PyPI
        working-directory: sdk-output/sdks/python
        run: |
          pip install build twine
          python -m build
          twine upload dist/*
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: ${{ secrets.PYPI_TOKEN }}
```

### Attribution

SDK generation is powered by [Fern](https://github.com/fern-api/fern), licensed under Apache 2.0.
See [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) for details.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup.

## License

MIT
