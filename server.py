import http.server
import socketserver
import json
import os
import time
import subprocess
import re

PORT = 8084

def get_uptime():
    try:
        with open('/proc/uptime', 'r') as f:
            uptime_seconds = float(f.readline().split()[0])
        return uptime_seconds
    except Exception:
        return 0

def get_os_info():
    try:
        with open('/etc/os-release') as f:
            for line in f:
                if line.startswith('PRETTY_NAME='):
                    return line.split('=')[1].strip().strip('"')
    except:
        pass
    try:
        return os.uname().sysname
    except:
        return "Unknown OS"

last_idle = 0
last_total = 0

def get_cpu_load():
    global last_idle, last_total
    try:
        with open('/proc/stat') as f:
            line = f.readline()
            parts = line.split()
            if parts[0] == 'cpu':
                idle = float(parts[4]) + float(parts[5]) # idle + iowait
                non_idle = sum(float(x) for x in [parts[1], parts[2], parts[3], parts[6], parts[7], parts[8]])
                total = idle + non_idle
                
                total_delta = total - last_total
                idle_delta = idle - last_idle
                
                last_total = total
                last_idle = idle
                
                if total_delta == 0:
                    return 0.0
                
                utilization = 100.0 * (1.0 - idle_delta / total_delta)
                return utilization
    except Exception:
        return 0.0
    return 0.0

def get_memory_info():
    meminfo = {}
    try:
        with open('/proc/meminfo') as f:
            for line in f:
                parts = line.split(':')
                if len(parts) == 2:
                    meminfo[parts[0]] = int(parts[1].split()[0]) * 1024 # bytes
        
        total = meminfo.get('MemTotal', 0)
        free = meminfo.get('MemFree', 0)
        buffers = meminfo.get('Buffers', 0)
        cached = meminfo.get('Cached', 0)
        used = total - free - buffers - cached
        return total, used
    except Exception:
        return 0, 0

def get_disk_info():
    try:
        st = os.statvfs('/')
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - free
        return total, used
    except Exception:
        return 0, 0

def get_gpu_info():
    try:
        output = subprocess.check_output(
            ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
            timeout=2, universal_newlines=True
        )
        lines = output.strip().split('\n')
        if lines:
            parts = lines[0].split(',')
            if len(parts) >= 3:
                util_str = parts[0].strip()
                util = 0.0 if 'N/A' in util_str else float(util_str)
                mem_used = float(parts[1].strip()) * 1024 * 1024 # MB to bytes
                mem_total = float(parts[2].strip()) * 1024 * 1024 # MB to bytes
                return util, mem_used, mem_total
    except Exception:
        pass
    return 0.0, 0.0, 0.0

def get_open_ports():
    ports = []
    try:
        output = subprocess.check_output(["ss", "-tulnp"], universal_newlines=True)
        lines = output.strip().split("\n")[1:]
        
        for line in lines:
            parts = line.split()
            if len(parts) < 5: continue
            
            protocol = parts[0]
            state = parts[1]
            local_address = parts[4]
            
            address_parts = local_address.rsplit(":", 1)
            if len(address_parts) != 2: continue
            
            ip = address_parts[0]
            port = address_parts[1]
            
            process = "Unknown"
            rest_of_line = " ".join(parts[5:])
            if "users:" in rest_of_line:
                match = re.search(r'users:\(\("([^"]+)"', rest_of_line)
                if match:
                    process = match.group(1)
            
            ports.append({
                "protocol": protocol,
                "port": int(port) if port.isdigit() else port,
                "state": state,
                "process": process
            })
            
    except Exception as e:
        pass
        
    unique_ports = {}
    for p in ports:
        key = f"{p['protocol']}-{p['port']}"
        if key not in unique_ports or (unique_ports[key]['process'] == 'Unknown' and p['process'] != 'Unknown'):
            unique_ports[key] = p
            
    sorted_ports = sorted(list(unique_ports.values()), key=lambda x: (x['port'] if isinstance(x['port'], int) else 0))
    return sorted_ports

class MonitorHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="public", **kwargs)

    def do_GET(self):
        if self.path == '/stats':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            cpu = get_cpu_load()
            mem_total, mem_used = get_memory_info()
            disk_total, disk_used = get_disk_info()
            gpu_util, gpu_mem_used, gpu_mem_total = get_gpu_info()
            uptime = get_uptime()
            os_name = get_os_info()
            open_ports = get_open_ports()
            
            data = {
                'cpu': cpu,
                'memory': {
                    'total': mem_total,
                    'active': mem_used
                },
                'disk': {
                    'total': disk_total,
                    'used': disk_used
                },
                'gpu': {
                    'utilization': gpu_util,
                    'memory_used': gpu_mem_used,
                    'memory_total': gpu_mem_total
                },
                'ports': open_ports,
                'uptime': uptime,
                'os': os_name
            }
            self.wfile.write(json.dumps(data).encode('utf-8'))
        else:
            super().do_GET()

# Pre-load CPU data
get_cpu_load()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    pass

if __name__ == '__main__':
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, MonitorHandler)
    print(f"System monitor running on port {PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
