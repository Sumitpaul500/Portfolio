const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { dispatchEmailNotification } = require('../lib/emailDispatch');

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
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
