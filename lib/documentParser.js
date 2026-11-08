const zlib = require('zlib');

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB
const MAX_TEXT_LENGTH = 30000; // 30,000 characters

/**
 * Parses and extracts clean plain text from a buffer (PDF, DOCX, TXT).
 */
function parseDocument(buffer, mimeType = '', filename = '') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid file input: expected a valid Buffer.');
  }

  if (buffer.length === 0) {
    throw new Error('The uploaded file is empty.');
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${(buffer.length / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 4.5 MB.`);
  }

  const nameLower = (filename || '').toLowerCase();
  const mimeLower = (mimeType || '').toLowerCase();

  let text = '';

  if (nameLower.endsWith('.pdf') || mimeLower.includes('pdf')) {
    text = extractTextFromPdf(buffer);
  } else if (nameLower.endsWith('.docx') || mimeLower.includes('wordprocessingml') || mimeLower.includes('officedocument')) {
    text = extractTextFromDocx(buffer);
  } else if (nameLower.endsWith('.txt') || mimeLower.includes('text/plain') || isLikelyPlainText(buffer)) {
    text = buffer.toString('utf-8');
  } else {
    // Attempt auto-detection based on magic bytes
    if (buffer.slice(0, 4).toString('binary') === '%PDF') {
      text = extractTextFromPdf(buffer);
    } else if (buffer.readUInt32LE(0) === 0x04034b50) {
      text = extractTextFromDocx(buffer);
    } else {
      text = buffer.toString('utf-8');
    }
  }

  // Sanitize text
  text = sanitizeExtractedText(text);

  if (!text || text.length < 15) {
    throw new Error('Could not extract readable text from this document. Please ensure the file contains selectable text or paste the job description directly.');
  }

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[... Truncated for length ...]';
  }

  return text;
}

/**
 * Extracts text from PDF streams using standard zlib decompression.
 */
function extractTextFromPdf(buffer) {
  let fullText = '';
  const content = buffer.toString('binary');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;

  while ((match = streamRegex.exec(content)) !== null) {
    const streamData = Buffer.from(match[1], 'binary');
    let decompressed;
    try {
      decompressed = zlib.inflateSync(streamData);
    } catch {
      try {
        decompressed = zlib.inflateRawSync(streamData);
      } catch {
        decompressed = streamData;
      }
    }

    const textChunk = decompressed.toString('utf-8');

    // Extract text from (text) Tj
    const tjRegex = /\(([\s\S]*?)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(textChunk)) !== null) {
      fullText += tjMatch[1] + ' ';
    }

    // Extract text from [(t1) 12 (t2)] TJ
    const arrayTjRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let arrMatch;
    while ((arrMatch = arrayTjRegex.exec(textChunk)) !== null) {
      const inner = arrMatch[1];
      const partRegex = /\(([\s\S]*?)\)/g;
      let part;
      while ((part = partRegex.exec(inner)) !== null) {
        fullText += part[1];
      }
      fullText += ' ';
    }
  }

  // Handle uncompressed plain PDF text fallback
  if (!fullText.trim()) {
    const rawMatches = content.match(/\(([\w\s.,!?:;/@#-]{3,})\)\s*Tj/g);
    if (rawMatches) {
      fullText = rawMatches.map(m => m.replace(/^\(|\)\s*Tj$/g, '')).join(' ');
    }
  }

  return fullText;
}

/**
 * Extracts text from DOCX (OpenXML ZIP archive) word/document.xml.
 */
function extractTextFromDocx(buffer) {
  let offset = 0;
  let documentXml = null;

  while (offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) === 0x04034b50) {
      const compression = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
      const dataStart = offset + 30 + fileNameLen + extraLen;

      if (fileName === 'word/document.xml') {
        const compressedData = buffer.slice(dataStart, dataStart + compressedSize);
        if (compression === 8) {
          documentXml = zlib.inflateRawSync(compressedData).toString('utf8');
        } else if (compression === 0) {
          documentXml = compressedData.toString('utf8');
        }
        break;
      }
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }

  if (!documentXml) {
    throw new Error('Invalid DOCX file or word/document.xml not found.');
  }

  const paragraphs = documentXml.split(/<\/w:p>/gi);
  const textLines = [];
  for (const p of paragraphs) {
    const textMatches = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi)];
    if (textMatches.length > 0) {
      const line = textMatches.map(m => m[1]).join('');
      if (line.trim()) textLines.push(line.trim());
    }
  }

  return textLines.join('\n');
}

function isLikelyPlainText(buffer) {
  const sample = buffer.slice(0, Math.min(buffer.length, 512));
  let nonAscii = 0;
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === 0) return false; // Null byte indicates binary
    if (byte > 127) nonAscii++;
  }
  return nonAscii / sample.length < 0.25;
}

function sanitizeExtractedText(text) {
  if (!text) return '';
  return text
    .replace(/\\([()\\])/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // remove control chars
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  parseDocument,
  MAX_FILE_SIZE,
  MAX_TEXT_LENGTH
};

