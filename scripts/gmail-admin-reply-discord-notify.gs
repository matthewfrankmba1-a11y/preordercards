// Google Apps Script — standalone script (not bound to any specific Form/Sheet).
// Checks the Gmail inbox that admin@preordercards.com forwards to (via ImprovMX)
// for new unread messages, and posts a Discord alert for each one.
//
// Setup:
// 1. Go to script.google.com → New Project. Paste this whole file in,
//    replacing any starter code.
// 2. Triggers (clock icon on the left) → + Add Trigger →
//    function: checkForNewAdminReplies, event source: Time-driven,
//    type: Minutes timer, every 5 minutes → Save.
// 3. Authorize when prompted (Advanced → Go to [project] (unsafe) — normal
//    for personal scripts, not a real security warning). This script needs
//    Gmail read/modify access to search messages and mark them read.
// 4. Send a test email to admin@preordercards.com and wait up to 5 minutes,
//    or run checkForNewAdminReplies manually from the editor to test sooner.

function checkForNewAdminReplies() {
  var webhookUrl = 'https://discord.com/api/webhooks/1530594093506232337/7EcdBm6rJ2AbkGh8NiL8Vlj4DFJRLZI5UH00fWN45VUhUocNZF4qmX7PQzDJCsUwMa4l';

  var threads = GmailApp.search('to:admin@preordercards.com is:unread', 0, 20);

  threads.forEach(function (thread) {
    var messages = thread.getMessages();
    messages.forEach(function (message) {
      if (!message.isUnread()) return;

      var from = message.getFrom();
      var subject = message.getSubject() || '(no subject)';
      var body = message.getPlainBody() || '';
      var snippet = body.length > 500 ? body.slice(0, 500) + '…' : body;

      var payload = {
        username: 'New Preorder!',
        embeds: [
          {
            title: '📧 New reply to admin@preordercards.com',
            color: 13770556,
            fields: [
              { name: 'From', value: from },
              { name: 'Subject', value: subject },
              { name: 'Message', value: snippet || '(empty)' },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      };

      try {
        UrlFetchApp.fetch(webhookUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
        });
        message.markRead();
      } catch (err) {
        // Leave unread on failure so it's retried on the next run.
      }
    });
  });
}
