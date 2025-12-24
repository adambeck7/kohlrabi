/**
 * API Documentation
 * OpenAPI 3.x Parser and Renderer
 */

import './styles.css';

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
      result = result?.[parts[i]];
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

// ============================================
// Markdown Parser (simple)
// ============================================

function parseMarkdown(text) {
  if (!text) return '';
  
  // First, extract code blocks and replace with placeholders to protect them
  const codeBlocks = [];
  let processed = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
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
          <pre class="code-block"><code>${escapeHtml(curl)}</code></pre>
        </div>
        <div id="${tabId}-js" class="code-tab-content">
          <pre class="code-block"><code>${escapeHtml(js)}</code></pre>
        </div>
        <div id="${tabId}-python" class="code-tab-content">
          <pre class="code-block"><code>${escapeHtml(python)}</code></pre>
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
          </div>
          <div class="content-right">
            ${this.renderCodePanel(endpoint.method, endpoint.path, endpoint.requestBody, endpoint.responses)}
          </div>
        </div>
      </section>
    `;
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

