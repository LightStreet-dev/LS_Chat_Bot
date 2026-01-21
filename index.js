require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);

/* ======================
   STATE & HISTORY
====================== */
let userState = {}; // { userId: { lang } }

const CHAT_HISTORY_FILE = "./chat_history.json";
let chatHistory = fs.existsSync(CHAT_HISTORY_FILE)
  ? JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE))
  : {};

function saveChatHistory() {
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
}

/* ======================
   /start – language
====================== */
bot.start((ctx) => {
  ctx.reply("Оберіть мову / Choose language", {
    reply_markup: {
      keyboard: [["🇬🇧 English"], ["🇵🇱 Polska"], ["🇺🇦 Українська"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

/* ======================
   Language select
====================== */
bot.hears("🇺🇦 Українська", (ctx) => setLanguage(ctx, "ua"));
bot.hears("🇬🇧 English", (ctx) => setLanguage(ctx, "en"));
bot.hears("🇵🇱 Polska", (ctx) => setLanguage(ctx, "pl"));

function setLanguage(ctx, lang) {
  userState[ctx.from.id] = { lang };
  sendServices(ctx, lang);
}

function sendServices(ctx, lang) {
  const texts = {
    ua: "Яка послуга вам потрібна?",
    en: "What service do you need?",
    pl: "Jakiej usługi potrzebujesz?",
  };

  const buttons = {
    ua: [
      ["🌐 Розробка сайту", "site"],
      ["🎨 Дизайн", "design"],
      ["🎥 Фото/Відео/Контент", "content"],
      ["🤖 Чат бот", "bot"],
      ["❓ Інше питання", "other"],
    ],
    en: [
      ["🌐 Website Development", "site"],
      ["🎨 Design", "design"],
      ["🎥 Photo/Video/Content", "content"],
      ["🤖 Chatbot", "bot"],
      ["❓ Other Question", "other"],
    ],
    pl: [
      ["🌐 Tworzenie stron", "site"],
      ["🎨 Projektowanie", "design"],
      ["🎥 Zdjęcia / Wideo", "content"],
      ["🤖 Chatbot", "bot"],
      ["❓ Inne pytanie", "other"],
    ],
  };

  ctx.reply(texts[lang], {
    reply_markup: {
      inline_keyboard: buttons[lang].map(([t, d]) => [
        { text: t, callback_data: d },
      ]),
    },
  });
}

/* ======================
   Service select
====================== */
const thankYou = {
  ua: "Дякуємо! Менеджер скоро з вами зв'яжеться 🙌",
  en: "Thank you! Our manager will contact you shortly 🙌",
  pl: "Dziękujemy! Menedżer wkrótce się z Tobą skontaktuje 🙌",
};

bot.on("callback_query", async (ctx) => {
  const service = ctx.callbackQuery.data;
  const user = ctx.from;
  const lang = userState[user.id]?.lang || "ua";

  const msg = `📩 Нова заявка
👤 ${user.first_name} ${user.last_name || ""}
🌍 Мова: ${lang}
💬 Послуга: ${service}
🆔 ID користувача: ${user.id}`;

  await ctx.telegram.sendMessage(process.env.MANAGER_GROUP_ID, msg);
  await ctx.answerCbQuery();
  await ctx.reply(thankYou[lang]);
});

/* ======================
   ONE message handler
====================== */
bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id.toString();

  /* ===== MANAGER → USER ===== */
  if (chatId === process.env.MANAGER_GROUP_ID) {
    const replied = ctx.message.reply_to_message;
    if (!replied) return;

    const text = replied.text || replied.caption;
    if (!text) return;

    const match = text.match(/ID користувача:\s*(\d+)/);
    if (!match) return;

    const userId = Number(match[1]);

    try {
      if (ctx.message.text) {
        await ctx.telegram.sendMessage(userId, ctx.message.text);
      } else if (ctx.message.photo) {
        await ctx.telegram.sendPhoto(
          userId,
          ctx.message.photo.at(-1).file_id,
          { caption: ctx.message.caption }
        );
      } else if (ctx.message.document) {
        await ctx.telegram.sendDocument(
          userId,
          ctx.message.document.file_id,
          { caption: ctx.message.caption }
        );
      } else if (ctx.message.voice) {
        await ctx.telegram.sendVoice(
          userId,
          ctx.message.voice.file_id
        );
      }

      console.log("✅ Manager → user:", userId);
    } catch (e) {
      console.error("❌ Send error:", e);
    }
    return;
  }

  /* ===== USER → GROUP ===== */
  const user = ctx.from;
  const lang = userState[user.id]?.lang || "ua";

  let msg = `💬 Повідомлення від клієнта
👤 ${user.first_name}
🌍 ${lang}
🆔 ID користувача: ${user.id}\n\n`;

  if (ctx.message.text) msg += ctx.message.text;
  else if (ctx.message.photo) msg += "📷 Фото";
  else if (ctx.message.document) msg += `📎 ${ctx.message.document.file_name}`;
  else if (ctx.message.voice) msg += "🎤 Голосове повідомлення";

  await ctx.telegram.sendMessage(process.env.MANAGER_GROUP_ID, msg);

  if (!chatHistory[user.id]) chatHistory[user.id] = [];
  chatHistory[user.id].push({
    from: "user",
    type: ctx.message.text
      ? "text"
      : ctx.message.photo
      ? "photo"
      : ctx.message.document
      ? "document"
      : "voice",
    timestamp: Date.now(),
  });
  saveChatHistory();
});

/* ======================
   Close
====================== */
bot.command("close", (ctx) => {
  delete userState[ctx.from.id];
  ctx.reply("Чат закрито ✅");
});

/* ======================
   Launch
====================== */
bot.launch();
console.log("🤖 Bot started");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
