import os
import time
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pydrive2.auth import GoogleAuth
from pydrive2.drive import GoogleDrive
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    handlers=[logging.FileHandler("sync.log"),
                              logging.StreamHandler()])

class DriveSyncHandler(FileSystemEventHandler):
    def __init__(self, drive, local_folder, drive_folder_id):
        self.drive = drive
        self.local_folder = local_folder
        self.drive_folder_id = drive_folder_id

    def on_modified(self, event):
        if not event.is_directory:
            logging.info(f"File modified: {event.src_path}")
            self.upload_or_update_file(event.src_path)

    def on_created(self, event):
        if not event.is_directory:
            logging.info(f"File created: {event.src_path}")
            self.upload_or_update_file(event.src_path)

    def find_file_on_drive(self, file_name):
        """Check if file exists in the specified Drive folder."""
        query = f"'{self.drive_folder_id}' in parents and title = '{file_name}' and trashed = false"
        file_list = self.drive.ListFile({'q': query}).GetList()
        return file_list[0] if file_list else None

    def upload_or_update_file(self, file_path):
        try:
            file_name = os.path.basename(file_path)
            # Skip temporary or hidden files
            if file_name.startswith('~') or file_name.startswith('.'):
                return

            existing_file = self.find_file_on_drive(file_name)

            if existing_file:
                logging.info(f"Updating existing file: {file_name}")
                existing_file.SetContentFile(file_path)
                existing_file.Upload()
                logging.info(f"Successfully updated: {file_name}")
            else:
                logging.info(f"Uploading new file: {file_name}")
                file_metadata = {
                    'title': file_name,
                    'parents': [{'id': self.drive_folder_id}]
                }
                new_file = self.drive.CreateFile(file_metadata)
                new_file.SetContentFile(file_path)
                new_file.Upload()
                logging.info(f"Successfully uploaded: {file_name}")

        except Exception as e:
            logging.error(f"Error processing {file_path}: {str(e)}")

def setup_sync(local_folder, drive_folder_id):
    gauth = GoogleAuth()
    
    # Try to load saved client credentials or initiate flow
    # It will look for client_secrets.json in the same directory by default
    try:
        gauth.LocalWebserverAuth()
    except Exception as e:
        logging.error(f"Authentication failed: {str(e)}")
        logging.info("Make sure client_secrets.json is present in the directory.")
        return

    drive = GoogleDrive(gauth)

    event_handler = DriveSyncHandler(drive, local_folder, drive_folder_id)
    observer = Observer()
    observer.schedule(event_handler, local_folder, recursive=True)
    observer.start()
    
    logging.info(f"Started watching: {local_folder}")
    logging.info(f"Syncing to Drive Folder ID: {drive_folder_id}")

    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        logging.info("Stopping observer...")
        observer.stop()
    
    observer.join()

if __name__ == "__main__":
    # Load environment variables if helpful
    load_dotenv()
    
    # Configuration
    LOCAL_FOLDER = os.getenv("SYNC_LOCAL_FOLDER", "./sync_folder")
    DRIVE_FOLDER_ID = os.getenv("SYNC_DRIVE_FOLDER_ID", "your_drive_folder_id_here")
    
    if DRIVE_FOLDER_ID == "your_drive_folder_id_here":
        print("Please set your Google Drive Folder ID in .env or update sync.py")
    
    # Create the sync folder if it doesn't exist
    os.makedirs(LOCAL_FOLDER, exist_ok=True)
    
    setup_sync(LOCAL_FOLDER, DRIVE_FOLDER_ID)
