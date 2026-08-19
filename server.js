const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// 📌 አዲሱ Bot Token እዚሁ ገብቷል
const BOT_TOKEN = process.env.BOT_TOKEN || '8707515963:AAEyGvW6EBngaucnqJkxx1iTERTvZ9U2T8E';
const ADMIN_ID = process.env.ADMIN_ID || '686733543';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on("polling_error", (err) => {
  if (!err.message.includes('409 Conflict')) {
    console.log("Bot Warning:", err.message);
  }
});

// 1. የቴሌግራም ሜኑ (Menu Button) ማዋቀሪያ
bot.setMyCommands([
  { command: 'play', description: '🎮 Play Game' },
  { command: 'deposit', description: '📥 Deposit' },
  { command: 'withdraw', description: '📤 Withdraw' },
  { command: 'balance', description: '💰 Check Balance' },
  { command: 'admin', description: '👤 Admin Support' }
]);

// 2. ተጫዋቹ /start ሲል የሚመጣው መልእክት እና ተመሳሳይ አዝራሮች
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || "ተጫዋች";

  const welcomeText = `እንኳን ደህና መጡ ${userName}! 👋\n\nከታች ባሉት አማራጮች መጠቀም ይችላሉ፦`;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎮 Play", web_app: { url: "https://tiny-dasik-98c906.netlify.app" } }
        ],
        [
          { text: "📥 Deposit", callback_data: "deposit" },
          { text: "📤 Withdraw", callback_data: "withdraw" }
        ],
        [
          { text: "💰 Check Balance", callback_data: "balance" },
          { text: "👤 Admin Support", url: "https://t.me/YOUR_ADMIN_USERNAME" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeText, options);
});

// 3. ከአዝራሮቹ (Callback Buttons) ለሚመጡ ጥያቄዎች ምላሽ መስጫ
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'deposit') {
    bot.sendMessage(chatId, "📥 **ገንዘብ ማስገቢያ (Deposit)**\n\nገቢ ለማድረግ የሚፈልጉትን የብር መጠን ያስገቡ።");
  } else if (data === 'withdraw') {
    bot.sendMessage(chatId, "📤 **ገንዘብ ማውጫ (Withdraw)**\n\nወጪ ማድረግ የሚፈልጉትን የብር መጠን ያስገቡ።");
  } else if (data === 'balance') {
    bot.sendMessage(chatId, "💰 **የሒሳብዎ መጠን፦** 0.00 ETB");
  }

  bot.answerCallbackQuery(query.id);
});

// 4. ከ Menu /command ሲመርጡ የሚሰጡት ምላሾች
bot.onText(/\/play/, (msg) => {
  bot.sendMessage(msg.chat.id, "🎮 **ጨዋታውን ለመጀመር ከታች ያለውን ይጫኑ፦**", {
    reply_markup: {
      inline_keyboard: [[{ text: "🎮 Open Game", web_app: { url: "https://tiny-dasik-98c906.netlify.app" } }]]
    }
  });
});

bot.onText(/\/deposit/, (msg) => {
  bot.sendMessage(msg.chat.id, "📥 **ገንዘብ ማስገቢያ (Deposit)**\n\nገቢ ለማድረግ የሚፈልጉትን የብር መጠን ያስገቡ።");
});

bot.onText(/\/withdraw/, (msg) => {
  bot.sendMessage(msg.chat.id, "📤 **ገንዘብ ማውጫ (Withdraw)**\n\nወጪ ማድረግ የሚፈልጉትን የብር መጠን ያስገቡ።");
});

bot.onText(/\/balance/, (msg) => {
  bot.sendMessage(msg.chat.id, "💰 **የሒሳብዎ መጠን፦** 0.00 ETB");
});

bot.onText(/\/admin/, (msg) => {
  bot.sendMessage(msg.chat.id, "👤 **የአድሚን ማነጋገርያ፦** @YOUR_ADMIN_USERNAME");
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.send('Telegram Bot Server is Running!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Keno Server running on port ${PORT}`));
