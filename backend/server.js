const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
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

// ─── Reusable Nodemailer Transporter Connection ─────────────────────────────
const GMAIL_USER = process.env.GMAIL_USER || 'deeprajpaul500@gmail.com';
const GMAIL_PASS = (process.env.GMAIL_APP_PASS || '').replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// ─── Contact Form Email Handler ────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, number, inquiryType, message } = req.body;

  // Basic validation
  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: 'Name, email, and message are required fields.'
    });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address.' });
  }

  // Email to Sumit Paul (notification)
  const mailToSumit = {
    from: `"Portfolio Contact" <${GMAIL_USER}>`,
    to: GMAIL_USER,
    replyTo: email,
    subject: `[Portfolio] New Message from ${name} — ${inquiryType || 'General Inquiry'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #ffffff; border-radius: 12px;">
        <h2 style="color: #ff5500; margin-bottom: 24px;">📬 New Portfolio Contact</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #999; width: 140px;">Name</td><td style="padding: 8px 0; font-weight: bold;">${name}</td></tr>
          <tr><td style="padding: 8px 0; color: #999;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #ff5500;">${email}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #999;">Phone</td><td style="padding: 8px 0;">${number || 'Not provided'}</td></tr>
          <tr><td style="padding: 8px 0; color: #999;">Inquiry Type</td><td style="padding: 8px 0;">${inquiryType || 'General Inquiry'}</td></tr>
        </table>
        <hr style="border-color: #333; margin: 20px 0;" />
        <h3 style="color: #ff5500; margin-bottom: 12px;">Message</h3>
        <p style="background: #1a1a1a; padding: 16px; border-radius: 8px; border-left: 4px solid #ff5500; line-height: 1.6; white-space: pre-wrap;">${message}</p>
        <p style="margin-top: 24px; color: #666; font-size: 12px;">Sent via your portfolio</p>
      </div>
    `,
  };

  // Acknowledgment email to the sender
  const mailToSender = {
    from: `"Sumit Paul" <${GMAIL_USER}>`,
    to: email,
    subject: `Thanks for reaching out, ${name}! — Sumit Paul`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #ffffff; border-radius: 12px;">
        <h2 style="color: #ff5500; margin-bottom: 16px;">Hey ${name}! 👋</h2>
        <p style="line-height: 1.7; color: #ddd;">Thanks for reaching out through my portfolio! I've received your message and will get back to you as soon as possible — usually within 24 hours.</p>
        <div style="background: #1a1a1a; padding: 16px; border-radius: 8px; border-left: 4px solid #ff5500; margin: 20px 0;">
          <p style="color: #999; font-size: 13px; margin-bottom: 8px;">Your message:</p>
          <p style="color: #ddd; line-height: 1.6; white-space: pre-wrap; font-size: 14px;">${message}</p>
        </div>
        <p style="line-height: 1.7; color: #ddd;">In the meantime, feel free to explore my work:</p>
        <div style="margin: 20px 0;">
          <a href="https://github.com/Sumitpaul500" style="display: inline-block; margin-right: 12px; padding: 8px 18px; background: #ff5500; color: #fff; text-decoration: none; border-radius: 999px; font-size: 13px; font-weight: 600;">GitHub</a>
          <a href="https://www.linkedin.com/in/sumit-paul-28b5b0280/" style="display: inline-block; padding: 8px 18px; background: #0a66c2; color: #fff; text-decoration: none; border-radius: 999px; font-size: 13px; font-weight: 600;">LinkedIn</a>
        </div>
        <hr style="border-color: #333; margin: 20px 0;" />
        <p style="color: #666; font-size: 12px;">Sumit Paul | Computer Science & Engineering Student | Full Stack Developer<br>New Horizon College of Engineering, Bengaluru | VTU CGPA 9.59</p>
      </div>
    `,
  };

  // 1. Respond IMMEDIATELY to the frontend so form submission completes in <0.1 seconds!
  res.json({
    success: true,
    message: `Thank you, ${name}! Your message has been sent. I'll reply to ${email} within 24 hours.`
  });

  // 2. Dispatch emails asynchronously in background with isolated error handling
  setImmediate(async () => {
    try {
      const info1 = await transporter.sendMail(mailToSumit);
      console.log(`[Email Engine ⚡] Primary notification email sent to ${GMAIL_USER}. MessageId: ${info1.messageId}`);
    } catch (err1) {
      console.error('[Email Engine ⚠️] Primary notification email error:', err1);
    }

    try {
      const info2 = await transporter.sendMail(mailToSender);
      console.log(`[Email Engine ⚡] Auto-reply confirmation sent to ${email}. MessageId: ${info2.messageId}`);
    } catch (err2) {
      console.error('[Email Engine ⚠️] Auto-reply email error:', err2);
    }
  });
});

// ─── 24/7 Keep-Alive Ping Engine (Prevents Render Free Tier Sleeping) ─────────
function startKeepAlive() {
  const pingInterval = 10 * 60 * 1000; // Ping every 10 minutes
  setInterval(() => {
    const liveUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
    if (liveUrl) {
      const targetUrl = liveUrl.endsWith('/health') ? liveUrl : `${liveUrl}/health`;
      const requester = targetUrl.startsWith('https') ? https : http;
      requester.get(targetUrl, (res) => {
        console.log(`[Keep-Alive ⚡] Health ping sent to ${targetUrl} — Status: ${res.statusCode}`);
      }).on('error', (err) => {
        console.error('[Keep-Alive ⚠️] Ping error:', err.message);
      });
    }
  }, pingInterval);
}

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Portfolio contact server running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  startKeepAlive();
});
