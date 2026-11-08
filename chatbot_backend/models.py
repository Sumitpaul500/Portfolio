"""
Pydantic Models for Sumit Paul's AI Recruiter Chatbot API.
Enforces strict input validation and type safety.
"""

from typing import List, Dict, Optional, Any, Literal
from pydantic import BaseModel, Field, field_validator

class ChatMessageItem(BaseModel):
    role: Literal['user', 'assistant', 'system', 'model']
    content: str = Field(..., max_length=10000, description="Content of the message.")

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        # Strip non-printable control characters
        return "".join(ch for ch in v if ch == '\n' or ch == '\t' or ch == '\r' or ord(ch) >= 32).strip()

class FileUploadPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Filename with extension (.pdf, .docx, .txt).")
    type: str = Field(default="application/octet-stream", max_length=100)
    base64: str = Field(..., min_length=1, max_length=7000000, description="Base64 encoded file content (<4.5MB raw).")

    @field_validator('name')
    @classmethod
    def validate_filename(cls, v: str) -> str:
        v_clean = v.replace('\\', '/').split('/')[-1]
        ext = v_clean.lower().split('.')[-1] if '.' in v_clean else ''
        if ext not in ['pdf', 'docx', 'txt']:
            raise ValueError("Only PDF, DOCX, and TXT files are supported.")
        return v_clean

class ChatRequest(BaseModel):
    message: Optional[str] = Field(default="", max_length=10000)
    history: List[ChatMessageItem] = Field(default_factory=list, max_length=25)
    customSkills: Dict[str, List[str]] = Field(default_factory=dict)
    deletedSkills: List[str] = Field(default_factory=list)
    jobDescriptionText: Optional[str] = Field(default="", max_length=50000)
    file: Optional[FileUploadPayload] = None

class ChatResponse(BaseModel):
    success: bool
    response: str
    source: str
    analysis: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    service: str
    framework: str
    port: int

