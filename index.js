require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs");
const http = require("http");

if (!process.env.BOT_TOKEN || !process.env.MANAGER_GROUP_ID) {
  console.error("❌ BOT_TOKEN or MANAGER_GROUP_ID is missing!");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

/* STATE & HISTORY */
let userState = {};
const CHAT_HISTORY_FILE = "./chat_history.json";
let chatHistory = fs.existsSync(CHAT_HISTORY_FILE)
  ? JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE))
  : {};
function saveChatHistory() {
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
}

/* LANGUAGE & SERVICES */
bot.start((ctx) => {
  ctx.reply("Wybierz język/ Оберіть мову / Choose language", {
    reply_markup: {
      keyboard: [["🇬🇧 English"], ["🇵🇱 Polska"], ["🇺🇦 Українська"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

bot.hears("🇺🇦 Українська", (ctx) => setLanguage(ctx, "ua"));
bot.hears("🇬🇧 English", (ctx) => setLanguage(ctx, "en"));
bot.hears("🇵🇱 Polska", (ctx) => setLanguage(ctx, "pl"));

function setLanguage(ctx, lang) {
  userState[ctx.from.id] = { lang };
  sendServices(ctx, lang);
}

function sendServices(ctx, lang) {
  const texts = { ua: "Яка послуга вам потрібна?", en: "What service do you need?", pl: "Jakiej usługi potrzebujesz?" };
  const buttons = {
    ua: [["🌐 Розробка сайту", "site"], ["🎨 Дизайн", "design"], ["🎥 Фото/Відео/Контент", "content"], ["🤖 Чат бот", "bot"], ["❓ Інше питання", "other"]],
    en: [["🌐 Website Development", "site"], ["🎨 Design", "design"], ["🎥 Photo/Video/Content", "content"], ["🤖 Chatbot", "bot"], ["❓ Other Question", "other"]],
    pl: [["🌐 Tworzenie stron", "site"], ["🎨 Projektowanie", "design"], ["🎥 Zdjęcia / Wideo", "content"], ["🤖 Chatbot", "bot"], ["❓ Inne pytanie", "other"]],
  };
  ctx.reply(texts[lang], { reply_markup: { inline_keyboard: buttons[lang].map(([t, d]) => [{ text: t, callback_data: d }]) } });
}

/* CALLBACK */
const thankYou = { ua: "Дякуємо! Менеджер скоро з вами зв'яжеться 🙌", en: "Thank you! Our manager will contact you shortly 🙌", pl: "Dziękujemy! Menedżer wkrótce się z Tobą skontaktuje 🙌" };

bot.on("callback_query", async (ctx) => {
  try {
    const service = ctx.callbackQuery.data;
    const user = ctx.from;
    const lang = userState[user.id]?.lang || "ua";
    const msg = `📩 Нова заявка\n👤 ${user.first_name} ${user.last_name || ""}\n🌍 Мова: ${lang}\n💬 Послуга: ${service}\n🆔 ID користувача: ${user.id}`;
    await ctx.telegram.sendMessage(process.env.MANAGER_GROUP_ID, msg);
    await ctx.answerCbQuery();
    await ctx.reply(thankYou[lang]);
  } catch (e) {
    console.error("❌ Callback error:", e);
  }
});

/* MESSAGE HANDLER */
bot.on("message", async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();

    if (chatId === process.env.MANAGER_GROUP_ID) {
      const replied = ctx.message.reply_to_message;
      if (!replied) return;

      const text = replied.text || replied.caption;
      if (!text) return;

      const match = text.match(/ID користувача:\s*(\d+)/);
      if (!match) return;

      const userId = Number(match[1]);

      if (ctx.message.text) await ctx.telegram.sendMessage(userId, ctx.message.text);
      else if (ctx.message.photo) await ctx.telegram.sendPhoto(userId, ctx.message.photo.at(-1).file_id, { caption: ctx.message.caption });
      else if (ctx.message.document) await ctx.telegram.sendDocument(userId, ctx.message.document.file_id, { caption: ctx.message.caption });
      else if (ctx.message.voice) await ctx.telegram.sendVoice(userId, ctx.message.voice.file_id);

      return;
    }

    const user = ctx.from;
    const lang = userState[user.id]?.lang || "ua";
    let msg = `💬 Повідомлення від клієнта\n👤 ${user.first_name}\n🌍 ${lang}\n🆔 ID користувача: ${user.id}\n\n`;
    if (ctx.message.text) msg += ctx.message.text;
    else if (ctx.message.photo) msg += "📷 Фото";
    else if (ctx.message.document) msg += `📎 ${ctx.message.document.file_name}`;
    else if (ctx.message.voice) msg += "🎤 Голосове повідомлення";

    await ctx.telegram.sendMessage(process.env.MANAGER_GROUP_ID, msg);

    if (!chatHistory[user.id]) chatHistory[user.id] = [];
    chatHistory[user.id].push({ from: "user", type: ctx.message.text ? "text" : ctx.message.photo ? "photo" : ctx.message.document ? "document" : "voice", timestamp: Date.now() });
    saveChatHistory();
  } catch (e) {
    console.error("❌ Message handler error:", e);
  }
});

/* CLOSE COMMAND */
bot.command("close", (ctx) => {
  delete userState[ctx.from.id];
  ctx.reply("Чат закрито ✅");
});

/* DELETE WEBHOOK */
(async () => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  } catch (e) {
    console.error("❌ Webhook delete error:", e);
  }

  bot.launch().then(() => console.log("🤖 Bot started")).catch(console.error);
})();

/* GRACEFUL SHUTDOWN */
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

/* FAKE SERVER FOR RENDER */
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running');
}).listen(PORT, () => console.log(`🌐 Server listening on ${PORT}`));
