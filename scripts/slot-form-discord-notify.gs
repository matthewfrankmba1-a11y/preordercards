// Google Apps Script — attach this directly to the Slot Details Google Form
// (Form's ⋮ menu → Script editor, or Extensions → Apps Script).
// Fires a Discord alert every time someone submits the form.
//
// Setup (see README/chat instructions for full steps):
// 1. Paste this whole file into the Apps Script editor, replacing any starter code.
// 2. Triggers (clock icon) → + Add Trigger → function: onFormSubmitTrigger,
//    event source: From form, event type: On form submit → Save.
// 3. Authorize when prompted (click Advanced → Go to [project] (unsafe) — normal
//    for personal scripts, not a real security warning).
// 4. Submit the form once to test.

function onFormSubmitTrigger(e) {
  var webhookUrl = 'https://discord.com/api/webhooks/1529270324997259265/_jLBevxL7tfZYI24j7ls920XTNGIF-HBFB8KQoqP9I9CeipMaU7aVDThna2pPxSPVXXf';
  var formUrl = FormApp.getActiveForm().getEditUrl();

  var payload = {
    embeds: [
      {
        title: '📝 New Slot Details submission',
        color: 3447003,
        description: '[View all responses](' + formUrl + ')',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  });
}
