/**
 * Fourward · leads and report emails (Google Apps Script web app)
 *
 * What it does
 *   POST {type:'check'}    → logs the domain, score and top issues to the "Checks" tab
 *   POST {type:'report'}   → emails the visitor their full AI visibility report from this Gmail,
 *                            notifies the team, logs the lead to the "Reports" tab
 *   POST {type:'booking'}  → logs the slot a visitor opened in Google Calendar to the "Bookings" tab
 *
 * Deploy once (about 5 minutes, signed in as fourwardpod@gmail.com)
 *   1. Open https://sheets.new and name the sheet "Fourward leads"; put its ID in SHEET_ID below.
 *   2. Extensions → Apps Script (or a standalone project at script.google.com). Replace Code.gs with this file. Save.
 *   3. Deploy → New deployment → type "Web app".
 *        Execute as: Me        Who has access: Anyone
 *      Deploy, then Authorize access (Advanced → Go to project → Allow).
 *   4. Copy the Web app URL (ends in /exec) into FOURWARD.leadUrl in js/site.js and push.
 *
 * Limits: a free Gmail account can send about 100 emails a day through Apps Script.
 * To change the code later: edit, then Deploy → Manage deployments → Edit → New version.
 */

const TEAM = 'fourwardpod@gmail.com';
// The "Fourward leads" sheet on the fourwardpod Google account. A script created from the sheet
// (Extensions → Apps Script) can leave this as is; a standalone script needs the ID.
const SHEET_ID = '1L_crfYf97khTdndtTgyO1m-_OBM8pmkzT2pbizAibY0';
const SITE = 'https://fourwardpod-design.github.io/';
const BOOK = SITE + '#book';

function doGet() {
  return out({ ok: true, service: 'fourward-leads' });
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, error: 'bad json' }); }
  if (d.website) return out({ ok: true });                       // honeypot field filled: a bot
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
  const type = String(d.type || '');
  const when = new Date();

  if (type === 'check') {
    log(ss, 'Checks',
      ['Time', 'Domain', 'Brand', 'Score', 'Grade', 'Partial', 'Top issues', 'Page', 'Referrer', 'Timezone', 'Language', 'User agent'],
      [when, d.domain, d.brand, d.score, d.grade, d.partial ? 'yes' : '', (d.topIssues || []).join('; '), d.page, d.referrer, d.tz, d.lang, d.ua]);
    return out({ ok: true });
  }

  if (type === 'booking') {
    log(ss, 'Bookings',
      ['Time', 'Slot (IST)', 'Slot (UTC)', 'Visitor timezone', 'Page', 'Referrer', 'User agent'],
      [when, d.slotLabel, d.slot, d.visitorTz || d.tz, d.page, d.referrer, d.ua]);
    return out({ ok: true });
  }

  if (type === 'report') {
    const email = String(d.email || '').trim();
    const name = String(d.name || '').trim().slice(0, 80);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return out({ ok: false, error: 'name and email required' });
    const cache = CacheService.getScriptCache();
    const key = 'r:' + email.toLowerCase();
    const n = Number(cache.get(key) || 0);
    if (n >= 3) return out({ ok: false, error: 'too many requests' });
    cache.put(key, String(n + 1), 3600);

    MailApp.sendEmail({
      to: email,
      subject: 'Your AI visibility report for ' + d.domain,
      htmlBody: reportHtml(d, name),
      body: d.textReport || '',
      name: 'Fourward',
      replyTo: TEAM
    });
    MailApp.sendEmail({
      to: TEAM,
      subject: 'New report request · ' + name + ' · ' + d.domain + (d.score != null ? ' · ' + d.score + '/100' : ''),
      htmlBody: '<p><b>' + h(name) + '</b> (' + h(email) + (d.company ? ', ' + h(d.company) : '') + ') asked for the report on <b>' + h(d.domain) + '</b>.</p>' +
        '<p>Score: ' + (d.score != null ? d.score + '/100 (' + h(d.grade) + ')' : 'not available') + '<br>Top issues: ' + h((d.topIssues || []).join('; ')) + '</p>' +
        '<p>Reply to this email to reach them directly. The copy they received follows.</p><hr>' + reportHtml(d, name),
      name: 'Fourward website',
      replyTo: email
    });
    log(ss, 'Reports',
      ['Time', 'Name', 'Email', 'Company', 'Domain', 'Score', 'Grade', 'Top issues', 'Page', 'Referrer', 'Timezone'],
      [when, name, email, d.company, d.domain, d.score, d.grade, (d.topIssues || []).join('; '), d.page, d.referrer, d.tz]);
    return out({ ok: true });
  }

  return out({ ok: false, error: 'unknown type' });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function log(ss, name, header, row) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); sh.getRange(1, 1, 1, header.length).setFontWeight('bold'); }
  sh.appendRow(row.map(function (v) { return v == null ? '' : v; }));
}

function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

function reportHtml(d, name) {
  const score = d.score;
  const tone = score == null ? '#6D6D74' : score >= 80 ? '#1FA873' : score >= 55 ? '#E39A1F' : '#E0523E';
  const font = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;";
  const mono = "font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;";
  const icon = { pass: '<span style="color:#1FA873">&#10003;</span>', warn: '<span style="color:#E39A1F">&#9679;</span>', fail: '<span style="color:#E0523E">&#10005;</span>' };
  const cats = (d.categories || []).map(function (c) {
    const rows = (d.checks || []).filter(function (x) { return x.cat === c.id; }).map(function (x) {
      return '<tr><td style="padding:7px 0;vertical-align:top;width:22px;font-size:14px">' + (icon[x.status] || '') + '</td>' +
        '<td style="padding:7px 0;' + font + 'font-size:14px;color:#0B0B0C">' + h(x.label) +
        (x.fix ? '<div style="font-size:13px;color:#55555C;margin-top:3px;line-height:1.45">' + h(x.fix) + '</div>' : '') + '</td>' +
        '<td style="padding:7px 0;' + mono + 'font-size:11px;color:#A3A3AA;text-align:right;white-space:nowrap;vertical-align:top">' + x.pts + '/' + x.max + '</td></tr>';
    }).join('');
    const pct = c.score == null ? 0 : Math.round(c.score / c.max * 100);
    return '<tr><td style="padding:22px 0 6px"><div style="' + font + 'font-size:15px;font-weight:600;color:#0B0B0C">' + h(c.label) +
      '<span style="float:right;' + mono + 'font-size:12px;color:#6D6D74">' + (c.score == null ? 'not checked' : c.score + ' / ' + c.max) + '</span></div>' +
      '<div style="height:4px;background:#EEEEEB;border-radius:2px;margin-top:8px"><div style="height:4px;width:' + pct + '%;background:' + tone + ';border-radius:2px"></div></div>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:6px">' + rows + '</table></td></tr>';
  }).join('');
  const fixes = (d.checks || []).filter(function (x) { return x.status !== 'pass' && x.fix; })
    .sort(function (a, b) { return (b.max - b.pts) - (a.max - a.pts); }).slice(0, 3)
    .map(function (x, i) { return '<li style="margin:0 0 8px">' + '<b>' + h(x.label) + '.</b> ' + h(x.fix) + '</li>'; }).join('');

  return '<div style="background:#F6F6F4;padding:28px 12px">' +
    '<table role="presentation" align="center" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E6E6E2;border-radius:18px">' +
    '<tr><td style="padding:28px 30px 8px">' +
      '<div style="' + font + 'font-size:18px;font-weight:600;letter-spacing:-0.5px;color:#0B0B0C"><span style="letter-spacing:1px">///</span><span style="color:#FBAF20">/</span>&nbsp;Fourward</div>' +
      '<div style="' + mono + 'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6D6D74;margin-top:22px">AI visibility report</div>' +
      '<div style="' + font + 'font-size:26px;font-weight:600;letter-spacing:-0.8px;color:#0B0B0C;margin-top:6px">' + h(d.domain) + '</div>' +
      '<p style="' + font + 'font-size:15px;color:#2E2E33;line-height:1.55;margin:14px 0 0">Hi ' + h(name.split(' ')[0]) + ', here is everything our check found. Each line says what we tested, what we saw and how to fix it.</p>' +
    '</td></tr>' +
    '<tr><td style="padding:18px 30px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F6F4;border-radius:14px"><tr>' +
      '<td style="padding:18px 20px;width:110px"><div style="' + font + 'font-size:40px;font-weight:600;letter-spacing:-1.5px;color:' + tone + '">' + (score == null ? '–' : score) + '</div><div style="' + mono + 'font-size:11px;color:#6D6D74">OUT OF 100</div></td>' +
      '<td style="padding:18px 20px 18px 0;' + font + 'font-size:14px;line-height:1.55;color:#2E2E33">' + h(d.verdict || '') + '</td>' +
    '</tr></table></td></tr>' +
    (fixes ? '<tr><td style="padding:22px 30px 0"><div style="' + mono + 'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6D6D74">Fix these first</div><ol style="' + font + 'font-size:14px;line-height:1.5;color:#2E2E33;padding-left:18px;margin:10px 0 0">' + fixes + '</ol></td></tr>' : '') +
    '<tr><td style="padding:4px 30px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">' + cats + '</table></td></tr>' +
    '<tr><td style="padding:26px 30px 30px">' +
      '<div style="background:#0B0B0C;border-radius:14px;padding:22px 22px">' +
        '<div style="' + font + 'font-size:18px;font-weight:600;color:#FFFFFF;letter-spacing:-0.4px">Your free session is waiting</div>' +
        '<div style="' + font + 'font-size:14px;color:rgba(255,255,255,.75);line-height:1.5;margin-top:6px">Thirty minutes with the owner of each lane. We walk you through this report and what a 30-day plan would move.</div>' +
        '<a href="' + BOOK + '" style="display:inline-block;margin-top:14px;background:#FFFFFF;color:#0B0B0C;' + font + 'font-size:14px;font-weight:600;text-decoration:none;padding:11px 18px;border-radius:999px">Book your free session &rarr;</a>' +
      '</div>' +
      '<p style="' + font + 'font-size:12px;color:#A3A3AA;line-height:1.5;margin:18px 0 0">Fourward · four lanes, one direction. You received this because you asked for this report on ' + h(SITE.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '. Reply to this email to reach the team.</p>' +
    '</td></tr></table></div>';
}
