const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 📌 Config / Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN || '8707515963:AAEyGvW6EBngaucnqJkxx1iTERTvZ9U2T8E';
const ADMIN_ID = process.env.ADMIN_ID || '686733543';
const TELEBIRR_NO = process.env.TELEBIRR_NO || "0915503379";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "A_ToolsX";

// 📌 Web App URLs (ለሁለቱም ጨዋታዎች)
const KENO_WEB_APP_URL = process.env.KENO_URL || "https://tiny-dasik-98c906.netlify.app";
const BINGO_WEB_APP_URL = process.env.BINGO_URL || "https://effervescent-maamoul-0a2b69.netlify.app";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on("polling_error", (err) => {
  if (!err.message.includes('409 Conflict')) {
    console.log("Bot Warning:", err.message);
  }
});

// 📌 Database & Shared State (ሁለቱም ጨዋታዎች አንድ ላይ የሚጠቀሙበት)
const usersDB = {};        
let activeTickets = [];    
let drawnNumbers = [];     
let isDrawing = false;
let gameTimer = 60; 
let currentFakePlayerCount = 3200;

const PAYTABLE = {
  1: { 1: 3.5 },
  2: { 2: 10, 1: 1 },
  3: { 3: 50, 2: 2 },
  4: { 4: 100, 3: 5, 2: 1 },
  5: { 5: 300, 4: 15, 3: 2 },
  6: { 6: 1000, 5: 50, 4: 5, 3: 1 },
  7: { 7: 2000, 6: 100, 5: 12, 4: 2 },
  8: { 8: 5000, 7: 300, 6: 40, 5: 8, 4: 1 },
  9: { 9: 10000, 8: 1000, 7: 150, 6: 20, 5: 3 },
  10: { 10: 25000, 9: 2000, 8: 400, 7: 50, 6: 10, 5: 2 }
};

bot.setMyCommands([
  { command: 'play', description: '🎮 Play Games' },
  { command: 'start', description: '🔄 Restart Bot' },
  { command: 'balance', description: '💰 Check Balance' }
]);

// 🔹 /start ሲባል የ Keno እና Bingo አማራጮችን አብሮ ያሳያል
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const userName = msg.from.first_name || "ተጫዋች";

  if (!usersDB[userId]) {
    usersDB[userId] = { id: userId, name: userName, balance: 50.00, history: [] };
  }

  const welcomeText = `እንኳን ደህና መጡ ${userName}! 👋\n\nለመጫወት የሚፈልጉትን ጨዋታ ይምረጡ (ባላንስዎ ለሁለቱም ያገለግላል)፦`;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎮 Play Keno", web_app: { url: KENO_WEB_APP_URL } },
          { text: "🎯 Play Bingo", web_app: { url: BINGO_WEB_APP_URL } }
        ],
        [
          { text: "💰 Check Balance", callback_data: "balance" },
          { text: "💸 Deposit", callback_data: "deposit" }
        ],
        [
          { text: "🚨 Contact support", url: `https://t.me/${ADMIN_USERNAME}` },
          { text: "💬 Instruction", callback_data: "instruction" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeText, options);
});

// 🔹 Callback Queries (የቦቱ አዝራሮች ምላሽ)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = String(query.from.id);
  const data = query.data;

  if (data === 'balance') {
    const bal = usersDB[userId] ? usersDB[userId].balance : 0.00;
    bot.sendMessage(chatId, `💰 የጋራ የሕሳብዎ መጠን፦ ${bal.toFixed(2)} ETB`);
  } else if (data === 'deposit') {
    bot.sendMessage(chatId, `📥 **ገንዘብ ለማስገባት (Deposit)፦**\n\n1. በቴሌብር ወደዚህ ቁጥር ይላኩ፦ \`${TELEBIRR_NO}\`\n2. የላኩበትን SMS በ Keno ወይም Bingo App Deposit ገጽ ላይ ያስገቡ። ጥያቄው ወዲያውኑ ለ Admin ይላካል።`, { parse_mode: 'Markdown' });
  } else if (data === 'instruction') {
    bot.sendMessage(chatId, "💬 **የጨዋታው መመሪያ፦**\n1. Keno ወይም Bingo መርጠው ይግቡ።\n2. አስቀድመው የቆረጡት ባላንስ በሁለቱም ጨዋታዎች ይሰራል።\n3. ያሸነፉት ገንዘብ በቀጥታ ወደ ዋናው ባላንስዎ ይገባል።");
  }

  bot.answerCallbackQuery(query.id);
});

// 🔹 Admin በ Telegram በኩል የትኛውንም Deposit የሚያጸድቅበት Command
bot.onText(/\/deposit_(\d+)_(\d+(\.\d+)?)/, (msg, match) => {
  const senderId = String(msg.chat.id);
  if (senderId !== String(ADMIN_ID)) return;

  const targetUserId = String(match[1]);
  const amount = parseFloat(match[2]);

  if (!usersDB[targetUserId]) {
    usersDB[targetUserId] = { id: targetUserId, name: "ተጫዋች", balance: 0, history: [] };
  }

  usersDB[targetUserId].balance += amount;
  const newBalance = usersDB[targetUserId].balance;

  // ለሁለቱም App (Keno & Bingo) በቋሚነት ባላንስ ማሻሻያ ይልካል
  io.to(targetUserId).emit('balanceUpdated', newBalance);
  
  bot.sendMessage(ADMIN_ID, `✅ Deposit ጸድቋል!\n\n🆔 User ID: ${targetUserId}\n💵 የተደመረ: ${amount} ETB\n💰 አዲሱ ባላንስ: ${newBalance.toFixed(2)} ETB`);
  bot.sendMessage(targetUserId, `🎉 የ ${amount} ETB Deposit ጥያቄዎ ጸድቋል!\n\n💰 የአሁኑ ባላንስዎ፦ ${newBalance.toFixed(2)} ETB`);
});

// 📌 Socket.io Events (ከ Keno እና Bingo Web App የሚመጡ ጥያቄዎች)
io.on('connection', (socket) => {
  
  // ተጫዋች ከ Keno ወይም Bingo ሲገባ መመዝገቢያና የባላንስ ማጋሪያ
  socket.on('registerUser', (tgUser) => {
    if (!tgUser || !tgUser.id) return;
    const userId = String(tgUser.id);

    if (!usersDB[userId]) {
      usersDB[userId] = { id: userId, name: tgUser.first_name || "ተጫዋች", balance: 100.00, history: [] };
    }
    
    socket.userId = userId;
    socket.join(userId); // ለአንድ ተጫዋች ለብቻው መልእክት ለመላክ

    // ያለውን የጋራ ባላንስ ወደ App ይልካል
    socket.emit('userData', {
      user: usersDB[userId],
      activeTickets: activeTickets,
      timer: gameTimer,
      isDrawing: isDrawing,
      drawnNumbers: drawnNumbers,
      totalPlayersCount: currentFakePlayerCount
    });
  });

  // ከ Bingo ወይም Keno የሚላክ የ Deposit SMS ማረጋገጫ ለ አድሚን ይልካል
  socket.on('verifyAndDeposit', (data) => {
    const userId = String(data.userId);
    const amount = parseFloat(data.amount);
    const smsText = data.smsText;
    const gameType = data.gameType || 'App'; // Keno ወይም Bingo መሆኑን ለመለየት
    const user = usersDB[userId];

    if (!user) {
      return socket.emit('errorMsg', 'ተጠቃሚው አልተገኘም!');
    }

    // ጥያቄውን ቀጥታ ለ Admin ቴሌግራም ይልካል
    const adminMsg = `⚠️ **አዲስ የ Deposit ጥያቄ (${gameType})!**\n\n👤 ተጫዋች፦ ${user.name}\n🆔 ID፦ \`${userId}\`\n💰 መጠን፦ ${amount} ETB\n\n📝 **SMS Text፦**\n${smsText}\n\nለማጽደቅ ይህንን ይጫኑ፦\n/deposit_${userId}_${amount}`;
    
    bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown' });
    socket.emit('infoMsg', 'የላኩት SMS ለ Admin ተልኳል፤ ተረጋግጦ ይጨመራል።');
  });

  // ከ Bingo ወይም Keno የሚላክ የ Withdraw ጥያቄ ለ አድሚን ይልካል
  socket.on('requestWithdraw', (data) => {
    const userId = String(data.userId);
    const user = usersDB[userId];

    if (user && user.balance >= data.amount) {
      user.balance -= data.amount;
      
      // በ Real-time ባላንሱን ይቀንሳል
      io.to(userId).emit('balanceUpdated', user.balance);
      
      const msgText = `📤 **አዲስ የ Withdraw ጥያቄ!**\n\n👤 ተጫዋች፦ ${user.name}\n🆔 ID፦ \`${user.id}\`\n💰 መጠን፦ ${data.amount} ETB\n🏦 አካውንት details፦ ${data.accountDetails}`;
      bot.sendMessage(ADMIN_ID, msgText, { parse_mode: 'Markdown' });
      socket.emit('infoMsg', 'የወጪ ጥያቄዎ ለ Admin ተልኳል።');
    } else {
      socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');
    }
  });

  // Keno / Bingo ትኬት መግዣ logic
  socket.on('buyTicket', (data) => {
    const userId = String(data.userId);
    const user = usersDB[userId];
    if (!user) return;

    if (user.balance < data.bet) return socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');

    user.balance -= data.bet;

    // አዲሱን ባላንስ ለተጫዋቹ ይልካል
    io.to(userId).emit('balanceUpdated', user.balance);
    socket.emit('ticketBoughtSuccess');
  });
});

app.use(express.static(__dirname));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
