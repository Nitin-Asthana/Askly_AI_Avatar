import subprocess
import os
import sys

# Ensure subprocess calls don't create windows on Windows
if os.name == 'nt':
    import subprocess
    # Set default creation flags for all subprocess calls
    subprocess._USE_POSIX_SPAWN = False
    
    # Hide console window for the main Python process if running as GUI
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        user32 = ctypes.windll.user32
        SW_HIDE = 0
        hWnd = kernel32.GetConsoleWindow()
        if hWnd and '--hide-console' in sys.argv:
            user32.ShowWindow(hWnd, SW_HIDE)
    except:
        pass  # Ignore if ctypes is not available

# Only one Flask app instance
# All imports above


from ask_ai_utils import ask_ai_response
from processor import OUTPUTS_CONTAINER, SLIDES_CONTAINER
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from blob_utils import blob_service_client
from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta
from processor import convert_pptx_to_pngs, extract_notes, clean_text, generate_slide_script, OUTPUTS_CONTAINER, SLIDES_CONTAINER, upload_file_path, upload_file_bytes
import re, uuid, os, tempfile, json, shutil
import os
from blob_utils import download_to_path
import traceback

from openai_utils import generate_script_from_notes  # Your Azure OpenAI logic
from processor import upload_file_path

# --- Job tracking for real-time progress ---
import threading
import time
import uuid



from job_store import load_jobs, save_jobs
jobs = load_jobs()

# Define the upload container name (replace with your actual container name)
UPLOAD_CONTAINER = "uploads"

# Only one Flask app instance
# All imports above
app = Flask(__name__)
CORS(app)


# Health check endpoint
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


# Ask AI endpoint (separate logic)
@app.route("/api/ask_ai", methods=["POST"])
def ask_ai():
    data = request.get_json()
    question = data.get("question", "").strip()
    if not question:
        return jsonify({"error": "No question provided."}), 400
    try:
        answer = ask_ai_response(question)
        return jsonify({"answer": answer})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/latest_job_id", methods=["GET"])
def latest_job_id():
    if not jobs:
        return jsonify({"error": "No jobs found"}), 404
    latest_id = list(jobs.keys())[-1]
    return jsonify({"job_id": latest_id})

# Add endpoint to unload content
@app.route('/unload_content', methods=['POST'])
def unload_content_endpoint():
    try:
        result = subprocess.run(['python', 'unload_content.py'], cwd=os.path.dirname(__file__), capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode == 0:
            return jsonify({'status': 'success', 'output': result.stdout}), 200
        else:
            return jsonify({'status': 'error', 'output': result.stderr}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'output': str(e)}), 500

# Helper: background processing thread
def background_process_ppt(job_id, blob_container, blob_name, avatar):
    try:
        print(f"[JOB {job_id}] Starting processing for blob: {blob_name}")
        presentation_id = str(uuid.uuid4())
        
        # Create temporary directory with better handling
        tmpdir = tempfile.mkdtemp(prefix='ppt_processing_')
        print(f"[JOB {job_id}] Created temp directory: {tmpdir}")
        
        try:
            # Use original filename extension
            file_ext = '.pptx' if blob_name.lower().endswith('.pptx') else '.ppt'
            local_ppt = os.path.join(tmpdir, f"presentation{file_ext}")
            
            print(f"[JOB {job_id}] Downloading PPT from blob storage...")
            download_to_path(blob_container, blob_name, local_ppt)
            
            # Verify download
            if not os.path.exists(local_ppt):
                raise Exception(f"Failed to download file to {local_ppt}")
                
            file_size = os.path.getsize(local_ppt)
            print(f"[JOB {job_id}] Downloaded file size: {file_size} bytes")
            
            if file_size == 0:
                raise Exception(f"Downloaded file is empty: {local_ppt}")
            
            print(f"[JOB {job_id}] Converting PPT to slide images (LibreOffice)...")
            pngs = convert_pptx_to_pngs(local_ppt, tmpdir)
            
            print(f"[JOB {job_id}] Extracting notes from slides...")
            slide_notes = extract_notes(local_ppt)
            
            slides_info = []
            narrations = []
            total_slides = len(pngs)
            print(f"[JOB {job_id}] Found {total_slides} slides.")
            
            start_time = time.time()
            for i, png_path in enumerate(pngs, start=1):
                print(f"[JOB {job_id}] Processing slide {i}...")
                jobs[job_id]["current_slide"] = i
                save_jobs(jobs)
                blob_name_out = f"{presentation_id}/slide-{i}.png"
                print(f"[JOB {job_id}] Uploading slide image {blob_name_out}...")
                url = upload_file_path(SLIDES_CONTAINER, blob_name_out, png_path)
                notes = clean_text(slide_notes[i-1]['notes'] if i-1 < len(slide_notes) else "")
                title = clean_text(slide_notes[i-1]['title'] if i-1 < len(slide_notes) else f"Slide {i}")
                narration = ""
                narration_blob_name = f"{presentation_id}/slide-{i}-narration.txt"
                try:
                    print(f"[JOB {job_id}] Generating narration for slide {i}...")
                    narration_input = notes
                    if not notes:
                        narration_input = f"This slide is titled '{title}'. Please provide a brief spoken summary based on the title."
                    narration = generate_slide_script(title, narration_input)
                    narration = re.sub(r'[\u0000-\u001F\u007F-\u009F\u200b\u000b\u00a0]', '', narration)
                    print(f"[JOB {job_id}] Uploading narration for slide {i}...")
                    try:
                        upload_file_bytes(OUTPUTS_CONTAINER, narration_blob_name, narration.encode('utf-8'))
                    except Exception as upload_err:
                        print(f"[ERROR] Failed to upload narration blob: {narration_blob_name} - {upload_err}")
                except Exception as e:
                    print(f"[ERROR] Failed to generate/upload narration for slide {i} ({narration_blob_name}): {e}")
                    narration_blob_name = ""
                    narration = ""
                
                # Generate SAS URL for slide image (INSIDE the loop)
                try:
                    print(f"[JOB {job_id}] Generating SAS URL for slide image {blob_name_out}...")
                    user_delegation_key = blob_service_client.get_user_delegation_key(
                        key_start_time=datetime.utcnow(),
                        key_expiry_time=datetime.utcnow() + timedelta(hours=12)
                    )
                    image_sas_token = generate_blob_sas(
                        account_name=blob_service_client.account_name,
                        container_name=SLIDES_CONTAINER,
                        blob_name=blob_name_out,
                        user_delegation_key=user_delegation_key,
                        permission=BlobSasPermissions(read=True),
                        expiry=datetime.utcnow() + timedelta(hours=12)
                    )
                    image_url = f"https://{blob_service_client.account_name}.blob.core.windows.net/{SLIDES_CONTAINER}/{blob_name_out}?{image_sas_token}"
                except Exception as e:
                    print(f"[ERROR] Failed to generate SAS URL for slide image {blob_name_out}: {e}")
                    image_url = ""
                
                # Add to arrays (INSIDE the loop)
                narrations.append({
                    "index": i,
                    "title": title,
                    "narration": narration,
                    "image_blob": url,
                    "image_blob_name": blob_name_out,
                    "image_url": image_url
                })
                slides_info.append({
                    "index": i,
                    "image_blob": url,
                    "image_blob_name": blob_name_out,
                    "title": title,
                    "notes": notes,
                    "narration_blob": narration_blob_name if narration else ""
                })
                
                # Update progress tracking (INSIDE the loop)
                elapsed = time.time() - start_time
                slides_done = i
                percent = int((slides_done / total_slides) * 100)
                avg_time_per_slide = elapsed / slides_done if slides_done > 0 else 0
                eta = int(avg_time_per_slide * (total_slides - slides_done))
                jobs[job_id]["progress"] = percent
                jobs[job_id]["eta"] = eta
                jobs[job_id]["slides_done"] = slides_done
                jobs[job_id]["total_slides"] = total_slides
                save_jobs(jobs)
        
        finally:
            # Clean up temporary directory
            try:
                import shutil
                if os.path.exists(tmpdir):
                    shutil.rmtree(tmpdir)
                    print(f"[JOB {job_id}] Cleaned up temp directory: {tmpdir}")
            except Exception as cleanup_err:
                print(f"[JOB {job_id}] Warning: Failed to clean up temp directory {tmpdir}: {cleanup_err}")
                
    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] Exception in background_process_ppt: {error_msg}")
        
        # Provide more helpful error messages for common issues
        if "timed out" in error_msg.lower():
            if "libreoffice" in error_msg.lower() or "soffice" in error_msg.lower():
                error_msg = "LibreOffice conversion timed out. The PowerPoint file may be too large or complex. Try using a simpler file with fewer animations and embedded media."
            elif "pdftoppm" in error_msg.lower():
                error_msg = "PDF to image conversion timed out. The generated PDF may be too large."
        elif "not found" in error_msg.lower():
            if "libreoffice" in error_msg.lower() or "soffice" in error_msg.lower():
                error_msg = "LibreOffice is not installed or not found. Please install LibreOffice."
            elif "pdftoppm" in error_msg.lower():
                error_msg = "pdftoppm (Poppler) is not installed or not found. Please install Poppler utils."
        
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = error_msg
        save_jobs(jobs)
        return
    # --- Continue with original metadata/narration upload logic ---
    metadata = {}
    metadata["presentation_id"] = presentation_id
    metadata["slides"] = slides_info
    # Upload metadata JSON to Blob
    meta_blob = f"{presentation_id}/metadata.json"
    upload_file_bytes(SLIDES_CONTAINER, meta_blob, json.dumps(metadata).encode('utf-8'))
    # Upload narration JSON to outputs container (no avatar config)
    narration_json_blob = f"{presentation_id}/narration.json"
    narration_json_data = {
        "narrations": narrations
    }
    upload_file_bytes(OUTPUTS_CONTAINER, narration_json_blob, json.dumps(narration_json_data, ensure_ascii=False).encode('utf-8'))
    # Generate SAS URL for narration.json
    try:
        user_delegation_key = blob_service_client.get_user_delegation_key(
            key_start_time=datetime.utcnow(),
            key_expiry_time=datetime.utcnow() + timedelta(hours=12)
        )
        narration_sas_token = generate_blob_sas(
            account_name=blob_service_client.account_name,
            container_name=OUTPUTS_CONTAINER,
            blob_name=narration_json_blob,
            user_delegation_key=user_delegation_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.utcnow() + timedelta(hours=12)
        )
        narration_json_url = f"https://{blob_service_client.account_name}.blob.core.windows.net/{OUTPUTS_CONTAINER}/{narration_json_blob}?{narration_sas_token}"
    except Exception as e:
        print(f"[ERROR] Failed to generate SAS URL for narration.json: {e}")
        narration_json_url = ""
    metadata["narration_json_url"] = narration_json_url
    jobs[job_id]["status"] = "done"
    jobs[job_id]["progress"] = 100
    jobs[job_id]["eta"] = 0
    jobs[job_id]["result"] = metadata
    save_jobs(jobs)

# Upload PPT
@app.route("/upload", methods=["POST"])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        # Validate file type
        if not file.filename.lower().endswith(('.ppt', '.pptx')):
            return jsonify({"error": "Only PowerPoint files (.ppt, .pptx) are allowed"}), 400
        
        filename = secure_filename(file.filename)
        print(f"[UPLOAD] Processing file: {filename}")
        
        # Save file to temporary location first to validate
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pptx') as temp_file:
            file.save(temp_file.name)
            temp_file_path = temp_file.name
            
        # Validate the PowerPoint file before uploading
        try:
            from pptx import Presentation
            ppt = Presentation(temp_file_path)
            slide_count = len(ppt.slides)
            print(f"[UPLOAD] File validation successful: {slide_count} slides found")
            ppt = None  # Release file handle
        except Exception as e:
            os.unlink(temp_file_path)  # Clean up temp file
            return jsonify({"error": f"Invalid PowerPoint file: {str(e)}"}), 400
        
        # Upload validated file to blob storage
        try:
            blob_url = upload_file_path(UPLOAD_CONTAINER, filename, temp_file_path)
            print(f"[UPLOAD] Successfully uploaded to blob: {filename}")
        finally:
            os.unlink(temp_file_path)  # Clean up temp file
            
        return jsonify({"blob_name": filename, "url": blob_url})
    except Exception as e:
        print("[UPLOAD ERROR]", traceback.format_exc())
        response = jsonify({"error": str(e), "trace": traceback.format_exc()})
        response.status_code = 500
        # Add CORS headers manually in case of error
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        return response

# Process PPT: convert to slides + notes

# New: /process endpoint (async, returns job_id)
@app.route("/process", methods=["POST"])
def process_ppt():
    data = request.json
    blob_name = data.get("blob_name")
    avatar = data.get("avatar", "lisa")
    if not blob_name:
        return jsonify({"error": "Missing blob_name"}), 400
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "queued", "progress": 0, "eta": None}
    save_jobs(jobs)
    thread = threading.Thread(target=background_process_ppt, args=(job_id, UPLOAD_CONTAINER, blob_name, avatar))
    thread.start()
    return jsonify({"job_id": job_id})

# New: /process_status endpoint
@app.route("/process_status", methods=["GET"])
def process_status():
    job_id = request.args.get("job_id")
    if not job_id or job_id not in jobs:
        return jsonify({"error": "Invalid or missing job_id"}), 400
    job = jobs[job_id]
    resp = {
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "eta": job.get("eta"),
        "slides_done": job.get("slides_done"),
        "total_slides": job.get("total_slides"),
    }
    if job.get("status") == "done":
        resp["result"] = job.get("result")
        # For convenience, also return narration_json_url at top level if present
        if job.get("result") and "narration_json_url" in job["result"]:
            resp["narration_json_url"] = job["result"]["narration_json_url"]
    if job.get("status") == "error":
        resp["error"] = job.get("error")
    return jsonify(resp)

# Generate script from notes via Azure OpenAI
@app.route("/generate_script", methods=["POST"])
def generate_script():
    data = request.json
    notes_list = data.get("notes")  # List of notes from slides
    if not notes_list:
        return jsonify({"error": "No notes provided"}), 400

    script_text = generate_script_from_notes(notes_list)
    return jsonify({"script": script_text})

@app.route('/debug_narration/<presentation_id>')
def debug_narration(presentation_id):
    """Debug endpoint to check narration.json content directly"""
    try:
        narration_blob = f"{presentation_id}/narration.json"
        
        # Use blob_utils to read content
        blob_client = blob_service_client.get_container_client(OUTPUTS_CONTAINER).get_blob_client(narration_blob)
        
        if not blob_client.exists():
            return jsonify({"success": False, "error": "Narration file not found"}), 404
        
        # Download blob content
        blob_data = blob_client.download_blob()
        narration_content = blob_data.readall().decode('utf-8')
        narration_json = json.loads(narration_content)
        
        return jsonify({
            "success": True,
            "presentation_id": presentation_id,
            "narration_count": len(narration_json.get("narrations", [])),
            "has_avatar_config": "avatar" in narration_json,
            "first_slide": narration_json.get("narrations", [{}])[0] if narration_json.get("narrations") else None,
            "slide_count_check": len(narration_json.get("narrations", [])),
            "sample_slides": narration_json.get("narrations", [])[:3]  # First 3 slides for debugging
        })
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/get_latest_presentation_id')
def get_latest_presentation_id():
    """Get the most recent presentation ID from jobs"""
    try:
        with open('jobs.json', 'r') as f:
            jobs_data = json.load(f)
        
        # Find the most recent completed job
        latest_job = None
        latest_time = 0
        
        for job_id, job_info in jobs_data.items():
            if job_info.get('status') == 'done' and 'result' in job_info:
                job_time = job_info.get('timestamp', 0)
                if job_time > latest_time:
                    latest_time = job_time
                    latest_job = job_info
        
        if latest_job and 'result' in latest_job:
            presentation_id = latest_job['result'].get('presentation_id')
            return jsonify({"presentation_id": presentation_id})
        else:
            return jsonify({"error": "No completed jobs found"}), 404
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Additional console hiding for production
    if os.name == 'nt' and '--hide-console' in sys.argv:
        try:
            import ctypes
            ctypes.windll.kernel32.FreeConsole()
        except:
            pass
    
    app.run(debug=True, use_reloader=False, port=5050, host='0.0.0.0')
