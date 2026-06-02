const cpuVal = document.getElementById('cpu-val');
const cpuBar = document.getElementById('cpu-bar');

const memVal = document.getElementById('mem-val');
const memBar = document.getElementById('mem-bar');

const diskVal = document.getElementById('disk-val');
const diskBar = document.getElementById('disk-bar');

const gpuUtilVal = document.getElementById('gpu-util-val');
const gpuUtilBar = document.getElementById('gpu-util-bar');

const gpuMemVal = document.getElementById('gpu-mem-val');
const gpuMemBar = document.getElementById('gpu-mem-bar');

const uptimeVal = document.getElementById('uptime-val');
const osVal = document.getElementById('os-val');

const statusIndicator = document.querySelector('.status');
const statusText = document.getElementById('connection-status');

const portsBody = document.getElementById('ports-body');
const portsCount = document.getElementById('ports-count');
const portsFilter = document.getElementById('ports-filter');

let currentPorts = [];
let filterText = '';
let sortCol = 'port';
let sortDesc = false;

portsFilter.addEventListener('input', (e) => {
    filterText = e.target.value.toLowerCase();
    renderPortsTable();
});

document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (sortCol === col) {
            sortDesc = !sortDesc;
        } else {
            sortCol = col;
            sortDesc = false;
        }
        
        document.querySelectorAll('.sortable').forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(sortDesc ? 'sort-desc' : 'sort-asc');
        
        renderPortsTable();
    });
});

// Init sort UI
document.querySelector(`th[data-sort="${sortCol}"]`).classList.add('sort-asc');

function setConnected(isConnected) {
    if (isConnected) {
        statusIndicator.className = 'status connected';
        statusText.textContent = 'Live';
        cpuVal.style.opacity = 1;
        memVal.style.opacity = 1;
        diskVal.style.opacity = 1;
        gpuUtilVal.style.opacity = 1;
        gpuMemVal.style.opacity = 1;
        uptimeVal.style.opacity = 1;
        osVal.style.opacity = 1;
    } else {
        statusIndicator.className = 'status disconnected';
        statusText.textContent = 'Disconnected';
        cpuVal.style.opacity = 0.5;
        memVal.style.opacity = 0.5;
        diskVal.style.opacity = 0.5;
        gpuUtilVal.style.opacity = 0.5;
        gpuMemVal.style.opacity = 0.5;
        uptimeVal.style.opacity = 0.5;
        osVal.style.opacity = 0.5;
    }
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);

    let res = [];
    if (d > 0) res.push(`${d}d`);
    if (h > 0) res.push(`${h}h`);
    if (m > 0) res.push(`${m}m`);
    res.push(`${s}s`);
    return res.join(' ');
}

function formatBytesToGB(bytes) {
    if (!bytes) return "0.00";
    return (bytes / (1024 ** 3)).toFixed(2);
}

function updateProgressBar(bar, percent) {
    bar.style.width = `${percent}%`;
    if (percent > 85) {
        bar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        bar.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.4)';
    } else if (percent > 60) {
        bar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        bar.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.4)';
    } else {
        bar.style.background = 'linear-gradient(90deg, #3b82f6, #60a5fa)';
        bar.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.4)';
    }
}

function renderPortsTable() {
    let filtered = currentPorts;
    
    if (filterText) {
        filtered = currentPorts.filter(p => {
            const searchStr = `${p.port} ${p.protocol} ${p.process} ${p.state}`.toLowerCase();
            return searchStr.includes(filterText);
        });
    }
    
    filtered.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];
        
        if (sortCol === 'port') {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }
        
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });
    
    portsCount.textContent = `${filtered.length} showing`;
    portsBody.innerHTML = '';
    
    filtered.forEach(port => {
        const tr = document.createElement('tr');
        
        const tdPort = document.createElement('td');
        tdPort.style.fontWeight = '600';
        tdPort.style.color = 'var(--accent-color)';
        tdPort.textContent = port.port;
        
        const tdProto = document.createElement('td');
        tdProto.textContent = port.protocol.toUpperCase();
        
        const tdProcess = document.createElement('td');
        if (port.process && port.process !== 'Unknown') {
            const span = document.createElement('span');
            span.className = 'process-name';
            span.textContent = port.process;
            tdProcess.appendChild(span);
        } else {
            tdProcess.textContent = '-';
            tdProcess.style.color = 'var(--text-secondary)';
        }
        
        const tdStatus = document.createElement('td');
        const statusSpan = document.createElement('span');
        const isActive = port.state === 'UNCONN' || port.state === 'ESTAB';
        statusSpan.className = `status-badge ${isActive ? 'status-listen' : 'status-unconn'}`;
        statusSpan.textContent = isActive ? 'ACTIVE' : port.state;
        tdStatus.appendChild(statusSpan);
        
        tr.appendChild(tdPort);
        tr.appendChild(tdProto);
        tr.appendChild(tdProcess);
        tr.appendChild(tdStatus);
        
        portsBody.appendChild(tr);
    });
}

async function fetchStats() {
    try {
        const response = await fetch('/stats');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        setConnected(true);
        updateUI(data);
    } catch (error) {
        console.error('Fetch error:', error);
        setConnected(false);
    }
}

function updateUI(data) {
    // CPU
    const cpuPercent = data.cpu.toFixed(1);
    cpuVal.textContent = `${cpuPercent}%`;
    updateProgressBar(cpuBar, data.cpu);

    // Memory
    const memUsedGB = formatBytesToGB(data.memory.active);
    const memTotalGB = formatBytesToGB(data.memory.total);
    const memPercent = data.memory.total ? (data.memory.active / data.memory.total) * 100 : 0;
    memVal.textContent = `${memUsedGB} / ${memTotalGB} GB`;
    updateProgressBar(memBar, memPercent);
        // Update disk values
        if (data.disk && data.disk.total) {
            const diskUsedGB = formatBytesToGB(data.disk.used);
            const diskTotalGB = formatBytesToGB(data.disk.total);
            document.getElementById('disk-val').textContent = 
                `${diskUsedGB} / ${diskTotalGB} GB`;
            const diskPercent = (data.disk.used / data.disk.total) * 100;
            document.getElementById('disk-bar').style.width = diskPercent + '%';
            
            const modelsDiskUsage = document.getElementById('models-disk-usage');
            if (modelsDiskUsage) {
                modelsDiskUsage.textContent = `(${diskPercent.toFixed(1)}% full)`;
                modelsDiskUsage.style.color = diskPercent > 90 ? 'red' : 'var(--text-muted)';
            }
        }
    
    // GPU
    if (data.gpu) {
        const gpuUtil = data.gpu.utilization.toFixed(1);
        gpuUtilVal.textContent = `${gpuUtil}%`;
        updateProgressBar(gpuUtilBar, data.gpu.utilization);
        
        if (data.gpu.memory_total > 0) {
            const gpuMemUsedGB = formatBytesToGB(data.gpu.memory_used);
            const gpuMemTotalGB = formatBytesToGB(data.gpu.memory_total);
            const gpuMemPercent = (data.gpu.memory_used / data.gpu.memory_total) * 100;
            gpuMemVal.textContent = `${gpuMemUsedGB} / ${gpuMemTotalGB} GB`;
            updateProgressBar(gpuMemBar, gpuMemPercent);
        } else {
            gpuMemVal.textContent = "N/A";
            updateProgressBar(gpuMemBar, 0);
        }
    }

    // Uptime & OS
    uptimeVal.textContent = formatUptime(data.uptime);
    osVal.textContent = data.os;

    // Ports
    if (data.ports) {
        const newPortsHash = JSON.stringify(data.ports);
        if (window.lastPortsHash !== newPortsHash) {
            window.lastPortsHash = newPortsHash;
            currentPorts = data.ports;
            renderPortsTable();
        }
    }
}

// Initial fetch and start polling
fetchStats();
setInterval(fetchStats, 1000);

document.getElementById('upload-btn').addEventListener('click', async () => {
    const jsonInput = document.getElementById('json-file');
    const imageInput = document.getElementById('image-file');
    const statusDiv = document.getElementById('upload-status');
    const btn = document.getElementById('upload-btn');

    if (!jsonInput.files || jsonInput.files.length === 0) {
        statusDiv.textContent = 'Please select a .json template file.';
        statusDiv.style.color = 'red';
        return;
    }

    const jsonFile = jsonInput.files[0];
    if (!jsonFile.name.endsWith('.json')) {
        statusDiv.textContent = 'Template file must be a .json file.';
        statusDiv.style.color = 'red';
        return;
    }

    let imageFile = null;
    if (imageInput.files && imageInput.files.length > 0) {
        imageFile = imageInput.files[0];
        const nameLower = imageFile.name.toLowerCase();
        if (!nameLower.endsWith('.jpg') && !nameLower.endsWith('.jpeg')) {
            statusDiv.textContent = 'Preview image must be a .jpg or .jpeg file.';
            statusDiv.style.color = 'red';
            return;
        }
    }

    btn.disabled = true;
    statusDiv.textContent = 'Uploading...';
    statusDiv.style.color = 'var(--text-color)';

    try {
        const jsonContent = await readFileAsText(jsonFile);
        let imageBase64 = null;
        if (imageFile) {
            const dataUrl = await readFileAsDataURL(imageFile);
            imageBase64 = dataUrl.split(',')[1];
        }

        const payload = {
            json_filename: jsonFile.name,
            json_content: jsonContent,
            has_image: !!imageFile,
            image_base64: imageBase64
        };

        const res = await fetch('/upload_template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            throw new Error("Server returned non-JSON response. Did you restart the server?");
        }

        const result = await res.json();
        if (res.ok && result.success) {
            statusDiv.textContent = 'Upload successful!';
            statusDiv.style.color = 'green';
            jsonInput.value = '';
            imageInput.value = '';
        } else {
            statusDiv.textContent = 'Upload failed: ' + (result.error || 'Unknown error');
            statusDiv.style.color = 'red';
        }
    } catch (e) {
        console.error(e);
        statusDiv.textContent = 'Error: ' + e.message;
        statusDiv.style.color = 'red';
    } finally {
        btn.disabled = false;
    }
});

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsDataURL(file);
    });
}

// Collapsible sections
document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', (e) => {
        const section = header.closest('.collapsible-section');
        const content = section.querySelector('.section-content');
        const icon = section.querySelector('.min-icon');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
        } else {
            content.style.display = 'none';
            icon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
        }
    });
});

// Models Browser Logic
const folderSelect = document.getElementById('model-folder-select');
const modelsBody = document.getElementById('models-body');
const refreshModelsBtn = document.getElementById('refresh-models-btn');
const uploadModelBtn = document.getElementById('upload-model-btn');
const newModelFile = document.getElementById('new-model-file');
const modelUploadStatus = document.getElementById('model-upload-status');

async function fetchModelFolders() {
    try {
        const res = await fetch('/list_model_folders');
        if (!res.ok) throw new Error('Failed to fetch folders');
        const folders = await res.json();
        
        const currentVal = folderSelect.value;
        folderSelect.innerHTML = '<option value="">Select a folder...</option>';
        folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            folderSelect.appendChild(opt);
        });
        if (folders.includes(currentVal)) {
            folderSelect.value = currentVal;
        }
    } catch (e) {
        console.error(e);
    }
}

async function fetchModelsInFolder() {
    const folder = folderSelect.value;
    if (!folder) {
        modelsBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem; color:var(--text-muted);">Select a folder to view files</td></tr>';
        uploadModelBtn.disabled = true;
        return;
    }
    
    uploadModelBtn.disabled = false;
    modelsBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem;">Loading...</td></tr>';
    
    try {
        const res = await fetch('/list_models?folder=' + encodeURIComponent(folder));
        if (!res.ok) throw new Error('Failed to fetch files');
        const files = await res.json();
        
        modelsBody.innerHTML = '';
        if (files.length === 0) {
            modelsBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem; color:var(--text-muted);">Folder is empty</td></tr>';
            return;
        }
        
        const showCb = document.getElementById('flag-removal-toggle').checked;
        
        files.forEach(file => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            
            const tdCb = document.createElement('td');
            tdCb.className = 'model-cb-cell';
            tdCb.style.padding = '0.5rem';
            tdCb.style.display = showCb ? 'table-cell' : 'none';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'model-checkbox';
            cb.value = file.name;
            tdCb.appendChild(cb);
            
            const tdName = document.createElement('td');
            tdName.style.padding = '0.5rem';
            tdName.textContent = file.name;
            
            const tdSize = document.createElement('td');
            tdSize.style.padding = '0.5rem';
            tdSize.style.textAlign = 'right';
            tdSize.style.color = 'var(--text-muted)';
            tdSize.textContent = formatBytesToGB(file.size) + ' GB';
            if (file.size < 1024*1024*1024) {
                tdSize.textContent = (file.size / (1024*1024)).toFixed(2) + ' MB';
            }
            
            tr.appendChild(tdCb);
            tr.appendChild(tdName);
            tr.appendChild(tdSize);
            modelsBody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
        modelsBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem; color:red;">Error loading files</td></tr>';
    }
}

const flagRemovalToggle = document.getElementById('flag-removal-toggle');
const sendRemovalBtn = document.getElementById('send-removal-btn');
const copyPathsBtn = document.getElementById('copy-paths-btn');
const thCheckbox = document.getElementById('th-checkbox');

flagRemovalToggle.addEventListener('change', () => {
    const show = flagRemovalToggle.checked;
    sendRemovalBtn.style.display = show ? 'block' : 'none';
    copyPathsBtn.style.display = show ? 'block' : 'none';
    thCheckbox.style.display = show ? 'table-cell' : 'none';
    document.querySelectorAll('.model-cb-cell').forEach(td => {
        td.style.display = show ? 'table-cell' : 'none';
    });
});

copyPathsBtn.addEventListener('click', async () => {
    const checked = document.querySelectorAll('.model-checkbox:checked');
    if (checked.length === 0) {
        alert('No models selected.');
        return;
    }
    
    let paths = [];
    checked.forEach(cb => {
        paths.push(`/opt/Pinokio/build/api/comfy.git/app/models/${folderSelect.value}/${cb.value}`);
    });
    
    const textToCopy = paths.join('\n');
    try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = copyPathsBtn.textContent;
        copyPathsBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyPathsBtn.textContent = originalText;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy: ', err);
        alert('Failed to copy to clipboard.');
    }
});

sendRemovalBtn.addEventListener('click', async () => {
    const checked = document.querySelectorAll('.model-checkbox:checked');
    if (checked.length === 0) {
        alert('No models selected for removal.');
        return;
    }
    
    let files = [];
    checked.forEach(cb => {
        files.push(cb.value);
    });
    
    sendRemovalBtn.disabled = true;
    sendRemovalBtn.textContent = 'Queueing...';
    
    try {
        const res = await fetch('/queue_deletion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: folderSelect.value,
                files: files
            })
        });
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server returned an empty or invalid response. Did you restart the server?");
        }
        
        const result = await res.json();
        if (res.ok && result.success) {
            alert('Files successfully queued for deletion. The PENDING_MODEL_DELETIONS.sh script has been updated.');
            // uncheck everything
            checked.forEach(cb => cb.checked = false);
        } else {
            alert('Failed to queue deletions: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('Error: ' + e.message);
    } finally {
        sendRemovalBtn.disabled = false;
        sendRemovalBtn.textContent = 'Queue for Deletion';
    }
});

folderSelect.addEventListener('change', fetchModelsInFolder);
refreshModelsBtn.addEventListener('click', () => {
    fetchModelFolders();
    if (folderSelect.value) fetchModelsInFolder();
});

uploadModelBtn.addEventListener('click', async () => {
    const folder = folderSelect.value;
    if (!folder) return;
    
    if (!newModelFile.files || newModelFile.files.length === 0) {
        modelUploadStatus.textContent = 'Please select a file to upload.';
        modelUploadStatus.style.color = 'red';
        return;
    }
    
    const file = newModelFile.files[0];
    modelUploadStatus.textContent = `Uploading ${file.name} to ${folder}... This may take a while.`;
    modelUploadStatus.style.color = 'var(--text-color)';
    uploadModelBtn.disabled = true;
    newModelFile.disabled = true;
    
    try {
        const res = await fetch('/upload_model', {
            method: 'POST',
            headers: {
                'x-folder': encodeURIComponent(folder),
                'x-filename': encodeURIComponent(file.name)
            },
            body: file
        });
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server returned non-JSON response. Please restart the server.");
        }
        
        const result = await res.json();
        if (res.ok && result.success) {
            modelUploadStatus.textContent = 'Upload successful!';
            modelUploadStatus.style.color = 'green';
            newModelFile.value = '';
            fetchModelsInFolder();
        } else {
            modelUploadStatus.textContent = 'Upload failed: ' + (result.error || 'Unknown error');
            modelUploadStatus.style.color = 'red';
        }
    } catch (e) {
        console.error(e);
        modelUploadStatus.textContent = 'Error: ' + e.message;
        modelUploadStatus.style.color = 'red';
    } finally {
        uploadModelBtn.disabled = false;
        newModelFile.disabled = false;
    }
});

// Initialize models browser
fetchModelFolders();

// ----------------------------------------------------
// Templates Browser Logic
// ----------------------------------------------------
const templatesBody = document.getElementById('templates-body');
const refreshTemplatesBtn = document.getElementById('refresh-templates-btn');
const templateFilter = document.getElementById('template-filter');
const flagTemplateRemovalToggle = document.getElementById('flag-template-removal-toggle');
const queueTemplateRemovalBtn = document.getElementById('queue-template-removal-btn');
const thTemplateCheckbox = document.getElementById('th-template-checkbox');
const templatesCountBadge = document.getElementById('templates-count-badge');
let allTemplates = [];

async function fetchTemplates() {
    templatesBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem;">Loading templates...</td></tr>';
    try {
        const res = await fetch('/list_templates');
        if (!res.ok) throw new Error('Failed to fetch templates');
        allTemplates = await res.json();
        if (templatesCountBadge) {
            templatesCountBadge.textContent = `(${allTemplates.length} files)`;
        }
        renderTemplates();
    } catch (e) {
        console.error(e);
        templatesBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem; color:red;">Error loading templates</td></tr>';
    }
}

function renderTemplates() {
    templatesBody.innerHTML = '';
    
    const filterText = templateFilter.value.toLowerCase();
    const filtered = allTemplates.filter(t => t.name.toLowerCase().includes(filterText));
    
    if (filtered.length === 0) {
        templatesBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem; color:var(--text-muted);">No templates found</td></tr>';
        return;
    }
    
    const showCb = flagTemplateRemovalToggle.checked;
    
    filtered.forEach(file => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        const tdCb = document.createElement('td');
        tdCb.className = 'template-cb-cell';
        tdCb.style.padding = '0.5rem';
        tdCb.style.display = showCb ? 'table-cell' : 'none';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'template-checkbox';
        cb.value = file.name;
        tdCb.appendChild(cb);
        
        const tdName = document.createElement('td');
        tdName.style.padding = '0.5rem';
        tdName.textContent = file.name;
        
        const tdSize = document.createElement('td');
        tdSize.style.padding = '0.5rem';
        tdSize.style.textAlign = 'right';
        tdSize.style.color = 'var(--text-muted)';
        
        let sizeStr = formatBytesToGB(file.size) + ' GB';
        if (file.size < 1024*1024*1024) {
            sizeStr = (file.size / (1024*1024)).toFixed(2) + ' MB';
        }
        if (file.size < 1024*1024) {
            sizeStr = (file.size / 1024).toFixed(2) + ' KB';
        }
        tdSize.textContent = sizeStr;
        
        tr.appendChild(tdCb);
        tr.appendChild(tdName);
        tr.appendChild(tdSize);
        templatesBody.appendChild(tr);
    });
}

templateFilter.addEventListener('input', renderTemplates);
refreshTemplatesBtn.addEventListener('click', fetchTemplates);

flagTemplateRemovalToggle.addEventListener('change', () => {
    const show = flagTemplateRemovalToggle.checked;
    queueTemplateRemovalBtn.style.display = show ? 'block' : 'none';
    thTemplateCheckbox.style.display = show ? 'table-cell' : 'none';
    document.querySelectorAll('.template-cb-cell').forEach(td => {
        td.style.display = show ? 'table-cell' : 'none';
    });
});

queueTemplateRemovalBtn.addEventListener('click', async () => {
    const checked = document.querySelectorAll('.template-checkbox:checked');
    if (checked.length === 0) {
        alert('No templates selected for removal.');
        return;
    }
    
    let files = [];
    checked.forEach(cb => files.push(cb.value));
    
    queueTemplateRemovalBtn.disabled = true;
    queueTemplateRemovalBtn.textContent = 'Queueing...';
    
    try {
        const res = await fetch('/queue_deletion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'template',
                files: files
            })
        });
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server returned invalid response. Did you restart the server?");
        }
        
        const result = await res.json();
        if (res.ok && result.success) {
            alert('Templates queued for deletion. The PENDING_TEMPLATE_DELETIONS.sh script has been updated.');
            checked.forEach(cb => cb.checked = false);
            fetchTemplates(); // refresh
        } else {
            alert('Failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('Error: ' + e.message);
    } finally {
        queueTemplateRemovalBtn.disabled = false;
        queueTemplateRemovalBtn.textContent = 'Queue for Deletion';
    }
});

// Initialize templates
fetchTemplates();
