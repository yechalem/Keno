const express = require('express');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);

const BOT_TOKEN = process.env.BOT_TOKEN || '8707515963:AAEyGvW6EBngaucnqJkxx1iTERTvZ9U2T8E';
const ADMIN_ID = process.env.ADMIN_ID || '686733543';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// የላኩትን Netlify አድራሻ እዚህ ያስገቡ
const WEB_APP_URL = "https://tiny-dasik-98c906.netlify.app";

bot.on("polling_error", (err) => {
  if (!err.message.includes('409 Conflict')) {
    console.log("Bot Warning:", err.message);
  }
});

// 1. የቴሌግራም ሜኑ (Menu Button)
bot.setMyCommands([
  { command: 'play', description: '🎮 Play Keno' },
  { command: 'deposit', description: '📥 Deposit' },
  { command: 'withdraw', description: '📤 Withdraw' },
  { command: 'balance', description: '💰 Check Balance' },
  { command: 'admin', description: '👤 Admin Support' }
]);

// 2. /start ትዕዛዝ
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || "ተጫዋች";

  const welcomeText = `እንኳን ደህና መጡ ${userName}! 👋\n\nከታች ባሉት አማራጮች መጠቀም ይችላሉ፦`;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎮 Play Keno", web_app: { url: WEB_APP_URL } }],
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

// 3. Web App መረጃ ሲልክ (ተጫዋቹ ቁጥር መርጦ መድብ ሲል)
bot.on('web_app_data', async (msg) => {
  const chatId = msg.chat.id;
  try {
    const data = JSON.parse(msg.web_app_data.data);
    const selectedNumbers = data.numbers;
    const stake = data.stake;

    bot.sendMessage(chatId, `✅ **ቲኬትዎ ተይዟል!**\n\n🎯 የመረጧቸው ቁጥሮች፦ ${selectedNumbers.join(', ')}\n💰 የያዙት መደብ፦ ${stake} ETB\n\n🎲 *የእጣ ማውጣት ሂደቱ እየተዘጋጀ ነው...*`, { parse_mode: 'Markdown' });

    // ከ 2 ሰከንድ በኋላ የእጣ ማውጣት ሂደት ይጀምራል
    setTimeout(() => {
      runDrawProcess(chatId, selectedNumbers, stake);
    }, 2000);

  } catch (e) {
    bot.sendMessage(chatId, "⚠️ መረጃውን በማቀናበር ላይ ስህተት ተፈጥሯል።");
  }
});

// 4. የእጣ ማውጣት ፕሮሰስ (20 ቁጥሮች በዘፈቀደ ማውጣት)
function runDrawProcess(chatId, selectedNumbers, stake) {
  let drawnNumbers = [];
  while (drawnNumbers.length < 20) {
    let rand = Math.floor(Math.random() * 80) + 1;
    if (!drawnNumbers.includes(rand)) {
      drawnNumbers.push(rand);
    }
  }

  // ተጫዋቹ የገመታቸው ቁጥሮች ስንት እንደገቡ መቁጠር
  let hits = selectedNumbers.filter(num => drawnNumbers.includes(num));

  let resultMsg = `🎉 **የእጣ ውጤት (Draw Results)!**\n\n`;
  resultMsg += `🎰 ** የወጡ ቁጥሮች (20)፦**\n${drawnNumbers.join(', ')}\n\n`;
  resultMsg += `🎯 **የእርስዎ ቁጥሮች፦** ${selectedNumbers.join(', ')}\n`;
  resultMsg += `✅ **የገቡልዎት ቁጥሮች count፦** ${hits.length} / ${selectedNumbers.length}\n`;

  if (hits.length > 0) {
    resultMsg += `\n🔥 **እንኳን ደስ አለዎት! ${hits.length} ቁጥሮች ገብተውልዎታል!**`;
  } else {
    resultMsg += `\nለአሁኑ አልወጣልዎትም፤ እባክዎን እንደገና ይሞክሩ!`;
  }

  bot.sendMessage(chatId, resultMsg, { parse_mode: 'Markdown' });
}

// 5. ከአዝራሮች ለሚመጡ ጥያቄዎች ምላሽ
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'deposit') {
    bot.sendMessage(chatId, "📥 **ገንዘብ ማስገቢያ (Deposit)**\n\nገቢ ለማድረግ የሚፈልጉትን የብር መጠን ያስገቡ።");
  } else if (data === 'withdraw') {
    bot.sendMessage(chatId, "📤 **ገንዘብ ማውጫ (Withdraw)**\n\nወጪ ማድረግ የሚፈልጉትን የብር መጠን ያስገቡ።");
  } else if (data === 'balance') {
    bot.sendMessage(chatId, "💰 **የሒሳብዎ መጠን፦** 100.00 ETB");
  }

  bot.answerCallbackQuery(query.id);
});

// 6. ከ Menu ለሚመጡ ኮማንዶች
bot.onText(/\/play/, (msg) => {
  bot.sendMessage(msg.chat.id, "🎮 **ጨዋታውን ለመጀመር ከታች ያለውን ይጫኑ፦**", {
    reply_markup: { inline_keyboard: [[{ text: "🎮 Open Keno", web_app: { url: WEB_APP_URL } }]] }
  });
});

bot.onText(/\/deposit/, (msg) => bot.sendMessage(msg.chat.id, "📥 **ገንዘብ ማስገቢያ (Deposit)**"));
bot.onText(/\/withdraw/, (msg) => bot.sendMessage(msg.chat.id, "📤 **ገንዘብ ማውጫ (Withdraw)**"));
bot.onText(/\/balance/, (msg) => bot.sendMessage(msg.chat.id, "💰 **የሒሳብዎ መጠን፦** 100.00 ETB"));
bot.onText(/\/admin/, (msg) => bot.sendMessage(msg.chat.id, "👤 **የአድሚን ማነጋገርያ፦** @YOUR_ADMIN_USERNAME"));

app.use(express.static(__dirname));
app.get('/', (req, res) => res.send('Keno Bot Backend is Running!'));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
