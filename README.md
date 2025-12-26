# Kohlrabi

Beautiful API documentation from your OpenAPI spec. Zero config required. Why Kohlrabi? Broccoli was taken. 

![License](https://img.shields.io/npm/l/kohlrabi)
![npm version](https://img.shields.io/npm/v/kohlrabi)

## Features

- **Zero config** — Point to your OpenAPI spec and go
- **Try It** — Test API endpoints directly from the docs with OAuth2 support
- **Code examples** — Auto-generated cURL, JavaScript, and Python snippets
- **Multi-file specs** — Automatically resolves external `$ref` references
- **Fast** — Built on Vite for instant hot reload

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

- **Build command:** `npx kohlrabi build`
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
      - run: npx kohlrabi build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY swagger.json ./
RUN npx kohlrabi build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup.

## License

MIT
