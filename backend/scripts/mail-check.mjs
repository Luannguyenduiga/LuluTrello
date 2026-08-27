#!/usr/bin/env node
/**
 * Standalone mail diagnostic - no Nest, no server, no Firestore needed.
 *
 *   node scripts/mail-check.mjs                 # report what is configured
 *   node scripts/mail-check.mjs you@example.com # also send a real test message
 *
 * Reads backend/.env, then the workspace-root .env, in the same precedence the
 * server uses. Real environment variables still win, so this can also be run on
 * the host (Render shell) to check what the deployed process actually sees.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Minimal .env reader: KEY=value, optional quotes, # comments, no expansion. */
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    // A quoted value keeps its inner '#'; an unquoted one ends at a comment.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.split(' #')[0].trim();
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
  return true;
}

for (const path of [join(here, '..', '.env'), join(here, '..', '..', '.env')]) {
  if (loadEnvFile(path)) console.log(`loaded ${path}`);
}

const parseSender = (raw) => {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (!match) return { email: raw.trim() };
  const name = match[1].trim();
  return name ? { email: match[2].trim(), name } : { email: match[2].trim() };
};

const brevoKey = (process.env.BREVO_API_KEY || '').trim();
const fromRaw = (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
const sender = parseSender(fromRaw);
const channel = brevoKey
  ? 'brevo'
  : process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? 'smtp'
    : 'none';

console.log('\n--- configuration ---');
console.log(`channel      : ${channel}`);
console.log(
  `BREVO_API_KEY: ${brevoKey ? `set (${brevoKey.length} chars, starts "${brevoKey.slice(0, 8)}")` : 'NOT SET'}`,
);
console.log(`SMTP_FROM    : ${fromRaw || 'NOT SET'}`);
console.log(`sender email : ${sender.email || 'NOT SET'}${sender.name ? ` (name: ${sender.name})` : ''}`);
console.log(`SMTP_HOST    : ${process.env.SMTP_HOST || 'NOT SET'}`);
console.log(`SMTP_USER    : ${process.env.SMTP_USER || 'NOT SET'}`);
console.log(`SMTP_PASS    : ${process.env.SMTP_PASS ? 'set' : 'NOT SET'}`);

const problems = [];
if (channel === 'none') {
  problems.push('No transport configured: the server can only log verification codes.');
}
if (!sender.email.includes('@')) {
  problems.push('The sender address is missing or malformed - every provider rejects that.');
}
if (problems.length) {
  console.log('\n--- problems ---');
  problems.forEach((problem) => console.log(`  ! ${problem}`));
}

const to = process.argv[2];
if (!to) {
  console.log('\nPass a recipient to send a real test message: node scripts/mail-check.mjs you@example.com');
  process.exit(problems.length ? 1 : 0);
}

if (channel === 'none') {
  console.error('\nNothing to send with. Set BREVO_API_KEY, or the SMTP_HOST/USER/PASS trio.');
  process.exit(1);
}

console.log(`\n--- sending to ${to} via ${channel} ---`);

if (channel === 'brevo') {
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': brevoKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject: 'Lulu Trello mail check',
      textContent: 'If you can read this, Brevo delivery works.',
      htmlContent: '<p>If you can read this, <strong>Brevo</strong> delivery works.</p>',
    }),
  });
  const body = await response.text();
  console.log(`HTTP ${response.status}`);
  console.log(body);

  if (!response.ok) {
    // The usual causes, spelled out - Brevo's own message is terse.
    if (response.status === 401) {
      console.error(
        '\n401: the key is wrong, or the Brevo account has not been activated yet ' +
          '(a new account stays blocked until Brevo approves it).',
      );
    }
    if (response.status === 400 && body.includes('sender')) {
      console.error(
        `\n400 on the sender: ${sender.email} is not a verified sender in Brevo. ` +
          'Add and verify it under Senders, Domains & Dedicated IPs -> Senders.',
      );
    }
    process.exit(1);
  }
  console.log(
    '\nAccepted. If the inbox stays empty, open Brevo -> Transactional -> Logs and search ' +
      'this messageId: it will show delivered / soft bounce / hard bounce / blocked.',
  );
} else {
  const { default: nodemailer } = await import('nodemailer');
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });
  await transporter.verify();
  console.log('SMTP handshake and login OK');
  const info = await transporter.sendMail({
    from: fromRaw,
    to,
    subject: 'Lulu Trello mail check',
    text: 'If you can read this, SMTP delivery works.',
    html: '<p>If you can read this, <strong>SMTP</strong> delivery works.</p>',
  });
  console.log(`messageId: ${info.messageId}`);
  console.log(`accepted : ${JSON.stringify(info.accepted)}`);
  console.log(`rejected : ${JSON.stringify(info.rejected)}`);
  console.log(`response : ${info.response}`);
}
