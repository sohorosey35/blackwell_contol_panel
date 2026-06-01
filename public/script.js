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
    
    // Disk
    if (data.disk && data.disk.total) {
        const diskUsedGB = formatBytesToGB(data.disk.used);
        const diskTotalGB = formatBytesToGB(data.disk.total);
        const diskPercent = (data.disk.used / data.disk.total) * 100;
        diskVal.textContent = `${diskUsedGB} / ${diskTotalGB} GB`;
        updateProgressBar(diskBar, diskPercent);
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
