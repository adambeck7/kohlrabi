/**
 * API Documentation
 * OpenAPI 3.x Parser and Renderer
 */

// Import theme based on build-time flag (defaults to dark)
if (import.meta.env.VITE_THEME === 'light') {
  import('./themes/light.css');
} else {
  import('./themes/dark.css');
}

// Import custom theme overrides if provided at build time
if (import.meta.env.VITE_THEME_OVERRIDES) {
  // Dynamically inject the theme overrides CSS from the public directory
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/theme-overrides.css';
  document.head.appendChild(link);
}

import './styles.css';

// ============================================
// Authentication Manager
// ============================================

class AuthManager {
  constructor() {
    this.token = null;
    this.tokenExpiry = null;
    this.listeners = [];
  }

  /**
   * Get the current access token
   */
  getToken() {
    // Check if token is expired
    if (this.tokenExpiry && new Date() >= this.tokenExpiry) {
      this.token = null;
      this.tokenExpiry = null;
    }
    return this.token;
  }

  /**
   * Set a bearer token directly
   */
  setToken(token, expiresIn = null) {
    this.token = token;
    if (expiresIn) {
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    } else {
      this.tokenExpiry = null;
    }
    this.notifyListeners();
    this.updateDisplay();
  }

  /**
   * Clear the current token
   */
  clearToken() {
    this.token = null;
    this.tokenExpiry = null;
    this.notifyListeners();
    this.updateDisplay();
  }

  /**
   * Generate OAuth2 token using client credentials flow
   */
  async generateToken(tokenUrl, clientId, clientSecret, scope = '') {
    const formData = new URLSearchParams();
    formData.append('grant_type', 'client_credentials');
    formData.append('client_id', clientId);
    formData.append('client_secret', clientSecret);
    if (scope) {
      formData.append('scope', scope);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_description || errorJson.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    this.setToken(data.access_token, data.expires_in);
    return data;
  }

  /**
   * Subscribe to token changes
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notify all listeners of token change
   */
  notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.token);
    }
  }

  /**
   * Update the token display in the sidebar
   */
  updateDisplay() {
    const display = document.getElementById('activeTokenValue');
    if (!display) return;

    if (this.token) {
      const masked = this.token.substring(0, 8) + '...' + this.token.substring(this.token.length - 4);
      display.textContent = masked;
      display.classList.add('configured');
    } else {
      display.textContent = 'Not configured';
      display.classList.remove('configured');
    }
  }
}

// Global auth manager instance
const authManager = new AuthManager();

// ============================================
// OpenAPI Parser & Schema Resolver
// ============================================

class OpenAPIParser {
  constructor(spec) {
    this.spec = spec;
    this.schemas = spec.components?.schemas || {};
  }

  /**
   * Resolve a $ref to its actual schema
   */
  resolveRef(ref, visited = new Set()) {
    if (!ref || typeof ref !== 'string') return null;

    // Prevent circular references
    if (visited.has(ref)) {
      return { type: 'object', description: '[Circular Reference]' };
    }
    visited.add(ref);

    const parts = ref.split('/');
    let result = this.spec;

    for (let i = 1; i < parts.length; i++) {
      // Decode JSON pointer escape sequences: ~1 -> /, ~0 -> ~
      const key = parts[i].replace(/~1/g, '/').replace(/~0/g, '~');
      result = result?.[key];
    }

    // If the result has its own $ref, resolve it recursively
    if (result?.$ref) {
      return this.resolveRef(result.$ref, visited);
    }

    return result;
  }

  /**
   * Resolve all $refs in an object recursively
   */
  resolveSchema(schema, visited = new Set()) {
    if (!schema) return null;
    
    if (schema.$ref) {
      const resolved = this.resolveRef(schema.$ref, new Set(visited));
      return this.resolveSchema(resolved, visited);
    }
    
    if (schema.type === 'array' && schema.items) {
      return {
        ...schema,
        items: this.resolveSchema(schema.items, visited)
      };
    }
    
    if (schema.type === 'object' && schema.properties) {
      const resolvedProps = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        resolvedProps[key] = this.resolveSchema(value, visited);
      }
      return { ...schema, properties: resolvedProps };
    }
    
    if (schema.allOf) {
      const merged = { type: 'object', properties: {} };
      for (const item of schema.allOf) {
        const resolved = this.resolveSchema(item, visited);
        if (resolved?.properties) {
          Object.assign(merged.properties, resolved.properties);
        }
      }
      return merged;
    }
    
    return schema;
  }

  /**
   * Generate example JSON from a schema
   */
  generateExample(schema, depth = 0) {
    if (!schema || depth > 5) return null;
    
    const resolved = this.resolveSchema(schema);
    if (!resolved) return null;

    // Use example if provided
    if (resolved.example !== undefined) {
      return resolved.example;
    }

    switch (resolved.type) {
      case 'string':
        if (resolved.enum) return resolved.enum[0];
        if (resolved.format === 'date') return '2024-05-01';
        if (resolved.format === 'date-time') return '2024-05-01T12:00:00Z';
        if (resolved.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
        return 'string';
      
      case 'number':
      case 'integer':
        return resolved.example || 0;
      
      case 'boolean':
        return true;
      
      case 'array':
        const itemExample = this.generateExample(resolved.items, depth + 1);
        return itemExample !== null ? [itemExample] : [];
      
      case 'object':
        if (!resolved.properties) return {};
        const obj = {};
        for (const [key, prop] of Object.entries(resolved.properties)) {
          const example = this.generateExample(prop, depth + 1);
          if (example !== null) {
            obj[key] = example;
          }
        }
        return obj;
      
      default:
        return null;
    }
  }

  /**
   * Get endpoints grouped by tags
   */
  getEndpointsByTags() {
    const tagMap = new Map();
    
    // Initialize with tag metadata
    for (const tag of this.spec.tags || []) {
      tagMap.set(tag.name, {
        name: tag.name,
        description: tag.description,
        endpoints: []
      });
    }
    
    // Group endpoints by tags
    for (const [path, methods] of Object.entries(this.spec.paths || {})) {
      for (const [method, endpoint] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const tags = endpoint.tags || ['Other'];
          for (const tag of tags) {
            if (!tagMap.has(tag)) {
              tagMap.set(tag, { name: tag, description: '', endpoints: [] });
            }
            tagMap.get(tag).endpoints.push({
              path,
              method,
              ...endpoint
            });
          }
        }
      }
    }
    
    return Array.from(tagMap.values());
  }

  /**
   * Get webhooks if defined
   */
  getWebhooks() {
    const webhooks = [];
    for (const [name, webhook] of Object.entries(this.spec.webhooks || {})) {
      for (const [method, details] of Object.entries(webhook)) {
        webhooks.push({
          name,
          method,
          ...details
        });
      }
    }
    return webhooks;
  }

  /**
   * Get OAuth2 security scheme info if defined
   */
  getOAuth2Config() {
    const securitySchemes = this.spec.components?.securitySchemes || {};
    
    for (const [name, scheme] of Object.entries(securitySchemes)) {
      if (scheme.type === 'oauth2' && scheme.flows) {
        // Check for client credentials flow first (most common for API-to-API)
        if (scheme.flows.clientCredentials) {
          const flow = scheme.flows.clientCredentials;
          return {
            name,
            type: 'clientCredentials',
            tokenUrl: flow.tokenUrl,
            scopes: flow.scopes || {},
            refreshUrl: flow.refreshUrl
          };
        }
        
        // Check for password flow
        if (scheme.flows.password) {
          const flow = scheme.flows.password;
          return {
            name,
            type: 'password',
            tokenUrl: flow.tokenUrl,
            scopes: flow.scopes || {},
            refreshUrl: flow.refreshUrl
          };
        }
        
        // Check for authorization code flow
        if (scheme.flows.authorizationCode) {
          const flow = scheme.flows.authorizationCode;
          return {
            name,
            type: 'authorizationCode',
            authorizationUrl: flow.authorizationUrl,
            tokenUrl: flow.tokenUrl,
            scopes: flow.scopes || {},
            refreshUrl: flow.refreshUrl
          };
        }
        
        // Check for implicit flow
        if (scheme.flows.implicit) {
          const flow = scheme.flows.implicit;
          return {
            name,
            type: 'implicit',
            authorizationUrl: flow.authorizationUrl,
            scopes: flow.scopes || {},
            refreshUrl: flow.refreshUrl
          };
        }
      }
      
      // Also support HTTP bearer scheme info
      if (scheme.type === 'http' && scheme.scheme === 'bearer') {
        return {
          name,
          type: 'bearer',
          description: scheme.description
        };
      }
    }
    
    return null;
  }
}

// ============================================
// Code Generators
// ============================================

class CodeGenerator {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate cURL command
   */
  generateCurl(method, path, requestBody = null, parameters = []) {
    const url = `${this.baseUrl}${path}`;
    let curl = `curl -X ${method.toUpperCase()} "${url}"`;
    curl += ` \\\n  -H "Authorization: Bearer YOUR_TOKEN"`;
    curl += ` \\\n  -H "Content-Type: application/json"`;
    
    if (requestBody) {
      const body = JSON.stringify(requestBody, null, 2)
        .split('\n')
        .map((line, i) => i === 0 ? line : '  ' + line)
        .join('\n');
      curl += ` \\\n  -d '${body}'`;
    }
    
    return curl;
  }

  /**
   * Generate JavaScript fetch code
   */
  generateJavaScript(method, path, requestBody = null, parameters = []) {
    const url = `${this.baseUrl}${path}`;
    let code = `const response = await fetch("${url}", {
  method: "${method.toUpperCase()}",
  headers: {
    "Authorization": "Bearer YOUR_TOKEN",
    "Content-Type": "application/json"
  }`;
    
    if (requestBody) {
      code += `,
  body: JSON.stringify(${JSON.stringify(requestBody, null, 4).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')})`;
    }
    
    code += `
});

const data = await response.json();
console.log(data);`;
    
    return code;
  }

  /**
   * Generate Python requests code
   */
  generatePython(method, path, requestBody = null, parameters = []) {
    const url = `${this.baseUrl}${path}`;
    let code = `import requests

headers = {
    "Authorization": "Bearer YOUR_TOKEN",
    "Content-Type": "application/json"
}
`;
    
    if (requestBody) {
      code += `
payload = ${JSON.stringify(requestBody, null, 4)}

response = requests.${method.toLowerCase()}("${url}", headers=headers, json=payload)`;
    } else {
      code += `
response = requests.${method.toLowerCase()}("${url}", headers=headers)`;
    }
    
    code += `
data = response.json()
print(data)`;
    
    return code;
  }
}

// ============================================
// Syntax Highlighter
// ============================================

function highlightJSON(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          match = match.replace(/:$/, '');
          return `<span class="${cls}">${match}</span><span class="json-punctuation">:</span>`;
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    })
    .replace(/([{}\[\],])/g, '<span class="json-punctuation">$1</span>');
}

/**
 * Syntax highlight shell/cURL commands
 */
function highlightShell(code) {
  // Escape HTML entities first
  code = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Extract strings into tokens to prevent regex overlap with generated HTML
  const tokens = [];
  code = code.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, (match) => {
    const idx = tokens.length;
    tokens.push(`<span class="sh-string">${match}</span>`);
    return `__SH_TOKEN_${idx}__`;
  });

  // Apply other highlighting rules
  code = code
    // Commands at start of line or after pipe/semicolon
    .replace(/\b(curl|wget|http|echo|cat|grep|awk|sed|jq)\b/g, '<span class="sh-command">$1</span>')
    // Flags/options
    .replace(/(\s)(-{1,2}[a-zA-Z][-a-zA-Z0-9]*)/g, '$1<span class="sh-flag">$2</span>')
    // HTTP methods
    .replace(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g, '<span class="sh-method">$1</span>')
    // Line continuation
    .replace(/\\\n/g, '<span class="sh-escape">\\</span>\n');

  // Restore tokens
  return code.replace(/__SH_TOKEN_(\d+)__/g, (_, idx) => tokens[parseInt(idx)]);
}

/**
 * Syntax highlight JavaScript code
 */
function highlightJavaScript(code) {
  // Escape HTML entities first
  code = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Extract comments and strings into tokens to prevent regex overlap with generated HTML
  const tokens = [];
  code = code.replace(/\/\/.*$|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/gm, (match) => {
    const idx = tokens.length;
    if (match.startsWith('//')) {
      tokens.push(`<span class="js-comment">${match}</span>`);
    } else {
      tokens.push(`<span class="js-string">${match}</span>`);
    }
    return `__JS_TOKEN_${idx}__`;
  });

  // Apply other highlighting rules
  code = code
    // Keywords
    .replace(/\b(const|let|var|function|async|await|return|if|else|for|while|try|catch|throw|new|class|import|export|from|default)\b/g, '<span class="js-keyword">$1</span>')
    // Built-in objects/methods
    .replace(/\b(console|fetch|JSON|Promise|Array|Object|String|Number|Boolean|Math|Date|Error)\b/g, '<span class="js-builtin">$1</span>')
    // Function calls
    .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, '<span class="js-function">$1</span>(')
    // Numbers
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="js-number">$1</span>')
    // Properties after dot
    .replace(/\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, '.<span class="js-property">$1</span>');

  // Restore tokens
  return code.replace(/__JS_TOKEN_(\d+)__/g, (_, idx) => tokens[parseInt(idx)]);
}

/**
 * Syntax highlight Python code
 */
function highlightPython(code) {
  // Escape HTML entities first
  code = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Extract comments and strings into tokens to prevent regex overlap with generated HTML
  // Order: triple quotes first (they contain single/double quotes), then comments, then regular strings
  const tokens = [];
  code = code.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""|#.*$|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/gm, (match) => {
    const idx = tokens.length;
    if (match.startsWith('#')) {
      tokens.push(`<span class="py-comment">${match}</span>`);
    } else {
      tokens.push(`<span class="py-string">${match}</span>`);
    }
    return `__PY_TOKEN_${idx}__`;
  });

  // Apply other highlighting rules
  code = code
    // Keywords
    .replace(/\b(import|from|as|def|class|return|if|elif|else|for|while|try|except|raise|with|lambda|True|False|None|and|or|not|in|is)\b/g, '<span class="py-keyword">$1</span>')
    // Built-in functions
    .replace(/\b(print|len|range|str|int|float|list|dict|tuple|set|open|input|type|isinstance)\b/g, '<span class="py-builtin">$1</span>')
    // Function/method calls
    .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, '<span class="py-function">$1</span>(')
    // Numbers
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="py-number">$1</span>')
    // Decorators
    .replace(/(@[a-zA-Z_][a-zA-Z0-9_]*)/g, '<span class="py-decorator">$1</span>');

  // Restore tokens
  return code.replace(/__PY_TOKEN_(\d+)__/g, (_, idx) => tokens[parseInt(idx)]);
}

// ============================================
// Markdown Parser (simple)
// ============================================

function parseMarkdown(text) {
  if (!text) return '';
  
  // First, extract code blocks and replace with placeholders to protect them
  // Handle various formats: ```json\n...\n```, ```json ...```, etc.
  const codeBlocks = [];
  let processed = text.replace(/```(\w+)?[\s\r\n]+([\s\S]*?)```/g, (match, lang, code) => {
    const index = codeBlocks.length;
    // Apply syntax highlighting based on language
    let highlighted;
    const langLower = (lang || '').toLowerCase();
    switch (langLower) {
      case 'json':
        highlighted = highlightJSON(code.trim());
        break;
      case 'javascript':
      case 'js':
        highlighted = highlightJavaScript(code.trim());
        break;
      case 'python':
      case 'py':
        highlighted = highlightPython(code.trim());
        break;
      case 'bash':
      case 'shell':
      case 'sh':
      case 'curl':
        highlighted = highlightShell(code.trim());
        break;
      default:
        highlighted = escapeHtml(code.trim());
    }
    codeBlocks.push(`<pre><code class="language-${langLower || 'text'}">${highlighted}</code></pre>`);
    return `\n__CODE_BLOCK_${index}__\n`;
  });
  
  // Normalize line endings and collapse multiple blank lines between list items
  // This handles cases where numbered lists have blank lines between items
  processed = processed.replace(/(\d+\.\s+[^\n]+)\n\n+(?=\d+\.)/g, '$1\n');
  processed = processed.replace(/(-\s+[^\n]+)\n\n+(?=-\s+)/g, '$1\n');
  
  processed = processed
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?!CODE_BLOCK)(.+?)__/g, '<strong>$1</strong>')
    // Italic (be careful not to match underscores in code placeholders)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Aside blocks
    .replace(/<aside>([\s\S]*?)<\/aside>/g, '<aside>$1</aside>');
  
  // Handle numbered lists - convert to <ol>
  processed = processed.replace(/(^\d+\.\s+.+$\n?)+/gm, (match) => {
    const items = match.trim().split('\n')
      .filter(line => line.trim())
      .map(line => `<li>${line.replace(/^\d+\.\s+/, '')}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  });
  
  // Handle bullet lists - convert to <ul>
  processed = processed.replace(/(^\s*-\s+.+$\n?)+/gm, (match) => {
    const items = match.trim().split('\n')
      .filter(line => line.trim())
      .map(line => `<li>${line.replace(/^\s*-\s+/, '')}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  });
  
  // Split by double newlines for paragraphs, but be smarter about it
  const blocks = processed.split(/\n\n+/);
  processed = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    // Don't wrap if already wrapped in block-level element
    if (/^<(h[1-6]|ul|ol|li|pre|aside|div|p|__CODE)/.test(block)) {
      return block;
    }
    // Wrap in paragraph
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  
  // Restore code blocks
  codeBlocks.forEach((code, index) => {
    processed = processed.replace(`__CODE_BLOCK_${index}__`, code);
    // Also clean up any paragraph wrapper around code blocks
    processed = processed.replace(`<p>${code}</p>`, code);
  });
  
  // Clean up
  processed = processed
    .replace(/<p><\/p>/g, '')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<br>\s*<\/p>/g, '</p>');
  
  return processed;
}

// ============================================
// DOM Renderer
// ============================================

class DocumentationRenderer {
  constructor(parser, codeGen) {
    this.parser = parser;
    this.codeGen = codeGen;
    this.activeEndpoints = new Set();
  }

  /**
   * Generate unique ID for an endpoint
   */
  getEndpointId(method, path) {
    return `${method}-${path.replace(/[{}\/]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '')}`;
  }

  /**
   * Render the navigation sidebar
   */
  renderNavigation(tagGroups, webhooks) {
    const nav = document.getElementById('nav');
    let html = '';
    
    // Overview link
    html += `
      <a href="#overview" class="nav-item" data-section="overview">
        <span class="nav-path">Overview</span>
      </a>
    `;
    
    // Tag sections
    for (const group of tagGroups) {
      if (group.endpoints.length === 0) continue;
      
      const sectionId = `tag-${group.name.toLowerCase().replace(/\s+/g, '-')}`;
      html += `
        <div class="nav-section" data-section="${sectionId}">
          <div class="nav-section-header">
            <span class="nav-section-title">${group.name}</span>
            <svg class="nav-section-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div class="nav-items">
      `;
      
      for (const endpoint of group.endpoints) {
        const id = this.getEndpointId(endpoint.method, endpoint.path);
        html += `
          <a href="#${id}" class="nav-item" data-endpoint="${id}">
            <span class="nav-method ${endpoint.method}">${endpoint.method}</span>
            <span class="nav-path">${endpoint.summary || endpoint.path}</span>
          </a>
        `;
      }
      
      html += '</div></div>';
    }
    
    // Webhooks section
    if (webhooks.length > 0) {
      html += `
        <div class="nav-section" data-section="webhooks">
          <div class="nav-section-header">
            <span class="nav-section-title">Webhooks</span>
            <svg class="nav-section-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div class="nav-items">
      `;
      
      for (const webhook of webhooks) {
        const id = `webhook-${webhook.name}`;
        html += `
          <a href="#${id}" class="nav-item" data-webhook="${id}">
            <span class="webhook-badge">WH</span>
            <span class="nav-path">${webhook.summary || webhook.name}</span>
          </a>
        `;
      }
      
      html += '</div></div>';
    }
    
    nav.innerHTML = html;
    
    // Add click handlers for collapsible sections
    nav.querySelectorAll('.nav-section-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('collapsed');
      });
    });
  }

  /**
   * Render parameters table
   */
  renderParameters(parameters) {
    if (!parameters || parameters.length === 0) return '';
    
    let html = `
      <div class="params-section">
        <h3 class="params-title">Parameters</h3>
        <table class="params-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    for (const param of parameters) {
      const schema = param.schema || {};
      const type = schema.type || 'string';
      const required = param.required ? '<span class="param-required">required</span>' : '';
      const deprecated = param.deprecated ? '<span class="param-deprecated">deprecated</span>' : '';
      
      let enumHtml = '';
      if (schema.enum) {
        enumHtml = `
          <div class="param-enum">
            <span class="param-enum-label">Possible values:</span>
            <div class="param-enum-values">
              ${schema.enum.map(v => `<span class="param-enum-value">${v}</span>`).join('')}
            </div>
          </div>
        `;
      }
      
      html += `
        <tr>
          <td data-label="Name">
            <span class="param-name">${param.name}</span>${required}${deprecated}
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              in ${param.in}
            </div>
          </td>
          <td data-label="Type"><span class="param-type">${type}</span></td>
          <td data-label="Description">
            <span class="param-description">${param.description || schema.description || ''}</span>
            ${enumHtml}
          </td>
        </tr>
      `;
    }
    
    html += '</tbody></table></div>';
    return html;
  }

  /**
   * Render request body schema
   */
  renderRequestBody(requestBody) {
    if (!requestBody) return '';
    
    const content = requestBody.content?.['application/json'];
    if (!content?.schema) return '';
    
    const schema = this.parser.resolveSchema(content.schema);
    if (!schema?.properties) return '';
    
    return this.renderSchemaProperties('Request Body', schema);
  }

  /**
   * Render schema properties
   */
  renderSchemaProperties(title, schema, depth = 0) {
    if (!schema?.properties) return '';
    
    let html = `
      <div class="schema-section" style="margin-left: ${depth * 1.5}rem;">
        <h3 class="schema-title">${title}</h3>
    `;
    
    const required = schema.required || [];
    
    for (const [name, prop] of Object.entries(schema.properties)) {
      const resolvedProp = this.parser.resolveSchema(prop);
      const isRequired = required.includes(name);
      const deprecated = resolvedProp?.deprecated ? '<span class="param-deprecated">deprecated</span>' : '';
      
      let typeStr = resolvedProp?.type || 'any';
      if (typeStr === 'array' && resolvedProp?.items?.type) {
        typeStr = `${resolvedProp.items.type}[]`;
      }
      
      let enumHtml = '';
      if (resolvedProp?.enum) {
        enumHtml = `
          <div class="param-enum">
            <span class="param-enum-label">Values:</span>
            <div class="param-enum-values">
              ${resolvedProp.enum.map(v => `<span class="param-enum-value">${v}</span>`).join('')}
            </div>
          </div>
        `;
      }
      
      html += `
        <div class="schema-property">
          <div class="schema-property-header">
            <span class="schema-property-name">${name}</span>
            ${isRequired ? '<span class="param-required">required</span>' : ''}
            ${deprecated}
            <span class="schema-property-type">${typeStr}</span>
          </div>
          <div class="schema-property-description">
            ${resolvedProp?.description || ''}
            ${enumHtml}
          </div>
        </div>
      `;
      
      // Render nested object properties
      if (resolvedProp?.type === 'object' && resolvedProp?.properties && depth < 2) {
        html += this.renderSchemaProperties('', resolvedProp, depth + 1);
      }
      
      // Render array item properties
      if (resolvedProp?.type === 'array' && resolvedProp?.items?.properties && depth < 2) {
        html += this.renderSchemaProperties('Array Items', resolvedProp.items, depth + 1);
      }
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Render schema properties in a compact format for right sidebar
   * Handles objects, arrays, allOf, oneOf, anyOf compositions
   */
  renderSchemaPropertiesCompact(schema, depth = 0) {
    if (!schema) return '';

    // Handle allOf - merge all schemas
    if (schema.allOf && Array.isArray(schema.allOf)) {
      let merged = { properties: {}, required: [] };
      for (const subSchema of schema.allOf) {
        const resolved = this.parser.resolveSchema(subSchema);
        if (resolved?.properties) {
          merged.properties = { ...merged.properties, ...resolved.properties };
        }
        if (resolved?.required) {
          merged.required = [...merged.required, ...resolved.required];
        }
      }
      if (Object.keys(merged.properties).length > 0) {
        return this.renderSchemaPropertiesCompact(merged, depth);
      }
    }

    // Handle oneOf/anyOf - show first option or indicate multiple options
    if ((schema.oneOf || schema.anyOf) && Array.isArray(schema.oneOf || schema.anyOf)) {
      const options = schema.oneOf || schema.anyOf;
      const firstOption = this.parser.resolveSchema(options[0]);
      if (firstOption) {
        return this.renderSchemaPropertiesCompact(firstOption, depth);
      }
    }

    // Handle arrays - render the items schema
    if (schema.type === 'array' && schema.items) {
      const itemSchema = this.parser.resolveSchema(schema.items);
      if (itemSchema?.properties) {
        let html = `<div class="schema-compact" style="margin-left: ${depth * 0.75}rem;">`;
        html += `<div class="schema-compact-array-label">Array of:</div>`;
        html += this.renderSchemaPropertiesCompact(itemSchema, depth);
        html += '</div>';
        return html;
      } else if (itemSchema?.type) {
        return `<div class="schema-compact"><div class="schema-compact-property"><span class="schema-compact-type">${itemSchema.type}[]</span></div></div>`;
      }
    }

    // Handle objects with properties
    if (!schema.properties) return '';

    const required = schema.required || [];
    let html = `<div class="schema-compact" style="margin-left: ${depth * 0.75}rem;">`;

    for (const [name, prop] of Object.entries(schema.properties)) {
      const resolvedProp = this.parser.resolveSchema(prop);
      const isRequired = required.includes(name);

      let typeStr = resolvedProp?.type || 'any';
      if (typeStr === 'array' && resolvedProp?.items?.type) {
        typeStr = `${resolvedProp.items.type}[]`;
      } else if (typeStr === 'array' && resolvedProp?.items?.$ref) {
        const itemSchema = this.parser.resolveSchema(resolvedProp.items);
        typeStr = `${itemSchema?.title || 'object'}[]`;
      }

      html += `
        <div class="schema-compact-property">
          <div class="schema-compact-header">
            <span class="schema-compact-name">${name}</span>
            ${isRequired ? '<span class="param-required">required</span>' : ''}
            <span class="schema-compact-type">${typeStr}</span>
          </div>
          ${resolvedProp?.description ? `<div class="schema-compact-desc">${resolvedProp.description}</div>` : ''}
        </div>
      `;

      // Handle nested objects (limit depth to avoid clutter)
      if (resolvedProp?.type === 'object' && resolvedProp?.properties && depth < 2) {
        html += this.renderSchemaPropertiesCompact(resolvedProp, depth + 1);
      }

      // Handle array items
      if (resolvedProp?.type === 'array' && resolvedProp?.items && depth < 2) {
        const itemSchema = this.parser.resolveSchema(resolvedProp.items);
        if (itemSchema?.properties) {
          html += this.renderSchemaPropertiesCompact(itemSchema, depth + 1);
        }
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * Render responses section
   */
  renderResponses(responses) {
    if (!responses) return '';
    
    let html = '<div class="responses-section"><h3 class="responses-title">Responses</h3>';
    
    for (const [code, response] of Object.entries(responses)) {
      const codeClass = code.startsWith('2') ? 'success' : 
                       code.startsWith('3') ? 'redirect' : 'error';
      
      html += `
        <div class="response-item">
          <div class="response-header">
            <span class="response-code ${codeClass}">${code}</span>
            <span class="response-description">${response.description || ''}</span>
          </div>
        </div>
      `;
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Render code examples panel
   */
  renderCodePanel(method, path, requestBody, responses) {
    const tabId = `tabs-${this.getEndpointId(method, path)}`;
    const example = requestBody ? this.parser.generateExample(
      this.parser.resolveSchema(requestBody.content?.['application/json']?.schema)
    ) : null;
    
    const curl = this.codeGen.generateCurl(method, path, example);
    const js = this.codeGen.generateJavaScript(method, path, example);
    const python = this.codeGen.generatePython(method, path, example);
    
    let html = `
      <div class="code-panel">
        <div class="code-tabs" role="tablist" aria-label="Code examples">
          <button class="code-tab active" data-tab="${tabId}-curl" role="tab" aria-selected="true">cURL</button>
          <button class="code-tab" data-tab="${tabId}-js" role="tab" aria-selected="false">JavaScript</button>
          <button class="code-tab" data-tab="${tabId}-python" role="tab" aria-selected="false">Python</button>
        </div>
        <div class="code-panel-header" style="border-top: 1px solid var(--border-color);">
          <span>Request</span>
          <button class="copy-button" data-copy="${tabId}" aria-label="Copy code to clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copy
          </button>
        </div>
        <div id="${tabId}-curl" class="code-tab-content active">
          <pre class="code-block"><code>${highlightShell(curl)}</code></pre>
        </div>
        <div id="${tabId}-js" class="code-tab-content">
          <pre class="code-block"><code>${highlightJavaScript(js)}</code></pre>
        </div>
        <div id="${tabId}-python" class="code-tab-content">
          <pre class="code-block"><code>${highlightPython(python)}</code></pre>
        </div>
      </div>
    `;
    
    // Response example
    const successResponse = responses?.['200'] || responses?.['201'];
    if (successResponse?.content?.['application/json']?.schema) {
      const responseExample = this.parser.generateExample(
        this.parser.resolveSchema(successResponse.content['application/json'].schema)
      );
      
      if (responseExample) {
        const responseId = `response-${this.getEndpointId(method, path)}`;
        html += `
          <div class="code-panel">
            <div class="code-panel-header">
              <span>Response</span>
              <button class="copy-button" data-copy-json="${responseId}" aria-label="Copy response to clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copy
              </button>
            </div>
            <pre class="code-block" id="${responseId}"><code>${highlightJSON(responseExample)}</code></pre>
          </div>
        `;
      }
    }
    
    // Response schema properties (after JSON example)
    html += this.renderResponseSchema(responses);

    return html;
  }

  /**
   * Render response schema properties for the right sidebar
   */
  renderResponseSchema(responses) {
    if (!responses) return '';

    let html = '';

    // Iterate through all responses (not just 200/201)
    for (const [code, response] of Object.entries(responses)) {
      const content = response.content?.['application/json'];
      if (!content?.schema) continue;

      const schema = this.parser.resolveSchema(content.schema);
      if (!schema) continue;

      // Determine badge style based on status code
      const codeClass = code.startsWith('2') ? 'success' :
                       code.startsWith('3') ? 'redirect' : 'error';

      // Get the schema content - handles objects, arrays, allOf, etc.
      const schemaContent = this.renderSchemaPropertiesCompact(schema);
      if (!schemaContent) continue;

      html += `
        <div class="response-schema-section">
          <div class="response-schema-header">
            <span class="response-code ${codeClass}">${code}</span>
            <span class="response-schema-title">Response Schema</span>
          </div>
          ${schemaContent}
        </div>
      `;
    }

    return html;
  }

  /**
   * Render security info
   */
  renderSecurity(security) {
    if (!security || security.length === 0) return '';
    
    return `
      <div class="security-section">
        <div class="security-title">Authorization</div>
        <div class="security-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          Bearer Token (OAuth 2.0)
        </div>
      </div>
    `;
  }

  /**
   * Render Try It panel for an endpoint
   */
  renderTryItPanel(endpoint) {
    const id = this.getEndpointId(endpoint.method, endpoint.path);
    const parameters = endpoint.parameters || [];
    
    // Separate parameters by location
    const pathParams = parameters.filter(p => p.in === 'path');
    const queryParams = parameters.filter(p => p.in === 'query');
    const headerParams = parameters.filter(p => p.in === 'header');
    
    let paramsHtml = '';
    
    // Path parameters
    if (pathParams.length > 0) {
      paramsHtml += `
        <div class="try-it-params">
          <div class="try-it-params-title">Path Parameters</div>
          ${pathParams.map(param => this.renderTryItParam(param, id)).join('')}
        </div>
      `;
    }
    
    // Query parameters
    if (queryParams.length > 0) {
      paramsHtml += `
        <div class="try-it-params">
          <div class="try-it-params-title">Query Parameters</div>
          ${queryParams.map(param => this.renderTryItParam(param, id)).join('')}
        </div>
      `;
    }
    
    // Header parameters
    if (headerParams.length > 0) {
      paramsHtml += `
        <div class="try-it-params">
          <div class="try-it-params-title">Header Parameters</div>
          ${headerParams.map(param => this.renderTryItParam(param, id)).join('')}
        </div>
      `;
    }
    
    // Request body
    let bodyHtml = '';
    if (endpoint.requestBody) {
      const content = endpoint.requestBody.content?.['application/json'];
      const schema = content?.schema;
      const example = schema ? this.parser.generateExample(this.parser.resolveSchema(schema)) : null;
      
      bodyHtml = `
        <div class="try-it-body">
          <div class="try-it-body-title">Request Body</div>
          <textarea 
            id="try-it-body-${id}" 
            data-endpoint="${id}"
            placeholder='{"key": "value"}'
          >${example ? JSON.stringify(example, null, 2) : ''}</textarea>
        </div>
      `;
    }
    
    return `
      <div class="try-it-section">
        <button class="try-it-toggle" data-try-it="${id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Try It
        </button>
        <div class="try-it-panel" id="try-it-panel-${id}" 
             data-method="${endpoint.method}" 
             data-path="${endpoint.path}">
          <div class="try-it-no-auth" id="try-it-auth-warning-${id}" style="display: none;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            No authentication configured. Set a token in the sidebar.
          </div>
          ${paramsHtml}
          ${bodyHtml}
          <button class="try-it-execute" data-execute="${id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13"/>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            Send Request
          </button>
          <div class="try-it-response" id="try-it-response-${id}" style="display: none;">
            <div class="try-it-response-header">
              <span class="try-it-response-title">Response</span>
              <span class="try-it-response-status" id="try-it-status-${id}"></span>
            </div>
            <div class="try-it-response-body">
              <pre><code id="try-it-response-body-${id}"></code></pre>
            </div>
            <div class="try-it-response-time" id="try-it-time-${id}"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a single Try It parameter input
   */
  renderTryItParam(param, endpointId) {
    const schema = param.schema || {};
    const type = schema.type || 'string';
    const required = param.required ? '<span class="try-it-param-required">required</span>' : '';
    const inputId = `try-it-param-${endpointId}-${param.in}-${param.name}`;
    
    let inputHtml = '';
    
    if (schema.enum) {
      // Render as select dropdown
      inputHtml = `
        <select id="${inputId}" data-param-name="${param.name}" data-param-in="${param.in}">
          <option value="">-- Select --</option>
          ${schema.enum.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      `;
    } else {
      // Render as text input
      const placeholder = schema.example !== undefined ? schema.example : (param.description || param.name);
      inputHtml = `
        <input 
          type="${type === 'integer' || type === 'number' ? 'number' : 'text'}" 
          id="${inputId}" 
          data-param-name="${param.name}" 
          data-param-in="${param.in}"
          placeholder="${escapeHtml(String(placeholder))}"
        >
      `;
    }
    
    return `
      <div class="try-it-param">
        <div class="try-it-param-header">
          <span class="try-it-param-name">${param.name}</span>
          ${required}
          <span class="try-it-param-type">${type}</span>
        </div>
        ${inputHtml}
      </div>
    `;
  }

  /**
   * Render a single endpoint
   */
  renderEndpoint(endpoint) {
    const id = this.getEndpointId(endpoint.method, endpoint.path);
    
    return `
      <section class="endpoint-section" id="${id}">
        <div class="content-wrapper">
          <div class="content-left">
            <div class="endpoint-header">
              <span class="method-badge ${endpoint.method}">${endpoint.method.toUpperCase()}</span>
              <span class="endpoint-path">${endpoint.path}</span>
            </div>
            <h2 class="section-title">${endpoint.summary || ''}</h2>
            <div class="description">${parseMarkdown(endpoint.description || '')}</div>
            ${this.renderParameters(endpoint.parameters)}
            ${this.renderRequestBody(endpoint.requestBody)}
            ${this.renderResponses(endpoint.responses)}
            ${this.renderSecurity(endpoint.security)}
            ${this.renderTryItPanel(endpoint)}
            ${this.renderCallbacks(endpoint.callbacks, id)}
          </div>
          <div class="content-right">
            ${this.renderCodePanel(endpoint.method, endpoint.path, endpoint.requestBody, endpoint.responses)}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render callbacks for an endpoint
   */
  renderCallbacks(callbacks, parentEndpointId) {
    if (!callbacks || Object.keys(callbacks).length === 0) return '';

    let html = `
      <div class="callbacks-section">
        <h3 class="callbacks-title">Callbacks</h3>
        <p class="callbacks-description">These webhooks will be called by the server when this operation triggers events.</p>
    `;

    for (const [callbackName, callbackPaths] of Object.entries(callbacks)) {
      // Each callback has URL expressions as keys
      for (const [urlExpression, methods] of Object.entries(callbackPaths)) {
        // Each URL expression can have multiple HTTP methods
        for (const [method, operation] of Object.entries(methods)) {
          const callbackId = `callback-${parentEndpointId}-${callbackName}`;

          html += `
            <div class="callback-item" id="${callbackId}">
              <div class="callback-header">
                <span class="callback-badge">CALLBACK</span>
                <span class="callback-name">${callbackName}</span>
              </div>
              <div class="callback-url">
                <span class="callback-url-label">URL Expression:</span>
                <code class="callback-url-value">${escapeHtml(urlExpression)}</code>
              </div>
              <div class="callback-method">
                <span class="method-badge ${method}">${method.toUpperCase()}</span>
              </div>
              ${operation.summary ? `<div class="callback-summary">${operation.summary}</div>` : ''}
              ${operation.description ? `<div class="callback-description">${parseMarkdown(operation.description)}</div>` : ''}
          `;

          // Render callback parameters if present
          if (operation.parameters && operation.parameters.length > 0) {
            html += `
              <div class="callback-parameters">
                <h4 class="callback-section-title">Parameters</h4>
            `;
            for (const param of operation.parameters) {
              html += `
                <div class="callback-param">
                  <span class="callback-param-name">${param.name}</span>
                  <span class="callback-param-in">${param.in}</span>
                  ${param.required ? '<span class="param-required">required</span>' : ''}
                  <span class="callback-param-type">${param.schema?.type || 'string'}</span>
                  ${param.description ? `<div class="callback-param-desc">${param.description}</div>` : ''}
                </div>
              `;
            }
            html += '</div>';
          }

          // Render callback request body (what server sends to callback URL)
          if (operation.requestBody?.content?.['application/json']?.schema) {
            const schema = this.parser.resolveSchema(operation.requestBody.content['application/json'].schema);
            html += `
              <div class="callback-payload">
                <h4 class="callback-section-title">Callback Payload</h4>
                <p class="callback-payload-desc">The server will send this payload to your callback URL:</p>
                ${this.renderSchemaProperties('', schema)}
              </div>
            `;

            // Also render example JSON
            const example = this.parser.generateExample(schema);
            if (example) {
              html += `
                <div class="callback-example">
                  <div class="code-panel">
                    <div class="code-panel-header">
                      <span>Callback Payload Example</span>
                      <button class="copy-button" data-copy-json="${callbackId}-payload" aria-label="Copy callback payload">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        Copy
                      </button>
                    </div>
                    <pre class="code-block" id="${callbackId}-payload"><code>${highlightJSON(example)}</code></pre>
                  </div>
                </div>
              `;
            }
          }

          // Render expected responses from callback
          if (operation.responses) {
            html += `
              <div class="callback-responses">
                <h4 class="callback-section-title">Expected Responses</h4>
                <p class="callback-responses-desc">Your callback endpoint should return one of these responses:</p>
            `;

            for (const [code, response] of Object.entries(operation.responses)) {
              const codeClass = code.startsWith('2') ? 'success' :
                               code.startsWith('3') ? 'redirect' : 'error';
              html += `
                <div class="callback-response-item">
                  <span class="response-code ${codeClass}">${code}</span>
                  <span class="response-description">${response.description || ''}</span>
                </div>
              `;
            }

            html += '</div>';
          }

          html += '</div>'; // Close callback-item
        }
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * Render a webhook
   */
  renderWebhook(webhook) {
    const id = `webhook-${webhook.name}`;
    
    let responseExample = null;
    if (webhook.requestBody?.content?.['application/json']?.schema) {
      responseExample = this.parser.generateExample(
        this.parser.resolveSchema(webhook.requestBody.content['application/json'].schema)
      );
    }
    
    return `
      <section class="webhook-section" id="${id}">
        <div class="content-wrapper">
          <div class="content-left">
            <div class="endpoint-header">
              <span class="webhook-badge">WEBHOOK</span>
            </div>
            <h2 class="section-title">${webhook.summary || webhook.name}</h2>
            <div class="description">${parseMarkdown(webhook.description || '')}</div>
            ${this.renderParameters(webhook.parameters)}
          </div>
          <div class="content-right">
            ${responseExample ? `
              <div class="code-panel">
                <div class="code-panel-header">
                  <span>Webhook Payload</span>
                  <button class="copy-button" data-copy-json="webhook-payload-${webhook.name}" aria-label="Copy webhook payload to clipboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    Copy
                  </button>
                </div>
                <pre class="code-block" id="webhook-payload-${webhook.name}"><code>${highlightJSON(responseExample)}</code></pre>
              </div>
            ` : ''}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Render all endpoints
   */
  renderAllEndpoints(tagGroups) {
    const container = document.getElementById('endpoints');
    let html = '';
    
    for (const group of tagGroups) {
      if (group.endpoints.length === 0) continue;
      
      const sectionId = `tag-${group.name.toLowerCase().replace(/\s+/g, '-')}`;
      
      // Tag header
      html += `
        <div class="tag-section" id="${sectionId}">
          <div class="tag-header">
            <h2 class="tag-title">${group.name}</h2>
            ${group.description && !group.description.includes('.md') ? 
              `<div class="tag-description">${group.description.split('\n')[0]}</div>` : ''}
          </div>
        </div>
      `;
      
      // Endpoints in this group
      for (const endpoint of group.endpoints) {
        html += this.renderEndpoint(endpoint);
      }
    }
    
    container.innerHTML = html;
  }

  /**
   * Render webhooks section
   */
  renderWebhooks(webhooks) {
    if (webhooks.length === 0) return;
    
    const container = document.getElementById('webhooks');
    let html = `
      <div class="tag-section" id="webhooks-section">
        <div class="tag-header">
          <h2 class="tag-title">Webhooks</h2>
          <div class="tag-description">Events sent to your server when data changes</div>
        </div>
      </div>
    `;
    
    for (const webhook of webhooks) {
      html += this.renderWebhook(webhook);
    }
    
    container.innerHTML = html;
  }
}

// ============================================
// Utilities
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Event Handlers
// ============================================

function setupEventListeners() {
  // Tab switching
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('code-tab')) {
      const tabId = e.target.dataset.tab;
      const tabContainer = e.target.closest('.code-panel');
      
      // Update active tab button
      tabContainer.querySelectorAll('.code-tab').forEach(tab => {
        const isActive = tab.dataset.tab === tabId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      
      // Update active tab content
      tabContainer.querySelectorAll('.code-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
      });
    }
  });
  
  // Copy button
  document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-button');
    if (!copyBtn) return;
    
    let text = '';
    
    if (copyBtn.dataset.copy) {
      const activeTab = document.querySelector(`#${copyBtn.dataset.copy}-curl.active, #${copyBtn.dataset.copy}-js.active, #${copyBtn.dataset.copy}-python.active`);
      if (activeTab) {
        text = activeTab.querySelector('code').textContent;
      }
    } else if (copyBtn.dataset.copyJson) {
      const codeBlock = document.getElementById(copyBtn.dataset.copyJson);
      if (codeBlock) {
        text = codeBlock.querySelector('code').textContent;
      }
    }
    
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Copied!
        `;
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copy
          `;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  });
  
  // Mobile menu toggle
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  
  mobileToggle?.addEventListener('click', () => {
    mobileToggle.classList.toggle('active');
    sidebar.classList.toggle('open');
  });
  
  // Close mobile menu when clicking a link
  sidebar?.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) {
      mobileToggle?.classList.remove('active');
      sidebar.classList.remove('open');
    }
  });
  
  // Active nav highlighting with Intersection Observer
  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
          const isActive = item.getAttribute('href') === `#${id}` ||
                          item.dataset.endpoint === id ||
                          item.dataset.webhook === id;
          item.classList.toggle('active', isActive);
        });
      }
    });
  }, observerOptions);
  
  // Observe all sections
  document.querySelectorAll('.endpoint-section, .webhook-section, .overview-section').forEach(section => {
    observer.observe(section);
  });
}

// ============================================
// Authentication Event Handlers
// ============================================

function setupAuthEventListeners() {
  // Auth section collapse/expand
  const authHeader = document.getElementById('authHeader');
  const authSection = document.getElementById('authSection');
  
  authHeader?.addEventListener('click', () => {
    authSection.classList.toggle('collapsed');
  });
  
  // Auth tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.authTab;
      
      // Update tabs
      document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.authTab === tabId);
      });
      
      // Update content
      document.getElementById('authTabToken').classList.toggle('active', tabId === 'token');
      document.getElementById('authTabOauth').classList.toggle('active', tabId === 'oauth');
    });
  });
  
  // Bearer token input - update on change
  const bearerTokenInput = document.getElementById('bearerToken');
  bearerTokenInput?.addEventListener('input', (e) => {
    const token = e.target.value.trim();
    if (token) {
      authManager.setToken(token);
    } else {
      authManager.clearToken();
    }
  });
  
  // Toggle password visibility
  document.querySelectorAll('.auth-toggle-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });
  
  // Generate OAuth2 token
  const generateBtn = document.getElementById('generateTokenBtn');
  const authStatus = document.getElementById('authStatus');
  
  generateBtn?.addEventListener('click', async () => {
    const tokenUrl = document.getElementById('tokenUrl')?.value.trim();
    const clientId = document.getElementById('clientId')?.value.trim();
    const clientSecret = document.getElementById('clientSecret')?.value.trim();
    const scope = document.getElementById('authScope')?.value.trim();
    
    // Validate inputs
    if (!tokenUrl) {
      showAuthStatus('error', 'Token URL is required');
      return;
    }
    if (!clientId) {
      showAuthStatus('error', 'Client ID is required');
      return;
    }
    if (!clientSecret) {
      showAuthStatus('error', 'Client Secret is required');
      return;
    }
    
    // Show loading state
    generateBtn.classList.add('loading');
    generateBtn.disabled = true;
    authStatus.className = 'auth-status';
    authStatus.style.display = 'none';
    
    try {
      const result = await authManager.generateToken(tokenUrl, clientId, clientSecret, scope);
      
      // Update bearer token input with the new token
      if (bearerTokenInput) {
        bearerTokenInput.value = result.access_token;
      }
      
      const expiryMsg = result.expires_in ? ` (expires in ${Math.round(result.expires_in / 60)} min)` : '';
      showAuthStatus('success', `Token generated successfully${expiryMsg}`);
      
    } catch (error) {
      showAuthStatus('error', `Failed: ${error.message}`);
    } finally {
      generateBtn.classList.remove('loading');
      generateBtn.disabled = false;
    }
  });
  
  function showAuthStatus(type, message) {
    authStatus.className = `auth-status ${type}`;
    authStatus.textContent = message;
    authStatus.style.display = 'block';
  }
}

// ============================================
// Try It Event Handlers
// ============================================

function setupTryItEventListeners(baseUrl) {
  // Toggle Try It panels
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.try-it-toggle');
    if (!toggleBtn) return;
    
    const endpointId = toggleBtn.dataset.tryIt;
    const panel = document.getElementById(`try-it-panel-${endpointId}`);
    const authWarning = document.getElementById(`try-it-auth-warning-${endpointId}`);
    
    if (panel) {
      const isOpen = panel.classList.toggle('open');
      toggleBtn.classList.toggle('active', isOpen);
      
      // Show/hide auth warning
      if (authWarning && isOpen) {
        authWarning.style.display = authManager.getToken() ? 'none' : 'flex';
      }
    }
  });
  
  // Update auth warnings when token changes
  authManager.subscribe((token) => {
    document.querySelectorAll('[id^="try-it-auth-warning-"]').forEach(warning => {
      if (warning.closest('.try-it-panel.open')) {
        warning.style.display = token ? 'none' : 'flex';
      }
    });
  });
  
  // Execute requests
  document.addEventListener('click', async (e) => {
    const executeBtn = e.target.closest('.try-it-execute');
    if (!executeBtn) return;
    
    const endpointId = executeBtn.dataset.execute;
    const panel = document.getElementById(`try-it-panel-${endpointId}`);
    
    if (!panel) return;
    
    const method = panel.dataset.method.toUpperCase();
    let path = panel.dataset.path;
    
    // Collect path parameters
    panel.querySelectorAll('[data-param-in="path"]').forEach(input => {
      const value = input.value.trim();
      if (value) {
        path = path.replace(`{${input.dataset.paramName}}`, encodeURIComponent(value));
      }
    });
    
    // Collect query parameters
    const queryParams = new URLSearchParams();
    panel.querySelectorAll('[data-param-in="query"]').forEach(input => {
      const value = input.value.trim();
      if (value) {
        queryParams.append(input.dataset.paramName, value);
      }
    });
    
    // Build URL
    let url = baseUrl + path;
    const queryString = queryParams.toString();
    if (queryString) {
      url += '?' + queryString;
    }
    
    // Collect headers
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add auth header if token is available
    const token = authManager.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Collect custom headers
    panel.querySelectorAll('[data-param-in="header"]').forEach(input => {
      const value = input.value.trim();
      if (value) {
        headers[input.dataset.paramName] = value;
      }
    });
    
    // Get request body
    const bodyTextarea = panel.querySelector('textarea[data-endpoint]');
    let body = null;
    if (bodyTextarea && bodyTextarea.value.trim()) {
      try {
        body = JSON.parse(bodyTextarea.value);
      } catch (err) {
        showTryItResponse(endpointId, 400, { error: 'Invalid JSON in request body' }, 0);
        return;
      }
    }
    
    // Show loading state
    executeBtn.classList.add('loading');
    executeBtn.disabled = true;
    
    const startTime = performance.now();
    
    try {
      const fetchOptions = {
        method,
        headers,
      };
      
      if (body && !['GET', 'HEAD'].includes(method)) {
        fetchOptions.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, fetchOptions);
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
      showTryItResponse(endpointId, response.status, responseData, duration);
      
    } catch (error) {
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      showTryItResponse(endpointId, 0, { error: error.message }, duration);
    } finally {
      executeBtn.classList.remove('loading');
      executeBtn.disabled = false;
    }
  });
  
  function showTryItResponse(endpointId, status, data, duration) {
    const responseContainer = document.getElementById(`try-it-response-${endpointId}`);
    const statusEl = document.getElementById(`try-it-status-${endpointId}`);
    const bodyEl = document.getElementById(`try-it-response-body-${endpointId}`);
    const timeEl = document.getElementById(`try-it-time-${endpointId}`);
    
    if (!responseContainer) return;
    
    responseContainer.style.display = 'block';
    
    // Status
    statusEl.textContent = status === 0 ? 'Error' : status;
    statusEl.className = `try-it-response-status ${status >= 200 && status < 300 ? 'success' : 'error'}`;
    
    // Body
    const formattedData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    bodyEl.innerHTML = typeof data === 'object' ? highlightJSON(data) : escapeHtml(formattedData);
    
    // Time
    timeEl.textContent = `Response time: ${duration}ms`;
  }
}

// ============================================
// OAuth2 Config from Spec
// ============================================

function setupOAuth2FromSpec(config) {
  const tokenUrlInput = document.getElementById('tokenUrl');
  const scopeInput = document.getElementById('authScope');
  const scopeHelpEl = document.getElementById('scopeHelp');
  
  // Pre-populate token URL
  if (config.tokenUrl && tokenUrlInput) {
    tokenUrlInput.value = config.tokenUrl;
    tokenUrlInput.placeholder = config.tokenUrl;
  }
  
  // Build scope list and pre-populate
  if (config.scopes && Object.keys(config.scopes).length > 0) {
    const scopeNames = Object.keys(config.scopes);
    
    // Pre-populate all scopes by default
    if (scopeInput) {
      scopeInput.value = scopeNames.join(' ');
      scopeInput.placeholder = scopeNames.join(' ');
    }
    
    // Show available scopes with descriptions
    if (scopeHelpEl) {
      let scopeHtml = '<div class="scope-list">';
      for (const [name, description] of Object.entries(config.scopes)) {
        // Truncate long descriptions
        const shortDesc = description && description.length > 40 
          ? description.substring(0, 37) + '...' 
          : description;
        scopeHtml += `
          <label class="scope-item" title="${escapeHtml(description || name)}">
            <input type="checkbox" value="${escapeHtml(name)}" checked>
            <span class="scope-name">${escapeHtml(name)}</span>
            ${shortDesc ? `<span class="scope-desc">— ${escapeHtml(shortDesc)}</span>` : ''}
          </label>
        `;
      }
      scopeHtml += '</div>';
      scopeHelpEl.innerHTML = scopeHtml;
      scopeHelpEl.style.display = 'block';
      
      // Update scope input when checkboxes change
      scopeHelpEl.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          const checkedScopes = Array.from(scopeHelpEl.querySelectorAll('input:checked'))
            .map(cb => cb.value);
          if (scopeInput) {
            scopeInput.value = checkedScopes.join(' ');
          }
        });
      });
    }
  }
  
  // Show indicator that config was loaded from spec
  const authSection = document.getElementById('authSection');
  if (authSection && config.tokenUrl) {
    const indicator = document.createElement('div');
    indicator.className = 'auth-spec-indicator';
    // indicator.innerHTML = `
    //   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    //     <path d="M20 6L9 17l-5-5"/>
    //   </svg>
    //   OAuth2 configured from spec
    // `;
    const authHeader = document.getElementById('authHeader');
    if (authHeader) {
      authHeader.appendChild(indicator);
    }
  }
  
  // If OAuth2 is configured, automatically switch to OAuth2 tab (but keep section collapsed)
  if (config.tokenUrl) {
    // Update tabs without triggering click (to avoid expanding)
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.authTab === 'oauth');
    });
    document.getElementById('authTabToken')?.classList.remove('active');
    document.getElementById('authTabOauth')?.classList.add('active');
  }
}

// ============================================
// Server Selector
// ============================================

function setupServerSelector(servers, codeGen, renderer, parser) {
  const select = document.getElementById('serverSelect');
  
  servers.forEach((server, index) => {
    const option = document.createElement('option');
    option.value = server.url;
    option.textContent = server.description || server.url;
    if (index === 0) option.selected = true;
    select.appendChild(option);
  });
  
  // Re-render code examples on server change
  select.addEventListener('change', () => {
    codeGen.baseUrl = select.value;
    
    // Re-render all endpoints
    const tagGroups = parser.getEndpointsByTags();
    renderer.renderAllEndpoints(tagGroups);
    setupEventListeners();
    setupTryItEventListeners(select.value);
  });
}

// ============================================
// API Family Switcher
// ============================================

function setupApiSwitcher(apiFamily) {
  if (!apiFamily || apiFamily.length < 2) return;
  
  const wrapper = document.getElementById('apiTitleWrapper');
  const titleEl = document.getElementById('apiTitle');
  
  // Make the title clickable with a dropdown indicator
  wrapper.classList.add('has-switcher');
  
  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'api-switcher-dropdown';
  dropdown.id = 'apiSwitcherDropdown';
  
  let dropdownHtml = '';
  for (const api of apiFamily) {
    const activeClass = api.current ? 'active' : '';
    const checkmark = api.current ? `
      <svg class="api-switcher-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    ` : '';
    
    dropdownHtml += `
      <a href="${api.url}" class="api-switcher-item ${activeClass}">
        <span>${api.name}</span>
        ${checkmark}
      </a>
    `;
  }
  
  dropdown.innerHTML = dropdownHtml;
  wrapper.appendChild(dropdown);
  
  // Add dropdown toggle arrow to title
  const arrow = document.createElement('svg');
  arrow.className = 'api-switcher-arrow';
  arrow.setAttribute('width', '12');
  arrow.setAttribute('height', '12');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', 'currentColor');
  arrow.setAttribute('stroke-width', '2');
  arrow.innerHTML = '<path d="M6 9l6 6 6-6"/>';
  titleEl.appendChild(arrow);
  
  // Toggle dropdown on click
  titleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapper.classList.toggle('open');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    wrapper.classList.remove('open');
  });
  
  // Prevent dropdown clicks from closing
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// ============================================
// Main Initialization
// ============================================

// ============================================
// Main Initialization
// ============================================

async function init() {
  try {
    // Determine Spec URL
    // 1. Check URL query param ?spec=...
    // 2. Check global config window.KOHLRABI_CONFIG.spec
    // 3. Fallback to default
    const urlParams = new URLSearchParams(window.location.search);
    const specUrl = urlParams.get('spec') || 
                    window.KOHLRABI_CONFIG?.spec || 
                    '/swagger.json';

    // Fetch OpenAPI spec
    const response = await fetch(specUrl);
    if (!response.ok) {
      throw new Error(`Failed to load API spec from ${specUrl}: ${response.status}`);
    }
    const spec = await response.json();
    
    // Initialize parser and generators
    const parser = new OpenAPIParser(spec);
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    const codeGen = new CodeGenerator(baseUrl);
    const renderer = new DocumentationRenderer(parser, codeGen);
    
    // Set API info
    const apiTitle = spec.info?.title || 'API Documentation';
    document.title = `${apiTitle} Documentation`;
    document.getElementById('apiTitle').textContent = apiTitle;
    document.getElementById('apiVersion').textContent = `v${spec.info?.version || '1.0.0'}`;
    document.getElementById('apiDescription').innerHTML = parseMarkdown(spec.info?.description || '');
    
    // Update meta description from spec
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && spec.info?.description) {
      // Extract first sentence or first 160 chars for meta description
      const descText = spec.info.description.replace(/[#*`\[\]]/g, '').trim();
      const firstSentence = descText.split(/[.!?]\s/)[0];
      metaDescription.setAttribute('content', 
        firstSentence.length > 160 ? firstSentence.substring(0, 157) + '...' : firstSentence + '.'
      );
    }
    
    // Setup API family switcher if defined
    if (spec.info?.['x-api-family']) {
      setupApiSwitcher(spec.info['x-api-family']);
    }
    
    // Setup server selector
    if (spec.servers?.length > 0) {
      setupServerSelector(spec.servers, codeGen, renderer, parser);
    }
    
    // Get organized data
    const tagGroups = parser.getEndpointsByTags();
    const webhooks = parser.getWebhooks();
    
    // Render everything
    renderer.renderNavigation(tagGroups, webhooks);
    renderer.renderAllEndpoints(tagGroups);
    renderer.renderWebhooks(webhooks);
    
    // Setup interactions
    setupEventListeners();
    setupAuthEventListeners();
    setupTryItEventListeners(baseUrl);
    
    // Initialize auth display
    authManager.updateDisplay();
    
    // Pre-populate OAuth2 config from spec
    const oauth2Config = parser.getOAuth2Config();
    if (oauth2Config) {
      setupOAuth2FromSpec(oauth2Config);
    }
    
    console.log('Documentation loaded successfully');
    
  } catch (error) {
    console.error('Failed to initialize documentation:', error);
    document.getElementById('mainContent').innerHTML = `
      <div style="padding: 3rem; text-align: center;">
        <h2 style="color: var(--method-delete);">Error Loading Documentation</h2>
        <p style="color: var(--text-secondary); margin-top: 1rem;">${error.message}</p>
      </div>
    `;
  }
}

// Start the application
init();

