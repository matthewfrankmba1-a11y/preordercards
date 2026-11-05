// Google Apps Script — attach this directly to the Slot Details Google Form
// (Form's ⋮ menu → Script editor, or Extensions → Apps Script).
// Fires a Discord alert every time someone submits the form, and separately
// pings our server so slot submissions show up in the 6-hourly stats summary.
//
// Setup (see README/chat instructions for full steps):
// 1. Paste this whole file into the Apps Script editor, replacing any starter code.
// 2. Project Settings (gear icon) → Script Properties → add two properties:
//    DISCORD_WEBHOOK_URL = the channel's webhook URL, and
//    ADMIN_SECRET = the same value as ADMIN_SECRET in Render's env vars.
//    Both are credentials and belong there, not in this file, which is public.
// 3. Triggers (clock icon) → + Add Trigger → function: onFormSubmitTrigger,
//    event source: From form, event type: On form submit → Save.
// 4. Authorize when prompted (click Advanced → Go to [project] (unsafe) — normal
//    for personal scripts, not a real security warning).
// 5. Submit the form once to test.

function onFormSubmitTrigger(e) {
  // Both secrets come from Script Properties, never from this file: it
  // lives in a public repository. A webhook URL lets anyone post into the
  // channel; ADMIN_SECRET opens admin endpoints on the site.
  var props = PropertiesService.getScriptProperties();
  var webhookUrl = props.getProperty('DISCORD_WEBHOOK_URL');
  var adminSecret = props.getProperty('ADMIN_SECRET');
  if (!webhookUrl || !adminSecret) {
    throw new Error('Set DISCORD_WEBHOOK_URL and ADMIN_SECRET in Project Settings → Script Properties before running this.');
  }
  var responsesUrl = 'https://docs.google.com/forms/d/1uHL6qjs1Id5ZaD0kWb06MwDgZuET-6MokQOFoLt2mok/edit#responses';
  var pingUrl = 'https://preordercards.com/api/slot-submission-ping';

  var itemResponses = e.response.getItemResponses();
  var fields = itemResponses.map(function (itemResponse) {
    var value = itemResponse.getResponse();
    return {
      name: itemResponse.getItem().getTitle(),
      value: (value === null || value === '') ? '(blank)' : String(value),
      inline: true,
    };
  });

  var payload = {
    username: 'New Preorder!',
    embeds: [
      {
        title: '📝 NEW SLOT SUBMISSION',
        color: 13770556,
        description: '[View all responses](' + responsesUrl + ')',
        fields: fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  });

  try {
    UrlFetchApp.fetch(pingUrl, {
      method: 'post',
      headers: { 'x-admin-secret': adminSecret },
      muteHttpExceptions: true,
    });
  } catch (err) {
    // Non-fatal — the Discord alert above already fired, so a submission
    // won't go unnoticed even if this ping fails.
  }
}
