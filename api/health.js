module.exports = async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    service: 'sumit-paul-portfolio',
    timestamp: new Date().toISOString(),
  });
};
