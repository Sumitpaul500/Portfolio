import sys
from pathlib import Path

cur_dir = Path(__file__).resolve().parent.parent
chatbot_dir = cur_dir / 'chatbot_backend'
if str(chatbot_dir) not in sys.path:
    sys.path.insert(0, str(chatbot_dir))

from app import app

# Export FastAPI app for Vercel ASGI runtime
handler = app

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=5001)
