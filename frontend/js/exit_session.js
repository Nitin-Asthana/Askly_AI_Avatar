// Exit session logic: remove uploaded PPT, slides, and outputs from backend blob storage
// and clear local session data.

document.addEventListener('DOMContentLoaded', function() {
    const exitBtn = document.getElementById('exitSessionBtn');
    if (!exitBtn) return;
    exitBtn.addEventListener('click', async function() {
        exitBtn.disabled = true;
        exitBtn.innerText = 'Exiting...';
        // Remove narration JSON from localStorage
        localStorage.removeItem('narration_json_url');
        // Call backend endpoint to delete blobs (upload, slides, outputs)
        try {
            const resp = await fetch('http://localhost:5050/exit_session', { method: 'POST' });
            if (resp.ok) {
                alert('Session closed and all content removed.');
                window.location.href = 'ppt_upload.html';
            } else {
                alert('Failed to clean up session on server.');
            }
        } catch (e) {
            alert('Error contacting backend: ' + e);
        } finally {
            exitBtn.disabled = false;
            exitBtn.innerText = 'Exit';
        }
    });
});
