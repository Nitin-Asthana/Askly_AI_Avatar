
# --- Blob Storage Setup ---
from azure.storage.blob import BlobServiceClient
import os
from io import BytesIO

from azure.identity import ClientSecretCredential

tenant_id = "e9fa40cb-def3-4278-b467-c51e26207b4b"
client_id = "0cac8e99-624b-4643-a18d-d0015341a7cd"
client_secret = "-gk8Q~wPYaeGd6S9rmmc770hvkhcdmoMF2RNHcnE"
account_url = "https://storgaeforai.blob.core.windows.net"

credential = ClientSecretCredential(tenant_id, client_id, client_secret)
blob_service_client = BlobServiceClient(account_url, credential=credential)

#AZURE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=storgaeforai;AccountKey=XT75hujdb64YXe4RjrTV1SD7AbzRfeq2Q94xbTknYHDp245fSHB8kSh1HaHoh/s3t+jd7cphp+Nx+AStzEhwqA==;EndpointSuffix=core.windows.net"
#blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)

UPLOAD_CONTAINER = "uploads"
SLIDES_CONTAINER = "slides"
OUTPUTS_CONTAINER = "outputs"

def upload_file_path(container, blob_name, file_or_path, overwrite=True):
    blob_client = blob_service_client.get_container_client(container).get_blob_client(blob_name)
    if hasattr(file_or_path, "read"):  # file-like object
        blob_client.upload_blob(file_or_path, overwrite=overwrite)
    else:  # assume it's a file path
        with open(file_or_path, "rb") as f:
            blob_client.upload_blob(f, overwrite=overwrite)
    return blob_name

def upload_file_bytes(container, blob_name, content, overwrite=True):
    print(f"Uploading to container: {container}, blob: {blob_name}")
    blob_client = blob_service_client.get_container_client(container).get_blob_client(blob_name)
    try:
        blob_client.upload_blob(content, overwrite=overwrite)
    except Exception as e:
        print(f"Failed to upload to {container}/{blob_name}: {e}")

def download_to_path(container, blob_name, local_path):
    """Download a blob to a local file path with comprehensive error handling"""
    try:
        print(f"[DOWNLOAD] Downloading {container}/{blob_name} to {local_path}")
        blob_client = blob_service_client.get_container_client(container).get_blob_client(blob_name)
        
        # Check if blob exists
        if not blob_client.exists():
            raise Exception(f"Blob does not exist: {container}/{blob_name}")
        
        # Get blob properties to check size
        properties = blob_client.get_blob_properties()
        blob_size = properties.size
        print(f"[DOWNLOAD] Blob size: {blob_size} bytes")
        
        if blob_size == 0:
            raise Exception(f"Blob is empty: {container}/{blob_name}")
        
        # Ensure parent directory exists
        import os
        parent_dir = os.path.dirname(local_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        
        # Download with progress tracking
        print(f"[DOWNLOAD] Starting download...")
        blob_data = blob_client.download_blob()
        
        with open(local_path, "wb") as f:
            f.write(blob_data.readall())
        
        # Verify download
        if not os.path.exists(local_path):
            raise Exception(f"Download failed: file not created at {local_path}")
            
        downloaded_size = os.path.getsize(local_path)
        if downloaded_size != blob_size:
            raise Exception(f"Download size mismatch: expected {blob_size}, got {downloaded_size}")
            
        print(f"[DOWNLOAD] Successfully downloaded {downloaded_size} bytes to {local_path}")
        
    except Exception as e:
        print(f"[DOWNLOAD ERROR] Failed to download {container}/{blob_name}: {e}")
        raise
