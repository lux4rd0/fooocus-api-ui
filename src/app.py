from flask import Flask, jsonify, request, render_template, send_file, send_from_directory
import requests
import json
import io
from PIL import Image
import base64
import os
import glob
import time
from threading import Thread, Event
from datetime import datetime, timedelta
import logging


app = Flask(__name__, static_folder="static", template_folder="templates")

# Initialize logger
logging.basicConfig(level=logging.INFO)




stop_event = Event()


BROWSE_ROOT = "input"
FACE_SWAP_IMAGE_FOLDER = "faceswap_images"
UPSCALE_FOLDER = BROWSE_ROOT



if not os.path.exists(BROWSE_ROOT):
    os.makedirs(BROWSE_ROOT)

stop_status = {
    "total_time": 0,
    "running_jobs": 0,
    "is_stopping": False,
    "stopped_jobs": 0,
}

class FooocusAPI:
    def __init__(self, base_url="http://ai01.tylephony.com:8888"):
        self.base_url = base_url

    def get_job_history(self, only_unfinished=False):
        url = f"{self.base_url}/v1/generation/job-history"
        response = requests.get(url)
        if response.status_code == 200:
            history = response.json()
            if only_unfinished:
                unfinished_jobs = [
                    job for job in history["queue"] if not job["is_finished"]
                ]
                for job in unfinished_jobs:
                    detailed_status = self.check_status(job["job_id"])
                    job.update(detailed_status)
                return {"queue": unfinished_jobs}
            else:
                for job in history["history"]:
                    if job["is_finished"]:
                        detailed_status = self.check_status(job["job_id"])
                        job["details"] = detailed_status
                return history
        else:
            return {"error": response.status_code, "message": response.text}

    def check_status(self, job_id):
        url = f"{self.base_url}/v1/generation/query-job"
        params = {"job_id": job_id, "require_step_preview": True}
        logging.info("Sending to Fooocus API (check status): %s", json.dumps(params, indent=4))
        response = requests.get(url, params=params)
        if response.status_code == 200:
            status_data = response.json()
            if status_data.get("job_result"):
                for result in status_data["job_result"]:
                    if result["url"]:
                        result["url"] = result["url"].replace(
                            "127.0.0.1:8888", self.base_url.split("//")[1]
                        )
            return status_data
        else:
            return {"error": response.status_code, "message": response.text}

    def stop_job(self):
        url = f"{self.base_url}/v1/generation/stop"
        data = {}  # No job_id required
        logging.info("Sending to Fooocus API (stop job): %s", json.dumps(data, indent=4))
        response = requests.post(url, json=data)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": response.status_code, "message": response.text}


    def stop_all_jobs(self):
        global stop_status
        stop_status = {
            "total_time": 0,
            "running_jobs": 0,
            "is_stopping": True,
            "stopped_jobs": 0,
        }
        start_time = time.time()
        while True:
            history = self.get_job_history(only_unfinished=True)
            all_stopped = True
            if "queue" in history:
                stop_status["running_jobs"] = len(history["queue"])
                for job in history["queue"]:
                    if not job["is_finished"]:
                        all_stopped = False
                        result = self.stop_job(job["job_id"])
                        stop_status["stopped_jobs"] += 1
                        print(f'Stop job {job["job_id"]} response:', result)
            if all_stopped:
                break
            time.sleep(5)  # Wait for 5 seconds before checking again
        stop_status["total_time"] = time.time() - start_time
        stop_status["is_stopping"] = False

    def fetch_image_data(self, image_url, job_id, suffix):
        cache_path = os.path.join(CACHE_DIR, f"{job_id}_{suffix}.png")
        if os.path.exists(cache_path):
            with open(cache_path, "rb") as f:
                return f.read()
        try:
            response = requests.get(image_url)
            response.raise_for_status()
            with open(cache_path, "wb") as f:
                f.write(response.content)
            return response.content
        except Exception as e:
            print(f"Error fetching image: {e}")
            return None

    def create_thumbnail(self, image_data, thumbnail_size=(250, 250)):
        try:
            image = Image.open(io.BytesIO(image_data))
            image.thumbnail(thumbnail_size)
            thumb_byte_arr = io.BytesIO()
            image.save(thumb_byte_arr, format="PNG")
            return thumb_byte_arr.getvalue()
        except Exception as e:
            print(f"Error creating thumbnail: {e}")
            return None

    def get_cache_stats(self):
        total_size = 0
        total_files = 0
        for dirpath, dirnames, filenames in os.walk(CACHE_DIR):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                total_size += os.path.getsize(fp)
                total_files += 1
        return {"total_size": self.format_size(total_size), "total_files": total_files}

    def clear_cache(self):
        for dirpath, dirnames, filenames in os.walk(CACHE_DIR):
            for f in filenames:
                os.remove(os.path.join(dirpath, f))
        return {"msg": "Cache cleared."}

    def format_size(self, size):
        for unit in ["bytes", "KB", "MB", "GB", "TB"]:
            if size < 1024:
                return f"{size:.2f} {unit}"
            size /= 1024

    def upscale_image(self, image_path):
        url = f"{self.base_url}/v2/generation/image-upscale-vary"
        with open(image_path, "rb") as image_file:
            image_data = base64.b64encode(image_file.read()).decode("utf-8")
        data = {
            "uov_method": "Upscale (2x)",
            "overwrite_upscale_strength": 0.2,
            "performance_selection": "Quality",
            "image_number": 1,
            "input_image": image_data,
            "async_process": True,
        }
        logging.info("Sending to Fooocus API (upscale image): %s", json.dumps(data, indent=4))
        response = requests.post(
            url, json=data, headers={"Content-Type": "application/json"}
        )
        try:
            return response.json()
        except json.JSONDecodeError:
            return {"error": "Invalid response from server"}

    def image_prompt(self, params: dict) -> dict:
        url = f"{self.base_url}/v2/generation/image-prompt"
        # Truncate the cn_img for logging
        truncated_params = json.loads(json.dumps(params))
        if 'image_prompts' in truncated_params:
            for image_prompt in truncated_params['image_prompts']:
                if 'cn_img' in image_prompt:
                    image_prompt['cn_img'] = image_prompt['cn_img'][:12] + '...'
        logging.info("Sending to Fooocus API (image prompt): %s", json.dumps(truncated_params, indent=4))
        response = requests.post(url, json=params, timeout=300)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": response.status_code, "message": response.text}


def human_readable_time(seconds):
    return str(timedelta(seconds=round(seconds)))


def stop_all_jobs_background():
    global stop_status, stop_event
    stop_event.clear()
    stop_status = {
        "total_time": 0,
        "running_jobs": 0,
        "is_stopping": True,
        "stopped_jobs": 0,
        "total_jobs": 0,
        "estimated_time_remaining": "N/A",
    }
    start_time = time.time()
    stopped_job_ids = set()
    job_stop_times = []

    while not stop_event.is_set():
        history = fooocus_api.get_job_history(only_unfinished=True)
        all_stopped = True
        if "queue" in history:
            running_jobs = [
                job for job in history["queue"] if job["job_stage"] == "RUNNING"
            ]
            waiting_jobs = [
                job for job in history["queue"] if job["job_stage"] == "WAITING"
            ]

            total_jobs = len(running_jobs) + len(waiting_jobs)
            stop_status["running_jobs"] = total_jobs
            stop_status["total_jobs"] = total_jobs

            if running_jobs:
                for job in running_jobs:
                    if (
                        job["job_id"] not in stopped_job_ids
                        and "Step" in job["job_status"]
                    ):
                        result = fooocus_api.stop_job(job["job_id"])
                        stopped_job_ids.add(job["job_id"])
                        job_stop_start_time = time.time()
                        while True:
                            time.sleep(5)  # Poll every 5 seconds
                            updated_status = fooocus_api.check_status(job["job_id"])
                            if updated_status.get("job_stage") != "RUNNING":
                                job_stop_end_time = time.time()
                                job_stop_times.append(
                                    job_stop_end_time - job_stop_start_time
                                )
                                stop_status["stopped_jobs"] += 1
                                break
                        print(f'Stop job {job["job_id"]} response:', result)
                all_stopped = False  # Since we found a running job and tried to stop it

            elif waiting_jobs:
                all_stopped = False  # Keep looping as there are waiting jobs that might start running

        if len(job_stop_times) >= 2:
            average_stop_time = sum(job_stop_times) / len(job_stop_times)
            estimated_total_time = average_stop_time * (
                stop_status["running_jobs"] - stop_status["stopped_jobs"]
            )
            elapsed_time = time.time() - start_time
            stop_status["estimated_time_remaining"] = human_readable_time(
                estimated_total_time - elapsed_time
            )
        else:
            stop_status["estimated_time_remaining"] = "N/A"

        if all_stopped:
            break

        time.sleep(5)  # Wait for 5 seconds before checking again

    # Final check to ensure no jobs are left running
    final_history = fooocus_api.get_job_history(only_unfinished=True)
    if "queue" in final_history and final_history["queue"]:
        stop_status["running_jobs"] = len(final_history["queue"])
        stop_status["is_stopping"] = True
    else:
        stop_status["total_time"] = human_readable_time(time.time() - start_time)
        stop_status["is_stopping"] = False


fooocus_api = FooocusAPI()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/status")
def status():
    return render_template("status.html")


@app.route("/add-upscale")
def add_upscale():
    return render_template("add-upscale.html")


@app.route("/add-faceswap")
def add_faceswap():
    return render_template("add-faceswap.html")


@app.route("/history")
def history():
    return render_template("history.html")


@app.route("/stop-all")
def stop_all():
    return render_template("stop-all.html")


@app.route("/clear-cache")
def clear_cache():
    return render_template("clear-cache.html")

def parse_api_servers(env_var):
    servers = []
    server_entries = env_var.split(';')
    for entry in server_entries:
        parts = entry.split(',')
        if len(parts) >= 2:
            name = ','.join(parts[:-1]).strip()  # Join all parts except the last as the name
            url = parts[-1].strip()              # Last part is the URL
            servers.append({"name": name, "url": url})
    return servers

@app.route('/config')
def get_config():
    api_servers_env = os.getenv('API_SERVERS', 'Default Server,http://0.0.0.0:8888')
    api_servers = parse_api_servers(api_servers_env)
    return jsonify(api_servers)


@app.route("/api/upscale/status", methods=["GET"])
def job_status():
    history = fooocus_api.get_job_history(only_unfinished=True)
    unfinished_jobs = history.get("queue", [])
    return jsonify(unfinished_jobs)



@app.route("/api/upscale/stop", methods=["POST"])
def stop_job():
    response = fooocus_api.stop_job()  # Updated to not take job_id
    if "error" in response:
        return jsonify(response), 500
    return jsonify(response)



@app.route("/api/upscale/stop/all", methods=["POST"])
def stop_all_jobs():
    thread = Thread(target=stop_all_jobs_background)
    thread.start()
    history = fooocus_api.get_job_history(only_unfinished=True)
    return jsonify(
        {"message": "Stopping all jobs", "total_jobs": len(history.get("queue", []))}
    )


@app.route("/api/upscale/stop-all/terminate", methods=["POST"])
def terminate_stop_all_jobs():
    global stop_event, stop_status
    stop_event.set()
    stop_status["is_stopping"] = False
    stop_status["total_time"] = "N/A"
    stop_status["estimated_time_remaining"] = "N/A"
    return jsonify({"message": "Stopping stop-all-jobs process"})


@app.route("/api/upscale/stop-status", methods=["GET"])
def stop_status_update():
    return jsonify(stop_status)


@app.route("/api/upscale/cache/clear", methods=["POST"])
def api_clear_cache():
    result = fooocus_api.clear_cache()
    return jsonify(result)


@app.route("/upload", methods=["POST"])
def upload_file():
    if request.content_type.startswith("multipart/form-data"):
        files = request.files.getlist("file")
        if not files:
            app.logger.error("No files selected for uploading")
            return jsonify({"error": "No files selected for uploading"}), 400

        file_paths = []
        for file in files:
            filename = file.filename
            if filename == "":
                app.logger.error("No selected file")
                return jsonify({"error": "No selected file"}), 400
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(file_path)
            file_paths.append(file_path)

        for file_path in file_paths:
            abs_file_path = os.path.abspath(file_path)
            response = fooocus_api.upscale_image(abs_file_path)
            if "error" in response:
                return jsonify(response), 500

        return jsonify({"msg": "Files uploaded and processed successfully."})

    elif request.content_type == "application/json":
        file_paths = request.json.get("file_paths", [])
        if not file_paths:
            return jsonify({"error": "No file paths provided"}), 400
        for file_path in file_paths:
            abs_file_path = os.path.abspath(os.path.join(BROWSE_ROOT, file_path))
            if not abs_file_path.startswith(os.path.abspath(BROWSE_ROOT)):
                return jsonify({"error": "Invalid file path"}), 400
            response = fooocus_api.upscale_image(abs_file_path)
            if "error" in response:
                return jsonify(response), 500
        return jsonify({"msg": "Files submitted successfully."})
    else:
        return jsonify({"error": "Unsupported media type"}), 415


@app.route("/upload-server", methods=["POST"])
def upload_from_server():
    file_pattern = request.json.get("file_pattern", "")
    image_paths = glob.glob(os.path.join(BROWSE_ROOT, file_pattern))
    if not image_paths:
        return jsonify({"error": f"No images found for pattern: {file_pattern}"}), 400
    for image_path in image_paths:
        response = fooocus_api.upscale_image(image_path)
        if "error" in response:
            return jsonify(response), 500
    return jsonify({"msg": "Server files submitted successfully."})


@app.route('/browse', methods=['GET'])
def browse_files():
    dir_path = request.args.get("dir", "")
    abs_dir_path = os.path.abspath(os.path.join(BROWSE_ROOT, dir_path))
    if not abs_dir_path.startswith(os.path.abspath(BROWSE_ROOT)):
        return jsonify({"error": "Invalid directory path"}), 400
    files = []
    dirs = []
    try:
        for entry in os.listdir(abs_dir_path):
            if entry.startswith("."):
                continue  # Ignore hidden files
            full_path = os.path.join(abs_dir_path, entry)
            if os.path.isdir(full_path):
                dirs.append(entry)
            else:
                files.append({
                    "name": entry,
                    "mtime": os.path.getmtime(full_path)  # Modification time
                })
        return jsonify({"dirs": dirs, "files": files, "current_dir": dir_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route("/api/thumbnail/<path:file_path>", methods=["GET"])
def get_file_thumbnail(file_path):
    abs_file_path = os.path.abspath(os.path.join(BROWSE_ROOT, file_path))
    if not abs_file_path.startswith(os.path.abspath(BROWSE_ROOT)):
        return jsonify({"error": "Invalid file path"}), 400
    try:
        with open(abs_file_path, "rb") as image_file:
            image_data = image_file.read()
        thumbnail_data = fooocus_api.create_thumbnail(image_data)
        if thumbnail_data:
            return send_file(io.BytesIO(thumbnail_data), mimetype="image/png")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/faceswap', methods=['POST'])
def add_faceswap_job():
    data = request.json
    prompt = data.get('prompt')
    image_selection = data.get('image_selection')
    stop_at = data.get('stop_at', 0.95)
    weight = data.get('weight', 1.0)
    image_number = data.get('image_number', 1)
    quality = data.get('quality', 'Speed')
    save_extension = data.get('save_extension', 'png')
    save_name = data.get('save_name', '')
    save_meta = data.get('save_meta', False)
    meta_scheme = data.get('meta_scheme', '')

    # Read the selected image from the predefined folder
    image_path = os.path.join('faceswap_images', image_selection)
    with open(image_path, "rb") as f:
        selected_image = base64.b64encode(f.read()).decode('utf-8')

    # Prepare the Face Swap parameters
    face_swap_params = {
        "performance_selection": quality,
        "aspect_ratios_selection": data.get('aspect_ratios_selection', '896x1152'),
        "prompt": prompt,
        "image_prompts": [
            {
                "cn_img": selected_image,
                "cn_stop": stop_at,
                "cn_weight": weight,
                "cn_type": "FaceSwap"
            }
        ],
        "image_number": image_number,
        "async_process": True,
        "save_extension": save_extension,
        "save_name": generate_save_name(save_name),
        "save_meta": save_meta,
        "meta_scheme": meta_scheme
    }

    # Remove null values
    face_swap_params = {k: v for k, v in face_swap_params.items() if v is not None}

    # Log the JSON being sent to Fooocus API, truncate the cn_img to 12 characters
    truncated_params = json.loads(json.dumps(face_swap_params))
    truncated_params["image_prompts"][0]["cn_img"] = truncated_params["image_prompts"][0]["cn_img"][:12] + '...'
    logging.info("Sending to Fooocus API: %s", json.dumps(truncated_params, indent=4))

    # Call the Fooocus API for Face Swap
    response = fooocus_api.image_prompt(face_swap_params)
    return jsonify(response)

def generate_save_name(user_provided_name):
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    if user_provided_name:
        return f"{timestamp}_{user_provided_name}"
    else:
        return timestamp


@app.route("/upscale_images/<filename>")
def serve_upscale_image(filename):
    return send_from_directory(UPSCALE_FOLDER, filename)





@app.route("/api/faceswap/images", methods=["GET"])
def get_faceswap_images():
    images = [f for f in os.listdir("faceswap_images") if not f.startswith(".")]
    return jsonify({"images": images})

@app.route('/faceswap_images/<path:filename>')
def serve_image(filename):
    return send_from_directory(FACE_SWAP_IMAGE_FOLDER, filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6069, debug=True)
