const vscode = acquireVsCodeApi();

let packages = [];
let selectedPackages = new Set();
let graphData = { nodes: [], edges: [] };
let folders = [];
let currentFolder = null;

// Canvas state
let canvas, ctx;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// Initialize
function init() {
  canvas = document.getElementById('graphCanvas');
  ctx = canvas.getContext('2d');
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Canvas interaction
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('wheel', handleWheel);
  
  // Search
  document.getElementById('searchBox').addEventListener('input', renderPackageList);
  
  // Selection controls
  document.getElementById('selectAllBtn').addEventListener('click', selectAll);
  document.getElementById('clearAllBtn').addEventListener('click', clearAll);
  
  // Graph controls
  document.getElementById('updateBtn').addEventListener('click', updateGraph);
  document.getElementById('stopBtn').addEventListener('click', stopGraph);
  document.getElementById('refreshBtn').addEventListener('click', refreshGraph);
  document.getElementById('zoomInBtn').addEventListener('click', () => zoom(1.2));
  document.getElementById('zoomOutBtn').addEventListener('click', () => zoom(0.8));
  document.getElementById('resetBtn').addEventListener('click', resetView);
  document.getElementById('fitBtn').addEventListener('click', fitToView);
  
  // Folder selector
  document.getElementById('folderSelector').addEventListener('change', handleFolderChange);
  document.getElementById('browseBtn').addEventListener('click', handleBrowseClick);
  
  vscode.postMessage({ command: 'ready' });
}

// Message handler
window.addEventListener('message', (event) => {
  const message = event.data;
  
  switch (message.command) {
    case 'init':
      packages = message.packages || [];
      selectedPackages = new Set(message.selection || []);
      folders = message.folders || [];
      currentFolder = message.lastSelectedFolder;
      
      // Update UI
      document.getElementById('projectTitle').textContent = 
        message.projectName ? `${message.projectName} - NPM Dependencies` : 'NPM Dependency Graph';
      renderFolderSelector();
      renderPackageList();
      updateSelectionSummary();
      updateButtonStates();
      setStatus(packages.length > 0 ? 'Select packages and click Generate Graph' : 'Select a folder to load packages');
      break;
      
    case 'packagesUpdated':
      packages = message.packages || [];
      selectedPackages = new Set(message.selection || []);
      document.getElementById('projectTitle').textContent = 
        message.projectName ? `${message.projectName} - NPM Dependencies` : 'NPM Dependency Graph';
      renderPackageList();
      updateSelectionSummary();
      updateButtonStates();
      setStatus(packages.length > 0 ? 'Select packages and click Generate Graph' : 'No dependencies found in selected folder');
      break;
      
    case 'updateGraph':
      graphData = message.graphData || { nodes: [], edges: [] };
      selectedPackages = new Set(message.selection || []);
      updateSelectionSummary();
      layoutGraph();
      renderGraph();
      setStatus(`Graph: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
      break;
      
    case 'operationStarted':
      document.getElementById('updateBtn').disabled = true;
      document.getElementById('refreshBtn').disabled = true;
      document.getElementById('stopBtn').style.display = 'inline-block';
      setStatus('Building graph...');
      break;
      
    case 'operationComplete':
      document.getElementById('updateBtn').disabled = false;
      document.getElementById('refreshBtn').disabled = false;
      document.getElementById('stopBtn').style.display = 'none';
      break;
      
    case 'operationStopped':
      document.getElementById('updateBtn').disabled = false;
      document.getElementById('refreshBtn').disabled = false;
      document.getElementById('stopBtn').style.display = 'none';
      setStatus(message.message || 'Stopped');
      break;
      
    case 'showError':
      setStatus('Error: ' + (message.message || 'Unknown error'));
      break;
      
    case 'updateFolders':
      folders = message.folders || [];
      currentFolder = message.selectedFolder;
      renderFolderSelector();
      break;
  }
});

// Folder selector rendering
function renderFolderSelector() {
  const selectorEl = document.getElementById('folderSelector');
  const descriptionEl = document.getElementById('headerDescription');
  
  selectorEl.innerHTML = '';
  
  if (folders.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No package.json found in workspace';
    option.disabled = true;
    option.selected = true;
    selectorEl.appendChild(option);
    descriptionEl.textContent = 'Open a workspace containing Node.js projects';
    return;
  }
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a folder...';
  selectorEl.appendChild(defaultOption);
  
  // Add folder options
  folders.forEach(folder => {
    const option = document.createElement('option');
    option.value = folder.path;
    option.textContent = folder.name;
    if (folder.path === currentFolder) {
      option.selected = true;
    }
    selectorEl.appendChild(option);
  });
  
  // Update description based on selection
  if (currentFolder) {
    descriptionEl.textContent = 'Select packages and click Generate Graph to visualize dependencies';
  } else {
    descriptionEl.textContent = 'Select a folder to load packages';
  }
}

function handleFolderChange(e) {
  const folderPath = e.target.value;
  
  if (!folderPath) {
    return;
  }
  
  currentFolder = folderPath;
  vscode.postMessage({
    command: 'folderSelected',
    folderPath: folderPath
  });
}

function handleBrowseClick() {
  vscode.postMessage({
    command: 'browseFolders'
  });
}

// Package list rendering
function renderPackageList() {
  const listEl = document.getElementById('packageList');
  const search = document.getElementById('searchBox').value.toLowerCase();
  
  const filtered = packages.filter(pkg => 
    pkg.name.toLowerCase().includes(search)
  );
  
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No packages found</div>';
    return;
  }
  
  listEl.innerHTML = filtered.map(pkg => `
    <label class="package-item">
      <input type="checkbox" 
             data-package="${pkg.name}" 
             ${selectedPackages.has(pkg.name) ? 'checked' : ''}>
      <div>
        <div class="package-name">${pkg.name}</div>
        <div class="package-version">${pkg.version}</div>
      </div>
    </label>
  `).join('');
  
  // Add event listeners
  listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const pkg = e.target.dataset.package;
      if (e.target.checked) {
        selectedPackages.add(pkg);
      } else {
        selectedPackages.delete(pkg);
      }
      updateSelectionSummary();
    });
  });
}

function updateSelectionSummary() {
  document.getElementById('selectionSummary').textContent = 
    `${selectedPackages.size} of ${packages.length} packages selected`;
  updateButtonStates();
}

function updateButtonStates() {
  const updateBtn = document.getElementById('updateBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  
  // Enable Generate Graph button only if packages are selected
  const hasSelection = selectedPackages.size > 0 && packages.length > 0;
  updateBtn.disabled = !hasSelection;
  refreshBtn.disabled = !hasSelection;
}

function selectAll() {
  const search = document.getElementById('searchBox').value.toLowerCase();
  packages.filter(pkg => pkg.name.toLowerCase().includes(search))
          .forEach(pkg => selectedPackages.add(pkg.name));
  renderPackageList();
  updateSelectionSummary();
}

function clearAll() {
  selectedPackages.clear();
  renderPackageList();
  updateSelectionSummary();
}

function setStatus(text) {
  document.getElementById('statusBar').textContent = text;
}

// Graph controls
function updateGraph() {
  vscode.postMessage({
    command: 'changeSelection',
    packageNames: Array.from(selectedPackages)
  });
}

function stopGraph() {
  vscode.postMessage({ command: 'stop' });
}

function refreshGraph() {
  vscode.postMessage({
    command: 'refresh',
    packageNames: Array.from(selectedPackages)
  });
}

// Canvas rendering
function resizeCanvas() {
  const wrapper = document.getElementById('canvasWrapper');
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  renderGraph();
}

function layoutGraph() {
  if (graphData.nodes.length === 0) {return;}
  
  // Simple force-directed layout calculation (pre-computed, not animated)
  const nodes = graphData.nodes;
  const edges = graphData.edges;
  
  // Initialize positions
  nodes.forEach((node, i) => {
    node.x = Math.cos(i * 2 * Math.PI / nodes.length) * 200;
    node.y = Math.sin(i * 2 * Math.PI / nodes.length) * 200;
  });
  
  // Run layout iterations (statically, not animated)
  for (let iteration = 0; iteration < 100; iteration++) {
    // Repulsion between nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 5000 / (dist * dist);
        
        nodes[i].x -= (dx / dist) * force;
        nodes[i].y -= (dy / dist) * force;
        nodes[j].x += (dx / dist) * force;
        nodes[j].y += (dy / dist) * force;
      }
    }
    
    // Attraction along edges
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.from);
      const target = nodes.find(n => n.id === edge.to);
      if (!source || !target) {return;}
      
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist / 100;
      
      source.x += (dx / dist) * force;
      source.y += (dy / dist) * force;
      target.x -= (dx / dist) * force;
      target.y -= (dy / dist) * force;
    });
  }
}

function renderGraph() {
  if (!ctx) {return;}
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (graphData.nodes.length === 0) {
    return;
  }
  
  ctx.save();
  ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  ctx.scale(scale, scale);
  
  // Draw edges
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--vscode-descriptionForeground') || '#666';
  ctx.lineWidth = 1;
  graphData.edges.forEach(edge => {
    const source = graphData.nodes.find(n => n.id === edge.from);
    const target = graphData.nodes.find(n => n.id === edge.to);
    if (!source || !target) {return;}
    
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    
    // Arrow
    const angle = Math.atan2(target.y - source.y, target.x - source.x);
    const arrowSize = 8;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-arrowSize, -arrowSize/2);
    ctx.lineTo(0, 0);
    ctx.lineTo(-arrowSize, arrowSize/2);
    ctx.stroke();
    ctx.restore();
  });
  
  // Draw nodes
  ctx.font = '12px var(--vscode-font-family)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  graphData.nodes.forEach(node => {
    const colors = ['#569CD6', '#4EC9B0', '#CE9178', '#C586C0', '#DCDCAA'];
    const color = colors[node.level % colors.length];
    
    // Node background
    const text = `${node.label}\n${node.version}`;
    const lines = text.split('\n');
    const width = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20;
    const height = 40;
    
    ctx.fillStyle = color;
    ctx.fillRect(node.x - width/2, node.y - height/2, width, height);
    
    // Node border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(node.x - width/2, node.y - height/2, width, height);
    
    // Text
    ctx.fillStyle = '#000';
    ctx.fillText(node.label, node.x, node.y - 8);
    ctx.fillStyle = '#333';
    ctx.font = '10px var(--vscode-font-family)';
    ctx.fillText(node.version, node.x, node.y + 8);
    ctx.font = '12px var(--vscode-font-family)';
  });
  
  ctx.restore();
}

// Interaction
function handleMouseDown(e) {
  isDragging = true;
  dragStartX = e.clientX - offsetX;
  dragStartY = e.clientY - offsetY;
}

function handleMouseMove(e) {
  if (!isDragging) {return;}
  offsetX = e.clientX - dragStartX;
  offsetY = e.clientY - dragStartY;
  renderGraph();
}

function handleMouseUp() {
  isDragging = false;
}

function handleWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale *= delta;
  scale = Math.max(0.1, Math.min(5, scale));
  renderGraph();
}

function zoom(factor) {
  scale *= factor;
  scale = Math.max(0.1, Math.min(5, scale));
  renderGraph();
}

function resetView() {
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  renderGraph();
}

function fitToView() {
  if (graphData.nodes.length === 0) {return;}
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  graphData.nodes.forEach(node => {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  });
  
  const graphWidth = maxX - minX + 200;
  const graphHeight = maxY - minY + 200;
  
  scale = Math.min(canvas.width / graphWidth, canvas.height / graphHeight) * 0.9;
  offsetX = -(minX + maxX) / 2 * scale;
  offsetY = -(minY + maxY) / 2 * scale;
  
  renderGraph();
}

init();
