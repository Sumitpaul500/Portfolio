const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { dispatchEmailNotification } = require('../lib/emailDispatch');
const { processChatRequest } = require('../lib/aiService');
const { parseDocument } = require('../lib/documentParser');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Health Check Endpoint ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date() });
});

// ─── Resume PDF Stream & Download Handlers ────────────────────────────────────
app.get('/api/view-resume', (req, res) => {
  const filePath = path.join(__dirname, '..', 'Sumit_Paul_Resume.pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="Sumit_Paul_Resume.pdf"');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(filePath);
});

app.get('/api/download-resume', (req, res) => {
  const filePath = path.join(__dirname, '..', 'Sumit_Paul_Resume.pdf');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.download(filePath, 'Sumit_Paul_Resume.pdf');
});

const GMAIL_USER = process.env.GMAIL_USER || 'deeprajpaul500@gmail.com';

if (!process.env.GMAIL_APP_PASS) {
  console.warn('[Server Warning] GMAIL_APP_PASS is not set. Contact form emails will fail until it is configured.');
} else {
  console.log(`[Server Info] Gmail SMTP configured for ${GMAIL_USER}`);
}

// ─── Contact Form Email Handler ───────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, number, inquiryType, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: 'Name, email, and message are required fields.'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address.' });
  }

  try {
    const dispatch = await dispatchEmailNotification(
      String(name).trim(),
      String(email).trim(),
      String(number || '').trim(),
      String(inquiryType || 'General Inquiry').trim(),
      String(message).trim()
    );

    if (!dispatch.sumitSent && !dispatch.senderSent) {
      return res.status(503).json({
        success: false,
        error: 'Could not send email. Check Gmail app password on the server.',
        dispatch
      });
    }

    res.status(200).json({
      success: true,
      message: `Thank you, ${name}! Your message has been sent. I'll reply to ${email} within 24 hours.`,
      dispatch
    });
  } catch (err) {
    console.error('[Email] Dispatch error:', err.message || err);
    res.status(500).json({
      success: false,
      error: 'Unexpected error while sending your message.'
    });
  }
});

// ─── AI Recruiter Chatbot & JD Analysis Handler ───────────────────────────────
app.post('/api/chat', async (req, res) => {
  // 1. Try forwarding to Python Chatbot Server (port 5001) first
  try {
    const pythonResp = await fetch('http://localhost:5001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(10000)
    });
    const pythonData = await pythonResp.json();
    return res.status(pythonResp.status).json(pythonData);
  } catch (pythonErr) {
    // If Python service is starting or offline, proceed with local handler
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
          error: fileErr.message || 'Failed to parse uploaded document. Please ensure valid format or paste text directly.'
        });
      }
    }

    if (!message && !jobDescriptionText) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a message or upload a job description.'
      });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

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
    console.error('[Chat Server] Error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred while processing your request.'
    });
  }
});

// ─── 24/7 Keep-Alive Ping Engine (Prevents Render Free Tier Sleeping) ─────────
function startKeepAlive() {
  const pingInterval = 3 * 60 * 1000;
  setInterval(() => {
    const liveUrl = process.env.RENDER_EXTERNAL_URL || 'https://sumit-portfolio-backend-d8ys.onrender.com';
    const targetUrl = liveUrl.endsWith('/health') ? liveUrl : `${liveUrl}/health`;
    const requester = targetUrl.startsWith('https') ? https : http;
    requester.get(targetUrl, (pingRes) => {
      console.log(`[Keep-Alive] Ping ${targetUrl} — Status: ${pingRes.statusCode}`);
    }).on('error', (err) => {
      console.error('[Keep-Alive] Ping error:', err.message);
    });
  }, pingInterval);
}

app.listen(PORT, () => {
  console.log(`Portfolio contact server running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  startKeepAlive();
});
