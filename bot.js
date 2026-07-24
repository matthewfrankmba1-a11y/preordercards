const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getInterestById, markEmailSent } = require('./db');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const SPORT_EMOJI = {
  Baseball: '⚾',
  Basketball: '🏀',
  Football: '🏈',
  MMA: '🥊',
  Soccer: '⚽',
  Entertainment: '🎬',
};

let client = null;
let ready = false;

// loadReleases and sendConfirmationEmail are injected from server.js at init time
// to avoid a circular require (server.js also requires this module).
function init({ loadReleases, sendConfirmationEmail }) {
  if (!BOT_TOKEN || !CHANNEL_ID) return;

  client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Without an 'error' listener, EventEmitter rethrows and crashes the whole
  // process on any Gateway hiccup (e.g. a WebSocket handshake timeout) — which
  // would take the entire web server down, not just the bot. Never let that happen.
  client.on('error', (err) => {
    console.error('Discord client error:', err.message);
  });
  client.on('shardError', (err) => {
    console.error('Discord shard error:', err.message);
  });

  client.once('clientReady', () => {
    ready = true;
    console.log('Discord bot connected.');
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('send_email:')) return;

    const id = Number(interaction.customId.split(':')[1]);
    const row = getInterestById.get(id);

    if (!row) {
      return interaction.reply({ content: 'Registration not found (may have been removed).', ephemeral: true });
    }
    if (row.contactType !== 'email') {
      return interaction.reply({ content: 'No email on file — they registered with a phone number.', ephemeral: true });
    }
    if (row.emailSentAt) {
      return interaction.reply({ content: `Already sent, at ${row.emailSentAt}.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const data = loadReleases();
    const release = data.releases.find((r) => r.id === row.releaseId);
    if (!release) {
      return interaction.editReply({ content: 'Release not found in current release data.' });
    }

    const result = await sendConfirmationEmail(release, {
      contactType: row.contactType,
      contactValue: row.contactValue,
      quantity: row.quantity,
    });

    if (!result.ok) {
      return interaction.editReply({ content: `Failed to send: ${result.error}` });
    }

    const sentAt = new Date().toISOString();
    markEmailSent.run({ id, sentAt });

    try {
      const oldRow = interaction.message.components[0];
      const disabledButton = ButtonBuilder.from(oldRow.components[0])
        .setDisabled(true)
        .setLabel('Email Sent ✅')
        .setStyle(ButtonStyle.Secondary);
      await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(disabledButton)] });
    } catch (err) {
      console.error('Failed to update Discord message after sending email:', err.message);
    }

    await interaction.editReply({ content: `Sent to ${row.contactValue}.` });
  });

  client.login(BOT_TOKEN).catch((err) => {
    console.error('Discord bot failed to log in:', err.message);
  });
}

async function postInterestAlert(release, row) {
  if (!ready || !CHANNEL_ID) return false;
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const emoji = SPORT_EMOJI[release.sport] || '📦';

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} New interest registration`)
      .setColor(0xd21f3c)
      .addFields(
        { name: 'Release', value: release.title },
        { name: 'Sport', value: release.sport, inline: true },
        { name: 'Release date', value: release.releaseDate, inline: true },
        { name: 'Quantity', value: String(row.quantity), inline: true },
        { name: row.contactType === 'email' ? 'Email' : 'Phone', value: row.contactValue },
      )
      .setTimestamp();

    const components = [];
    if (row.contactType === 'email') {
      const button = new ButtonBuilder()
        .setCustomId(`send_email:${row.id}`)
        .setLabel('Send Confirmation Email')
        .setStyle(ButtonStyle.Success);
      components.push(new ActionRowBuilder().addComponents(button));
    }

    await channel.send({ embeds: [embed], components });
    return true;
  } catch (err) {
    console.error('Failed to post Discord bot alert:', err.message);
    return false;
  }
}

function isConfigured() {
  return Boolean(BOT_TOKEN && CHANNEL_ID);
}

module.exports = { init, postInterestAlert, isConfigured };
