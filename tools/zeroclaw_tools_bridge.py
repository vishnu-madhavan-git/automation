import sys
import os

# Add ZeroClaw python directory to sys.path to allow importing zeroclaw_tools
ZEROCLAW_PYTHON_PATH = r"c:\Users\VM-openclaw\EliteBook\zeroclaw\python"
if ZEROCLAW_PYTHON_PATH not in sys.path:
    sys.path.append(ZEROCLAW_PYTHON_PATH)

try:
    from zeroclaw_tools.tools import shell, file_read, file_write, web
    print("[bridge] ZeroClaw tools loaded successfully.")
except ImportError as e:
    print(f"[bridge] Error loading ZeroClaw tools: {e}")
    print(f"[bridge] Ensure dependencies from {os.path.join(ZEROCLAW_PYTHON_PATH, 'pyproject.toml')} are installed.")

# Export tools for use by DSPy agents
tools = {
    "shell": shell,
    "file_read": file_read,
    "file_write": file_write,
    "web": web
}

def get_tools_list():
    return [shell, file_read, file_write, web]
