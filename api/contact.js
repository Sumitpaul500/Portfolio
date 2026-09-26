const { dispatchEmailNotification } = require('../lib/emailDispatch');

let waitUntil;
try {
  waitUntil = require('@vercel/functions').waitUntil;
} catch {
  waitUntil = null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

function normalizePayload(body) {
  return {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim(),
    number: String(body.number || '').trim(),
    inquiryType: String(body.inquiryType || 'General Inquiry').trim(),
    message: String(body.message || '').trim(),
  };
}

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
  const { name, email, number, inquiryType, message } = normalizePayload(body);

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

  const runDispatch = () =>
    dispatchEmailNotification(name, email, number, inquiryType, message)
      .then((dispatch) => {
        console.log('[api/contact] Dispatch complete:', JSON.stringify(dispatch));
        return dispatch;
      })
      .catch((err) => {
        console.error('[api/contact] Dispatch error:', err.message || err);
        return { sumitSent: false, senderSent: false, error: 'dispatch_failed' };
      });

  // Mobile browsers often abort long requests; finish both emails after responding.
  if (waitUntil) {
    waitUntil(runDispatch());
    return res.status(200).json({
      success: true,
      message: `Thank you, ${name}! Your message has been sent. I'll reply to ${email} within 24 hours.`,
      dispatch: { pending: true },
    });
  }

  try {
    const dispatch = await runDispatch();

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
