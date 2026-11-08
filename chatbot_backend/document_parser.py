"""
Secure document parser in Python for PDF, DOCX, and TXT files.
Hardened against path traversal, zip bombs, and malicious file types.
Uses pypdf for PDF and standard library for DOCX and TXT.
"""

import io
import re
import os
import zipfile
import xml.etree.ElementTree as ET
from pypdf import PdfReader

MAX_FILE_SIZE = int(4.5 * 1024 * 1024)  # 4.5 MB
MAX_TEXT_LENGTH = 30000  # 30,000 characters

def sanitize_text(text: str) -> str:
    if not text:
        return ""
    # Strip non-printable control characters
    cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    cleaned = cleaned.replace('\r\n', '\n').replace('\r', '\n')
    cleaned = re.sub(r'[ \t]+', ' ', cleaned)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.strip()

def sanitize_filename(filename: str) -> str:
    """Removes path traversal components and dangerous characters."""
    if not filename:
        return "unnamed_document.txt"
    base = os.path.basename(filename.replace('\\', '/'))
    safe = re.sub(r'[^a-zA-Z0-9_.\- ]', '_', base)
    return safe or "document.txt"

def extract_from_pdf(file_bytes: bytes) -> str:
    # Security: check magic bytes
    if not file_bytes.startswith(b'%PDF'):
        raise ValueError("Invalid PDF format: file does not begin with standard PDF signature.")

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        max_pages = min(len(reader.pages), 25)
        for i in range(max_pages):
            page = reader.pages[i]
            txt = page.extract_text()
            if txt:
                pages_text.append(txt)
        return "\n".join(pages_text)
    except Exception as e:
        raise ValueError(f"Could not read PDF contents: {str(e)}")

def extract_from_docx(file_bytes: bytes) -> str:
    # Security: check zip magic bytes PK\x03\x04
    if not file_bytes.startswith(b'PK\x03\x04'):
        raise ValueError("Invalid DOCX format: file does not begin with standard OpenXML ZIP signature.")

    try:
        with io.BytesIO(file_bytes) as bio:
            with zipfile.ZipFile(bio) as zf:
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                if total_uncompressed > 20 * 1024 * 1024:  # 20MB decompressed limit
                    raise ValueError("File rejected: decompressed content exceeds safety limit.")

                if 'word/document.xml' not in zf.namelist():
                    raise ValueError("Invalid DOCX format: word/document.xml not found.")

                xml_content = zf.read('word/document.xml')
                tree = ET.fromstring(xml_content)
                paragraphs = []
                for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                    texts = [
                        node.text for node in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
                        if node.text
                    ]
                    if texts:
                        paragraphs.append(''.join(texts))
                return "\n".join(paragraphs)
    except Exception as e:
        raise ValueError(f"Could not read DOCX contents: {str(e)}")

def extract_from_txt(file_bytes: bytes) -> str:
    for encoding in ['utf-8', 'latin-1', 'cp1252']:
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return file_bytes.decode('utf-8', errors='ignore')

def parse_document(file_bytes: bytes, mime_type: str = "", filename: str = "") -> str:
    if not file_bytes:
        raise ValueError("The uploaded file is empty.")

    if len(file_bytes) > MAX_FILE_SIZE:
        size_mb = len(file_bytes) / (1024 * 1024)
        raise ValueError(f"File is too large ({size_mb:.1f} MB). Maximum allowed size is 4.5 MB.")

    safe_name = sanitize_filename(filename).lower()
    mime = (mime_type or "").lower()

    if safe_name.endswith('.pdf') or 'pdf' in mime or file_bytes.startswith(b'%PDF'):
        text = extract_from_pdf(file_bytes)
    elif safe_name.endswith('.docx') or 'wordprocessingml' in mime or 'officedocument' in mime or (file_bytes.startswith(b'PK\x03\x04') and not safe_name.endswith('.txt')):
        text = extract_from_docx(file_bytes)
    elif safe_name.endswith('.txt') or 'text/plain' in mime:
        text = extract_from_txt(file_bytes)
    else:
        if file_bytes.startswith(b'%PDF'):
            text = extract_from_pdf(file_bytes)
        elif file_bytes.startswith(b'PK\x03\x04'):
            text = extract_from_docx(file_bytes)
        else:
            text = extract_from_txt(file_bytes)

    text = sanitize_text(text)

    if not text or len(text) < 15:
        raise ValueError("Could not extract readable text from this document. Please ensure the file contains selectable text or paste the job description directly.")

    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH] + "\n\n[... Truncated for length ...]"

    return text
