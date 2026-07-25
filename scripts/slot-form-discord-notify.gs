// Google Apps Script — attach this directly to the Slot Details Google Form
// (Form's ⋮ menu → Script editor, or Extensions → Apps Script).
// Fires a Discord alert every time someone submits the form, and separately
// pings our server so slot submissions show up in the 6-hourly stats summary.
//
// Setup (see README/chat instructions for full steps):
// 1. Paste this whole file into the Apps Script editor, replacing any starter code.
// 2. Triggers (clock icon) → + Add Trigger → function: onFormSubmitTrigger,
//    event source: From form, event type: On form submit → Save.
// 3. Authorize when prompted (click Advanced → Go to [project] (unsafe) — normal
//    for personal scripts, not a real security warning).
// 4. Submit the form once to test.

function onFormSubmitTrigger(e) {
  var webhookUrl = 'https://discord.com/api/webhooks/1529991361518899281/mZuO1KvYM0R4M6Zzb78YcV5XojXZnlceM0RSyh2SnPwQ4RWpIKfTkw0FAisr_3NiBtZv';
  var responsesUrl = 'https://docs.google.com/forms/d/1uHL6qjs1Id5ZaD0kWb06MwDgZuET-6MokQOFoLt2mok/edit#responses';
  var pingUrl = 'https://preordercards.com/api/slot-submission-ping';
  var adminSecret = 'PASTE_ADMIN_SECRET_HERE'; // same value as ADMIN_SECRET in Render's env vars

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
