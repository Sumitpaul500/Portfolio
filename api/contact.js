const { dispatchEmailNotification } = require('../lib/emailDispatch');

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

  const body = req.body || {};
  const { name, email, number, inquiryType, message } = body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: 'Name, email, and message are required fields.',
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
        error:
          dispatch.error === 'mail_not_configured'
            ? 'Email service is not configured on the server. Add GMAIL_APP_PASS in Vercel environment variables.'
            : 'Could not send email. Check Gmail app password and try again.',
        dispatch,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Thank you, ${name}! Your message has been sent. I'll reply to ${email} within 24 hours.`,
      dispatch,
    });
  } catch (err) {
    console.error('[api/contact] Error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: 'Unexpected error while sending your message.',
    });
  }
};
