#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runSiteChecks } = require('../lib/siteMonitor');
const { sendMonitorAlert } = require('../lib/emailDispatch');

const STATE_FILE = path.join(__dirname, '..', '.monitor-state.json');
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastStatus: 'unknown', lastAlertAt: 0 };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  const report = await runSiteChecks();
  const state = readState();
  const now = Date.now();

  if (report.ok) {
    if (state.lastStatus === 'down') {
      await sendMonitorAlert({
        subject: '[Portfolio RECOVERED] Site is healthy again',
        siteUrl: report.siteUrl,
        checkedAt: report.checkedAt,
        failures: [],
        recovered: true,
      });
    }
    writeState({ lastStatus: 'up', lastAlertAt: state.lastAlertAt });
    console.log('Monitor OK', report.checkedAt);
    process.exit(0);
  }

  const shouldAlert =
    state.lastStatus !== 'down' || now - (state.lastAlertAt || 0) >= ALERT_COOLDOWN_MS;

  if (shouldAlert) {
    await sendMonitorAlert({
      subject: '[Portfolio DOWN] Monitor detected an issue',
      siteUrl: report.siteUrl,
      checkedAt: report.checkedAt,
      failures: report.failures,
      recovered: false,
    });
    writeState({ lastStatus: 'down', lastAlertAt: now });
  } else {
    writeState({ lastStatus: 'down', lastAlertAt: state.lastAlertAt });
  }

  console.error('Monitor FAILED', JSON.stringify(report.failures));
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
