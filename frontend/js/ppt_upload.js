// PPT Upload & Process Logic for ppt_upload.html

document.addEventListener('DOMContentLoaded', function () {
    const uploadBtn = document.getElementById('uploadBtn');
    const processBtn = document.getElementById('processBtn');
    const pptFileInput = document.getElementById('pptFile');
    const pptStatus = document.getElementById('pptStatus');
    const goToAvatarBtn = document.getElementById('goToAvatarBtn');
    let uploadedPptBlobName = null;

    // Initial state
    uploadBtn.disabled = true;
    processBtn.disabled = true;
    uploadBtn.classList.add('disabled');
    processBtn.classList.add('disabled');
    goToAvatarBtn.style.display = 'none';
    uploadedPptBlobName = null;
    pptFileInput.value = '';

    uploadBtn.addEventListener('click', function () {
        const file = pptFileInput.files[0];
        if (!file) {
            pptStatus.textContent = 'Please select a PPT file to upload.';
            return;
        }
        // Disable all actions during upload
        uploadBtn.disabled = true;
        uploadBtn.classList.add('disabled');
        processBtn.disabled = true;
        processBtn.classList.add('disabled');
        pptFileInput.disabled = true;
        goToAvatarBtn.style.display = 'none';
        pptStatus.textContent = 'Uploading...';
        const formData = new FormData();
        formData.append('file', file);
        fetch('http://localhost:5050/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                pptStatus.textContent = 'Upload failed: ' + data.error;
                uploadBtn.disabled = false;
                uploadBtn.classList.remove('disabled');
                processBtn.disabled = true;
                processBtn.classList.add('disabled');
                pptFileInput.disabled = false;
                goToAvatarBtn.style.display = 'none';
                return;
            }
            pptStatus.textContent = 'Upload successful! Now click Process.';
            uploadedPptBlobName = data.blob_name;
            processBtn.disabled = false;
            processBtn.classList.remove('disabled');
            uploadBtn.disabled = true;
            uploadBtn.classList.add('disabled');
            pptFileInput.disabled = true;
        })
        .catch(err => {
            pptStatus.textContent = 'Upload failed: ' + err;
            uploadBtn.disabled = false;
            uploadBtn.classList.remove('disabled');
            processBtn.disabled = true;
            processBtn.classList.add('disabled');
            pptFileInput.disabled = false;
            goToAvatarBtn.style.display = 'none';
        });
    });

    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '...';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}m ${s}s`;
    }

    function pollProcessingStatus(jobId) {
        const interval = setInterval(() => {
            fetch(`http://localhost:5050/process_status?job_id=${jobId}`)
                .then(resp => resp.json())
                .then(data => {
                    if (data.error) {
                        pptStatus.textContent = 'Error: ' + data.error;
                        clearInterval(interval);
                        return;
                    }
                    let percent = data.progress !== undefined ? data.progress : 0;
                    let eta = (data.eta !== undefined && data.eta !== null) ? formatTime(data.eta) : '...';
                    pptStatus.textContent = `Processing: ${percent}% | ETA: ${eta}`;
                    // Store narration_json_url in localStorage as soon as available
                    if (data.narration_json_url) {
                        localStorage.setItem('narration_json_url', data.narration_json_url);
                    } else if (data.result && data.result.narration_json_url) {
                        localStorage.setItem('narration_json_url', data.result.narration_json_url);
                    }
                    if (data.status === 'done') {
                        pptStatus.textContent += ' | Done!';
                        goToAvatarBtn.style.display = 'inline-block';
                        processBtn.disabled = true;
                        processBtn.classList.add('disabled');
                        uploadBtn.disabled = true;
                        uploadBtn.classList.add('disabled');
                        pptFileInput.disabled = true;
                        clearInterval(interval);
                    }
                });
        }, 2000);
    }

    processBtn.addEventListener('click', function () {
        if (!uploadedPptBlobName) {
            pptStatus.textContent = 'No uploaded PPT to process.';
            processBtn.disabled = true;
            return;
        }
        // Disable all actions during processing
        processBtn.disabled = true;
        processBtn.classList.add('disabled');
        uploadBtn.disabled = true;
        uploadBtn.classList.add('disabled');
        pptFileInput.disabled = true;
        goToAvatarBtn.style.display = 'none';
        pptStatus.textContent = 'Reading slides, estimating time...';
        let dots = 0;
        const loadingInterval = setInterval(() => {
            dots = (dots + 1) % 4;
            pptStatus.textContent = 'Reading slides, estimating time' + '.'.repeat(dots);
        }, 700);
        fetch('http://localhost:5050/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ blob_name: uploadedPptBlobName })
        })
        .then(response => response.json())
        .then(data => {
            clearInterval(loadingInterval);
            if (data.error) {
                pptStatus.textContent = 'Processing failed: ' + data.error;
                processBtn.disabled = false;
                processBtn.classList.remove('disabled');
                uploadBtn.disabled = true;
                uploadBtn.classList.add('disabled');
                pptFileInput.disabled = true;
                goToAvatarBtn.style.display = 'none';
                return;
            }
            if (data.job_id) {
                pptStatus.textContent = 'Slides read. Processing started...';
                pollProcessingStatus(data.job_id);
            } else {
                pptStatus.textContent = 'Processing complete! You can now go to the Avatar Instructor.';
                goToAvatarBtn.style.display = 'inline-block';
                processBtn.disabled = true;
                processBtn.classList.add('disabled');
                uploadBtn.disabled = true;
                uploadBtn.classList.add('disabled');
                pptFileInput.disabled = true;
            }
        })
        .catch(err => {
            clearInterval(loadingInterval);
            pptStatus.textContent = 'Processing failed: ' + err;
            processBtn.disabled = false;
            processBtn.classList.remove('disabled');
            uploadBtn.disabled = true;
            uploadBtn.classList.add('disabled');
            pptFileInput.disabled = true;
            goToAvatarBtn.style.display = 'none';
        });
    });

    // Prevent upload re-enabling after upload is complete
    pptFileInput.addEventListener('change', function() {
        uploadedPptBlobName = null;
        processBtn.disabled = true;
        processBtn.classList.add('disabled');
        if (pptFileInput.files.length > 0) {
            uploadBtn.disabled = false;
            uploadBtn.classList.remove('disabled');
        } else {
            uploadBtn.disabled = true;
            uploadBtn.classList.add('disabled');
        }
        goToAvatarBtn.style.display = 'none';
    });
});
