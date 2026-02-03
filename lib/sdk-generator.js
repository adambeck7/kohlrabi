/**
 * SDK Generator UI Component
 * 
 * Displays instructions for using the CLI-based SDK generation.
 * 
 * SDK generation uses Fern (https://github.com/fern-api/fern)
 * Fern is licensed under Apache 2.0 - see THIRD_PARTY_LICENSES.md
 * Copyright 2024 Fern API, Inc.
 */

// ============================================
// SDK Language Configuration
// ============================================

export const SDK_LANGUAGES = [
  { id: 'typescript', name: 'TypeScript', icon: '🟦' },
  { id: 'python', name: 'Python', icon: '🐍' },
  { id: 'java', name: 'Java', icon: '☕' },
  { id: 'go', name: 'Go', icon: '🐹' },
  { id: 'ruby', name: 'Ruby', icon: '💎' },
  { id: 'csharp', name: 'C#', icon: '🔷' },
];

// ============================================
// SDK Generator UI Component
// ============================================

export class SDKGeneratorUI {
  constructor(spec) {
    this.spec = spec;
    this.apiName = this.sanitizePackageName(spec.info?.title || 'api');
  }

  sanitizePackageName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'api';
  }

  /**
   * Render the SDK generator panel HTML
   */
  render() {
    return `
      <div class="sdk-generator-section collapsed" id="sdkGeneratorSection">
        <div class="sdk-generator-header" id="sdkGeneratorHeader">
          <span class="sdk-generator-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
              <polyline points="7.5 19.79 7.5 14.6 3 12"/>
              <polyline points="21 12 16.5 14.6 16.5 19.79"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
            Generate SDK
          </span>
          <svg class="sdk-generator-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
        <div class="sdk-generator-content" id="sdkGeneratorContent">
          <p class="sdk-generator-description">
            Generate type-safe client SDKs for your API using the CLI.
          </p>
          
          <div class="sdk-language-grid">
            ${SDK_LANGUAGES.map(lang => `
              <div class="sdk-language-option" title="${lang.name}">
                <span class="sdk-language-icon">${lang.icon}</span>
                <span class="sdk-language-name">${lang.name}</span>
              </div>
            `).join('')}
          </div>

          <div class="sdk-cli-preview" id="sdkCliPreview">
            <div class="sdk-cli-header">
              <span>Generate SDKs</span>
            </div>
            <pre class="sdk-cli-code"><code># Generate TypeScript SDK
npx kohlrabi sdk --language typescript

# Generate multiple SDKs
npx kohlrabi sdk -l typescript,python,go

# Custom output directory
npx kohlrabi sdk -l python -O ./my-sdks</code></pre>
          </div>

          <div class="sdk-actions">
            <button class="sdk-copy-btn" id="sdkCopyCommandBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Copy Command
            </button>
          </div>

          <div class="sdk-attribution">
            <small>
              Powered by <a href="https://github.com/fern-api/fern" target="_blank" rel="noopener">Fern</a> 
              (Apache 2.0)
            </small>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Setup event listeners for SDK generator UI
   */
  setupEventListeners() {
    // Toggle panel
    const header = document.getElementById('sdkGeneratorHeader');
    const section = document.getElementById('sdkGeneratorSection');
    
    header?.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });

    // Copy CLI command button
    document.getElementById('sdkCopyCommandBtn')?.addEventListener('click', () => {
      this.copyCliCommand();
    });
  }

  /**
   * Copy CLI command to clipboard
   */
  async copyCliCommand() {
    const command = 'npx kohlrabi sdk --language typescript';

    try {
      await navigator.clipboard.writeText(command);
      
      const btn = document.getElementById('sdkCopyCommandBtn');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        Copied!
      `;
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }
}

// ============================================
// Export for main.js integration
// ============================================

export function initSDKGenerator(spec) {
  const ui = new SDKGeneratorUI(spec);
  return { ui };
}
