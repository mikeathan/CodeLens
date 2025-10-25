// @ts-nocheck
/* global acquireVsCodeApi */
(function() {
  const vscode = acquireVsCodeApi();
  
  let currentTab = 'graph';
  let packageList = [];
  let selectedPackages = [];
  let workspaces = [];
  let currentWorkspace = null;

  // HTML escape helper to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupToolbar();
    setupGraphTab();
    setupUnusedTab();
    
    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });
  });

  // Tab Management
  function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        switchTab(tabName);
      });
    });
  }

  function switchTab(tabName) {
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      if (content.dataset.tabContent === tabName) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Notify extension of tab change
    vscode.postMessage({ type: 'tabChanged', tab: tabName });
  }

  // Toolbar
  function setupToolbar() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh', tab: currentTab });
      showLoading(true);
    });

    document.getElementById('workspaceSelector').addEventListener('change', (e) => {
      currentWorkspace = e.target.value;
      vscode.postMessage({ type: 'workspaceChanged', workspace: currentWorkspace });
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'export', tab: currentTab });
    });
  }

  // Graph Tab
  function setupGraphTab() {
    const searchInput = document.getElementById('graphSearch');
    searchInput.addEventListener('input', (e) => {
      filterPackages(e.target.value);
    });

    document.getElementById('buildGraphBtn').addEventListener('click', () => {
      const selected = Array.from(document.querySelectorAll('.package-item input:checked'))
        .map(cb => cb.value);
      
      if (selected.length === 0) {
        updateStatus('Please select at least one package');
        return;
      }

      vscode.postMessage({ 
        type: 'buildGraph', 
        packages: selected,
        workspace: currentWorkspace
      });
      showLoading(true);
    });
  }

  function renderPackageList(packages) {
    packageList = packages;
    const container = document.getElementById('packageList');
    
    if (!packages || packages.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No packages found</p></div>';
      return;
    }

    container.innerHTML = packages.map(pkg => {
      const escapedName = escapeHtml(pkg.name);
      return `
        <label class="package-item">
          <input type="checkbox" value="${escapedName}" ${pkg.selected ? 'checked' : ''}>
          <span>${escapedName}</span>
        </label>
      `;
    }).join('');
  }

  function filterPackages(query) {
    const items = document.querySelectorAll('.package-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(lowerQuery)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }

  function renderGraph(graphData) {
    const display = document.getElementById('graphDisplay');
    
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      display.innerHTML = '<div class="empty-state"><p>No graph data to display</p></div>';
      return;
    }

    // Simple hierarchical display
    const nodesByLevel = {};
    graphData.nodes.forEach(node => {
      if (!nodesByLevel[node.level]) {
        nodesByLevel[node.level] = [];
      }
      nodesByLevel[node.level].push(node);
    });

    let html = '<div class="graph-hierarchy">';
    Object.keys(nodesByLevel).sort().forEach(level => {
      nodesByLevel[level].forEach(node => {
        const indent = parseInt(level) * 20;
        const escapedLabel = escapeHtml(node.label);
        const escapedVersion = escapeHtml(node.version);
        html += `
          <div class="graph-node" style="margin-left: ${indent}px">
            <span class="graph-node-label">${escapedLabel}</span>
            <span class="graph-node-version">${escapedVersion}</span>
          </div>
        `;
      });
    });
    html += '</div>';

    display.innerHTML = html;
    updateStatus(`Graph built: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
  }

  // Unused Tab
  function setupUnusedTab() {
    document.getElementById('scanUnusedBtn').addEventListener('click', () => {
      vscode.postMessage({ 
        type: 'scanUnused',
        workspace: currentWorkspace
      });
      showLoading(true);
    });
  }

  function renderUnusedDependencies(result) {
    const container = document.getElementById('unusedResults');
    
    if (!result || !result.unused || result.unused.length === 0) {
      const checkedCount = parseInt(result?.checked || 0);
      container.innerHTML = `
        <div class="empty-state">
          <p>✓ No unused dependencies found</p>
          <p style="font-size: 11px; margin-top: 8px;">Checked ${checkedCount} dependencies</p>
        </div>
      `;
      updateStatus('No unused dependencies found');
      return;
    }

    let html = `
      <table class="unused-table">
        <thead>
          <tr>
            <th>Dependency</th>
            <th>Version</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
    `;

    result.unused.forEach(dep => {
      const badgeClass = dep.type === 'dependencies' ? 'badge-prod' : 'badge-dev';
      const typeLabel = dep.type === 'dependencies' ? 'prod' : 'dev';
      const escapedName = escapeHtml(dep.name);
      const escapedVersion = escapeHtml(dep.version);
      
      html += `
        <tr>
          <td><strong>${escapedName}</strong></td>
          <td>${escapedVersion}</td>
          <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
    updateStatus(`Found ${result.unused.length} unused dependencies out of ${result.checked} total`);
  }

  // Utility Functions
  function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
  }

  function updateStatus(text, time = null) {
    document.getElementById('statusText').textContent = text;
    if (time) {
      document.getElementById('statusTime').textContent = time;
    }
  }

  function updateWorkspaces(ws) {
    workspaces = ws;
    const selector = document.getElementById('workspaceSelector');
    
    if (!ws || ws.length === 0) {
      selector.innerHTML = '<option value="">No workspace found</option>';
      return;
    }

    selector.innerHTML = ws.map(w => {
      const escapedPath = escapeHtml(w.path);
      const escapedName = escapeHtml(w.name);
      return `<option value="${escapedPath}">${escapedName}</option>`;
    }).join('');

    if (ws.length > 0) {
      currentWorkspace = ws[0].path;
      selector.value = currentWorkspace;
    }
  }

  // Message Handler
  window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
      case 'init':
        if (message.workspaces) {
          updateWorkspaces(message.workspaces);
        }
        if (message.packages) {
          renderPackageList(message.packages);
        }
        if (message.tab) {
          switchTab(message.tab);
        }
        showLoading(false);
        updateStatus('Ready');
        break;

      case 'setGraphData':
        renderGraph(message.data);
        showLoading(false);
        break;

      case 'setUnusedData':
        renderUnusedDependencies(message.data);
        showLoading(false);
        break;

      case 'setPackages':
        renderPackageList(message.packages);
        break;

      case 'setStatus':
        updateStatus(message.text, message.time);
        showLoading(false);
        break;

      case 'error':
        updateStatus(`Error: ${message.message}`);
        showLoading(false);
        break;

      case 'showLoading':
        showLoading(true);
        break;

      case 'hideLoading':
        showLoading(false);
        break;
    }
  });
})();
