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
  var webhookUrl = 'https://discord.com/api/webhooks/1529991361518899281/mZuO1KvYM0R4M6Zzb78YcV5XojXZnlceM0RSyh2SnPwQ4RWpIKfTkw0FAisr_3NiBtZv';

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
}
