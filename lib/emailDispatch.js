const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOwnerNotificationHtml(name, email, number, inquiryType, message) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeNumber = escapeHtml(number || 'Not provided');
  const safeInquiry = escapeHtml(inquiryType || 'General Inquiry');
  const safeMessage = escapeHtml(message);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Portfolio Message</title>
</head>
<body style="margin:0;padding:0;background:#050505;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#050505;padding:16px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#0a0a0a;border:1px solid #ff5500;border-radius:12px;">
          <tr>
            <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
              <h2 style="margin:0 0 12px;color:#ff5500;font-size:22px;">📬 New Portfolio Message</h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#dddddd;">You received a new message from your portfolio website!</p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#999;width:140px;vertical-align:top;">Name</td><td style="padding:8px 0;font-weight:bold;color:#fff;">${safeName}</td></tr>
                <tr><td style="padding:8px 0;color:#999;vertical-align:top;">Email</td><td style="padding:8px 0;"><a href="mailto:${safeEmail}" style="color:#ff5500;text-decoration:underline;">${safeEmail}</a></td></tr>
                <tr><td style="padding:8px 0;color:#999;vertical-align:top;">Phone/WhatsApp</td><td style="padding:8px 0;color:#fff;">${safeNumber}</td></tr>
                <tr><td style="padding:8px 0;color:#999;vertical-align:top;">Inquiry Type</td><td style="padding:8px 0;color:#fff;">${safeInquiry}</td></tr>
              </table>
              <hr style="border:none;border-top:1px solid #333;margin:20px 0;" />
              <h3 style="margin:0 0 12px;color:#ff5500;font-size:16px;">Message Content</h3>
              <p style="margin:0;background:#1a1a1a;padding:18px;border-radius:8px;border-left:4px solid #ff5500;line-height:1.6;white-space:pre-wrap;color:#eee;font-size:15px;">${safeMessage}</p>
              <p style="margin:24px 0 0;color:#666;font-size:12px;">Sent via Sumit Paul Portfolio</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildSenderConfirmationHtml(name, message) {
  const safeName = escapeHtml(name);
  const safeMessage = escapeHtml(message);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thanks for reaching out</title>
</head>
<body style="margin:0;padding:0;background:#050505;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#050505;padding:16px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#0a0a0a;border:1px solid #ff5500;border-radius:12px;">
          <tr>
            <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
              <h2 style="margin:0 0 16px;color:#ff5500;font-size:22px;">Hey ${safeName}! 👋</h2>
              <p style="margin:0 0 16px;line-height:1.7;color:#dddddd;">Thanks for reaching out through my portfolio! I've received your message and will get back to you as soon as possible — usually within 24 hours.</p>
              <h3 style="margin:20px 0 12px;color:#ff5500;font-size:16px;">Your message</h3>
              <p style="margin:0;background:#1a1a1a;padding:18px;border-radius:8px;border-left:4px solid #ff5500;line-height:1.6;white-space:pre-wrap;color:#eee;font-size:15px;">${safeMessage}</p>
              <p style="margin:20px 0 0;line-height:1.7;color:#dddddd;">In the meantime, feel free to connect:</p>
              <p style="margin:16px 0 0;">
                <a href="https://github.com/Sumitpaul500" style="display:inline-block;margin:0 12px 8px 0;padding:10px 18px;background:#ff5500;color:#fff;text-decoration:none;border-radius:999px;font-size:13px;font-weight:600;">GitHub</a>
                <a href="https://www.linkedin.com/in/sumit-paul-28b5b0280/" style="display:inline-block;margin:0 0 8px;padding:10px 18px;background:#0a66c2;color:#fff;text-decoration:none;border-radius:999px;font-size:13px;font-weight:600;">LinkedIn</a>
              </p>
              <hr style="border:none;border-top:1px solid #333;margin:20px 0;" />
              <p style="margin:0;color:#666;font-size:12px;line-height:1.5;">Sumit Paul | Computer Science &amp; Engineering Student | Full Stack Developer<br />New Horizon College of Engineering, Bengaluru</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

let cachedMail = null;

function createTransporter() {
  const gmailUser = process.env.GMAIL_USER || 'deeprajpaul500@gmail.com';
  const rawPass = process.env.GMAIL_APP_PASS || '';
  const gmailPass = String(rawPass).replace(/\s+/g, '');

  if (!gmailPass) {
    return { transporter: null, gmailUser, configured: false };
  }

  if (
    cachedMail &&
    cachedMail.gmailUser === gmailUser &&
    cachedMail.gmailPass === gmailPass
  ) {
    return { transporter: cachedMail.transporter, gmailUser, configured: true };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    pool: true,
    maxConnections: 2,
    auth: { user: gmailUser, pass: gmailPass },
    tls: { rejectUnauthorized: true },
  });

  cachedMail = { transporter, gmailUser, gmailPass };
  return { transporter, gmailUser, configured: true };
}

async function dispatchEmailNotification(name, email, number, inquiryType, message) {
  const { transporter, gmailUser, configured } = createTransporter();

  if (!configured || !transporter) {
    console.error('[Email] GMAIL_APP_PASS is not configured.');
    return { sumitSent: false, senderSent: false, error: 'mail_not_configured' };
  }

  const mailToOwner = {
    from: `"Portfolio Contact" <${gmailUser}>`,
    to: gmailUser,
    replyTo: email,
    subject: `[Portfolio Contact] New Message from ${name} (${email})`,
    html: buildOwnerNotificationHtml(name, email, number, inquiryType, message),
  };

  const mailToSender = {
    from: `"Sumit Paul" <${gmailUser}>`,
    to: email,
    subject: `Thanks for reaching out, ${name}! — Sumit Paul`,
    html: buildSenderConfirmationHtml(name, message),
  };

  let sumitSent = false;
  let senderSent = false;

  const [ownerResult, senderResult] = await Promise.allSettled([
    transporter.sendMail(mailToOwner),
    transporter.sendMail(mailToSender),
  ]);

  if (ownerResult.status === 'fulfilled') {
    sumitSent = true;
    console.log('[Email] Owner notification sent:', ownerResult.value.messageId);
  } else {
    console.error('[Email] Owner notification failed:', ownerResult.reason?.message || ownerResult.reason);
  }

  if (senderResult.status === 'fulfilled') {
    senderSent = true;
    console.log('[Email] Sender confirmation sent:', senderResult.value.messageId);
  } else {
    console.error('[Email] Sender confirmation failed:', senderResult.reason?.message || senderResult.reason);
  }

  return { sumitSent, senderSent };
}

module.exports = {
  dispatchEmailNotification,
  escapeHtml,
};
