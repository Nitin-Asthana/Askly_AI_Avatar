import os
from blob_utils import blob_service_client
from azure.storage.blob import ContainerClient

# Set your container names
CONTAINERS = ["slides", "uploads", "outputs"]

def delete_all_blobs_in_container(container_name):
    container_client = blob_service_client.get_container_client(container_name)
    blobs = container_client.list_blobs()
    for blob in blobs:
        print(f"Deleting {container_name}/{blob.name}")
        container_client.delete_blob(blob.name)

def unload_content():
    for container in CONTAINERS:
        delete_all_blobs_in_container(container)
    print("All content unloaded from slides, uploads, and outputs containers.")

if __name__ == "__main__":
    unload_content()
