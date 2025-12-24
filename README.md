# Kohlrabi Docs

Why Kohlrabi? Broccoli was taken. Modern API documentation from OpenAPI/Swagger specs. Just add your `swagger.json` and go. I've tested with numerous public OpenAPI specs and all rendered perfectly, but if you hit any problems, feel free to open an issue.

![License](https://img.shields.io/npm/l/kohlrabi)
![npm version](https://img.shields.io/npm/v/kohlrabi)

## Features

- **Zero config** — Just add your OpenAPI spec and run
- **Code examples** — Auto-generated cURL, JavaScript, and Python snippets
- **API switcher** — Easy navigation between multiple API docs
- **Fast** — Built on Vite for instant hot reload during development

## Quick Start

### Option 1: npx (No Installation, for local development)

```bash
# Create a new project
mkdir my-api-docs
cd my-api-docs

# Add your OpenAPI spec
mkdir public
cp /path/to/your/swagger.json public/swagger.json

# Start the dev server
npx kohlrabi serve
```

Your docs are now live at `http://localhost:5173`!

### Option 2: Install as Dependency

```bash
npm install kohlrabi
```

Add to your `package.json`:

```json
{
  "scripts": {
    "dev": "kohlrabi serve",
    "build": "kohlrabi build"
  }
}
```

Then run:

```bash
npm run dev    # Development server
npm run build  # Production build
```

## 📁 Project Structure

```
my-api-docs/
├── public/
│   └── swagger.json    # Your OpenAPI spec (required)
├── package.json
└── dist/               # Generated after build
    ├── index.html
    ├── swagger.json
    └── assets/
```

## 🛠 Commands

| Command | Description |
|---------|-------------|
| `kohlrabi serve` | Start dev server with hot reload |
| `kohlrabi build` | Build static files to `./dist` |
| `kohlrabi help` | Show help message |

## Spec File Locations

The CLI automatically finds your spec in these locations (in order):

1. `./public/swagger.json` ✅ recommended
2. `./swagger.json`
3. `./public/openapi.json`
4. `./openapi.json`

## API Switcher

Have multiple APIs? Add navigation between them with `x-api-family` in your spec:

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Users API",
    "version": "1.0.0",
    "x-api-family": [
      { "name": "Users API", "url": "/docs/users", "current": true },
      { "name": "Payments API", "url": "/docs/payments" },
      { "name": "Analytics API", "url": "/docs/analytics" }
    ]
  }
}
```

This adds a dropdown to the title, letting users switch between your API docs.

---

## Deployment

After building (`kohlrabi build`), deploy the `./dist` folder to any static host.

### One-Click Deploy

Deploy your own API docs with one click:

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/your-org/kohlrabi)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/kohlrabi&project-name=my-api-docs&repository-name=my-api-docs)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/your-org/kohlrabi)

> **Note:** After deploying, replace `example/swagger.json` with your own OpenAPI spec at `public/swagger.json`.

### Cloudflare Pages

**Option A: Git Integration (Recommended)**

1. Push your project to GitHub/GitLab
2. Go to [Cloudflare Pages](https://pages.cloudflare.com/) → Create a project
3. Connect your repository
4. Configure build settings:
   - **Build command:** `npx kohlrabi build`
   - **Build output directory:** `dist`
5. Deploy!

Your docs will auto-deploy on every push.

**Option B: Direct Upload**

```bash
# Build locally
npx kohlrabi build

# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler pages deploy dist --project-name=my-api-docs
```

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Build and deploy
npx kohlrabi build
vercel dist
```

Or connect your Git repo and set:
- **Build Command:** `npx kohlrabi build`
- **Output Directory:** `dist`

### Netlify

**Option A: Drag & Drop**

1. Run `npx kohlrabi build`
2. Go to [Netlify Drop](https://app.netlify.com/drop)
3. Drag your `dist` folder

**Option B: Git Integration**

1. Push to GitHub
2. Connect repo in Netlify
3. Build settings:
   - **Build command:** `npx kohlrabi build`
   - **Publish directory:** `dist`

### GitHub Pages

```bash
# Build
npx kohlrabi build

# Deploy using gh-pages
npm install -g gh-pages
gh-pages -d dist
```

Or use GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Build
        run: |
          mkdir -p public
          cp swagger.json public/swagger.json  # adjust path as needed
          npx kohlrabi build
      
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### AWS S3 + CloudFront

```bash
# Build
npx kohlrabi build

# Upload to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache (optional)
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### Docker / Self-Hosted

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY public/swagger.json public/
RUN npx kohlrabi build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t my-api-docs .
docker run -p 8080:80 my-api-docs
```

---

## Customization

### Custom Styling (Coming Soon)

We're working on theme customization. For now, you can fork the repo and modify `lib/styles.css`.

---

## Example

Check out the `example/swagger.json` in this repo for a working example spec.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and release process.

## License

MIT
