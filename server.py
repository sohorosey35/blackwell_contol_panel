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
            return

        models_dir = "/opt/Pinokio/build/api/comfy.git/app/models/"

        if self.path == '/list_model_folders':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            folders = []
            if os.path.exists(models_dir):
                for f in os.listdir(models_dir):
                    p = os.path.join(models_dir, f)
                    if os.path.isdir(p):
                        folders.append(f)
            folders.sort()
            self.wfile.write(json.dumps(folders).encode('utf-8'))
            return

        if self.path.startswith('/list_models?'):
            from urllib.parse import parse_qs, urlparse
            query = parse_qs(urlparse(self.path).query)
            folder = query.get('folder', [''])[0]
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            files = []
            if folder:
                folder_path = os.path.join(models_dir, folder)
                # basic security check to prevent directory traversal
                if os.path.abspath(folder_path).startswith(os.path.abspath(models_dir)) and os.path.isdir(folder_path):
                    for f in os.listdir(folder_path):
                        p = os.path.join(folder_path, f)
                        if os.path.isfile(p):
                            files.append({"name": f, "size": os.path.getsize(p)})
            files.sort(key=lambda x: x["name"])
            self.wfile.write(json.dumps(files).encode('utf-8'))
            return

        if self.path == '/list_templates':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            target_dir = "/Volumes/mnt/projects/rosey/reference/comfyui/blackwell_rtx_6000/custom_nodes/comfyui_soho_nodes/example_workflows"
            files = []
            if os.path.exists(target_dir):
                for f in os.listdir(target_dir):
                    if f.startswith('._') or f == '.DS_Store':
                        continue
                    p = os.path.join(target_dir, f)
                    if os.path.isfile(p):
                        files.append({"name": f, "size": os.path.getsize(p)})
            files.sort(key=lambda x: x["name"])
            self.wfile.write(json.dumps(files).encode('utf-8'))
            return

        if self.path == '/list_hidden_files':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            target_dirs = [
                "/opt/Pinokio/build/api/comfy.git/app/custom_nodes",
                "/Volumes/mnt/projects/rosey/reference/comfyui/blackwell_rtx_6000/custom_nodes",
                "/opt/Pinokio/build/api/comfy.git/app/models"
            ]
            files = []
            for target_dir in target_dirs:
                if os.path.exists(target_dir):
                    for root, dirs, filenames in os.walk(target_dir, followlinks=True):
                        for f in filenames:
                            if f.startswith('._') or f == '.DS_Store':
                                p = os.path.join(root, f)
                                files.append({"name": f, "path": p, "size": os.path.getsize(p)})
            files.sort(key=lambda x: x["path"])
            self.wfile.write(json.dumps(files).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        import urllib.parse
        if self.path == '/upload_model':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                folder = urllib.parse.unquote(self.headers.get('x-folder', ''))
                filename = urllib.parse.unquote(self.headers.get('x-filename', ''))
                
                if not folder or not filename:
                    raise ValueError("Missing folder or filename")

                total, used = get_disk_info()
                if total > 0:
                    if (used + content_length) / total > 0.90:
                        self.send_response(400)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"success": False, "error": "Disk capacity would exceed 90%"}).encode('utf-8'))
                        return

                models_dir = "/opt/Pinokio/build/api/comfy.git/app/models/"
                target_dir = os.path.join(models_dir, folder)
                if not os.path.abspath(target_dir).startswith(os.path.abspath(models_dir)):
                    raise ValueError("Invalid folder")

                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, filename)

                with open(target_path, 'wb') as f:
                    remaining = content_length
                    while remaining > 0:
                        chunk = self.rfile.read(min(remaining, 8192 * 1024))
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))

            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
            return


        if self.path == '/queue_deletion':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(post_data.decode('utf-8'))
                
                type_val = payload.get('type', 'model')
                files = payload.get('files', [])
                
                if not files:
                    raise ValueError("Missing files")
                    
                if type_val == 'model':
                    folder = payload.get('folder')
                    if not folder:
                        raise ValueError("Missing folder")
                    base_dir = "/opt/Pinokio/build/api/comfy.git/app/models/"
                    target_dir = os.path.join(base_dir, folder)
                elif type_val == 'template':
                    target_dir = "/Volumes/mnt/projects/rosey/reference/comfyui/blackwell_rtx_6000/custom_nodes/comfyui_soho_nodes/example_workflows"
                    base_dir = target_dir
                elif type_val == 'hidden_file':
                    pass
                else:
                    raise ValueError("Invalid type")
                    
                if type_val != 'hidden_file' and not os.path.abspath(target_dir).startswith(os.path.abspath(base_dir)):
                    raise ValueError("Invalid folder path")

                if type_val == 'template':
                    script_path = "/opt/Pinokio/build/api/comfy.git/PENDING_TEMPLATE_DELETIONS.sh"
                elif type_val == 'hidden_file':
                    script_path = "/opt/Pinokio/build/api/comfy.git/PENDING_HIDDEN_DELETIONS.sh"
                else:
                    script_path = "/opt/Pinokio/build/api/comfy.git/PENDING_MODEL_DELETIONS.sh"
                
                if not os.path.exists(script_path):
                    with open(script_path, 'w', encoding='utf-8') as f:
                        f.write("#!/bin/bash\n\n")
                    os.chmod(script_path, 0o755)

                with open(script_path, 'a', encoding='utf-8') as f:
                    for filename in files:
                        if type_val == 'hidden_file':
                            safe_path = os.path.abspath(filename)
                            # Ensure it's in one of the allowed directories
                            allowed_dirs = [
                                "/opt/Pinokio/build/api/comfy.git/app/custom_nodes",
                                "/Volumes/mnt/projects/rosey/reference/comfyui/blackwell_rtx_6000/custom_nodes",
                                "/opt/Pinokio/build/api/comfy.git/app/models"
                            ]
                            if not any(safe_path.startswith(os.path.abspath(d)) for d in allowed_dirs):
                                continue
                        else:
                            safe_path = os.path.join(target_dir, filename)
                        f.write(f'rm "{safe_path}"\n')

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
            return

        if self.path == '/upload_template':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length) if content_length > 0 else b'{}'

                import base64
                import shutil
                from datetime import datetime
                
                payload = json.loads(post_data.decode('utf-8'))
                json_filename = payload.get('json_filename')
                json_content = payload.get('json_content')
                has_image = payload.get('has_image')
                image_base64 = payload.get('image_base64')

                if not json_filename or not json_filename.endswith('.json'):
                    raise ValueError("Invalid json filename")

                base_name = json_filename[:-5]
                image_filename = f"{base_name}.jpg" if has_image else None

                target_dir = "/Volumes/mnt/projects/rosey/reference/comfyui/blackwell_rtx_6000/custom_nodes/comfyui_soho_nodes/example_workflows"
                backup_dir = "/Volumes/mnt/projects/rosey/reference/comfyui/blackwell_rtx_6000/custom_nodes/comfyui_soho_nodes/example_workflows_bak"

                os.makedirs(target_dir, exist_ok=True)
                os.makedirs(backup_dir, exist_ok=True)

                target_json_path = os.path.join(target_dir, json_filename)
                target_image_path = os.path.join(target_dir, image_filename) if has_image else None

                # Backup existing json if needed
                if os.path.exists(target_json_path):
                    date_str = datetime.now().strftime("%m_%d_%Y")
                    idx = 1
                    while True:
                        bak_name = f"{base_name}_{date_str}_{idx:02d}.json"
                        bak_path = os.path.join(backup_dir, bak_name)
                        if not os.path.exists(bak_path):
                            break
                        idx += 1
                    shutil.copy2(target_json_path, bak_path)

                # Write json
                with open(target_json_path, 'w', encoding='utf-8') as f:
                    f.write(json_content)

                # Backup existing image if needed
                if has_image:
                    if os.path.exists(target_image_path):
                        date_str = datetime.now().strftime("%m_%d_%Y")
                        idx = 1
                        while True:
                            bak_name = f"{base_name}_{date_str}_{idx:02d}.jpg"
                            bak_path = os.path.join(backup_dir, bak_name)
                            if not os.path.exists(bak_path):
                                break
                            idx += 1
                        shutil.copy2(target_image_path, bak_path)
                    
                    with open(target_image_path, 'wb') as f:
                        f.write(base64.b64decode(image_base64))

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))

            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
            return
            
        self.send_response(404)
        self.end_headers()

# Pre-load CPU data
get_cpu_load()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    pass

if __name__ == '__main__':
    server_address = ('0.0.0.0', PORT)
    try:
        httpd = ThreadingHTTPServer(server_address, MonitorHandler)
    except OSError as e:
        if e.errno == 98: # Address already in use
            print(f"Port {PORT} is already in use.")
            try:
                output = subprocess.check_output(["ss", "-lptn", f"sport = :{PORT}"], universal_newlines=True)
                match = re.search(r'pid=(\d+)', output)
                if match:
                    pid = match.group(1)
                    print(f"Process {pid} is using port {PORT}. Automatically killing it...")
                    os.kill(int(pid), 9)
                    time.sleep(1)
                    httpd = ThreadingHTTPServer(server_address, MonitorHandler)
                else:
                    print("Could not determine which process is using the port. Exiting.")
                    exit(1)
            except Exception as ex:
                print(f"Could not kill the process: {ex}")
                exit(1)
        else:
            raise

    print(f"System monitor running at http://0.0.0.0:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
