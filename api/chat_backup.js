const { processChatRequest } = require('../lib/aiService');
const { parseDocument } = require('../lib/documentParser');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

module.exports = async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  try {
    const body = req.body || {};
    const message = String(body.message || '').trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const customSkills = body.customSkills || {};
    const deletedSkills = Array.isArray(body.deletedSkills) ? body.deletedSkills : [];
    let jobDescriptionText = String(body.jobDescriptionText || '').trim();

    // Handle uploaded file (PDF / DOCX / TXT)
    if (body.file && body.file.base64) {
      try {
        const fileBuffer = Buffer.from(body.file.base64, 'base64');
        const extractedText = parseDocument(
          fileBuffer,
          body.file.type || '',
          body.file.name || ''
        );
        jobDescriptionText = extractedText;
      } catch (fileErr) {
        return res.status(400).json({
          success: false,
          error: fileErr.message || 'Failed to parse the uploaded document. Please check the file format or paste the text directly.'
        });
      }
    }

    if (!message && !jobDescriptionText) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a message or provide a job description.'
      });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

    const result = await processChatRequest({
      message,
      history,
      customSkills,
      deletedSkills,
      jobDescriptionText,
      clientIp
    });

    if (!result.success) {
      return res.status(429).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[api/chat] Error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred while processing your request. Please try again.'
    });
  }
};
