require('dotenv').config();

const { createServer } = require('http');
const next = require('next');
const bot = require('./lib/bot');
const { startStatsSummarySchedule } = require('./lib/statsSummary');
const { startBlogAgentSchedule } = require('./lib/blogAgent');
const { startNewsletterSchedule } = require('./lib/newsletter');
const { loadReleases, sendConfirmationEmail } = require('./lib/releases');

const dev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(PORT, () => {
    console.log(`Topps release tracker running at http://localhost:${PORT}`);
    bot.init({ loadReleases, sendConfirmationEmail });
    startStatsSummarySchedule();
    startBlogAgentSchedule();
    startNewsletterSchedule();
  });
});
