const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const BOT_TOKEN = process.env.BOT_TOKEN || '8707515963:AAEyGvW6EBngaucnqJkxx1iTERTvZ9U2T8E';
const ADMIN_ID = process.env.ADMIN_ID || '686733543';
const TELEBIRR_NO = "0915503379";
const WEB_APP_URL = "https://tiny-dasik-98c906.netlify.app";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on("polling_error", (err) => {
  if (!err.message.includes('409 Conflict')) {
    console.log("Bot Warning:", err.message);
  }
});

const usersDB = {};       
let activeTickets = [];   
let drawnNumbers = [];    
let isDrawing = false;
let gameTimer = 60; // ⏱️ ጨዋታው በየ 1 ደቂቃው (60 ሰከንድ)

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
  { command: 'play', description: '🎮 Play Keno' },
  { command: 'start', description: '🔄 Restart Bot' },
  { command: 'balance', description: '💰 Check Balance' }
]);

const sendWelcomeMessage = (chatId, userName) => {
  const text = `እንኳን ደህና መጡ ${userName}! 👋\n\n🎮 Keno ለመጫወት ከታች ያለውን "Play Keno" ቁልፍ ይጫኑ።\n📱 ቴሌብር አድራሻ: ${TELEBIRR_NO}`;
  bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: "🎮 Play Keno", web_app: { url: WEB_APP_URL } }]]
    }
  });
};

bot.onText(/\/start/, (msg) => {
  const userId = String(msg.from.id);
  const userName = msg.from.first_name || "ተጫዋች";
  if (!usersDB[userId]) usersDB[userId] = { id: userId, name: userName, balance: 100.00, history: [] };
  sendWelcomeMessage(msg.chat.id, userName);
});

bot.onText(/\/play/, (msg) => {
  const userName = msg.from.first_name || "ተጫዋች";
  sendWelcomeMessage(msg.chat.id, userName);
});

bot.onText(/\/balance/, (msg) => {
  const userId = String(msg.from.id);
  const bal = usersDB[userId] ? usersDB[userId].balance : 100.00;
  bot.sendMessage(msg.chat.id, `💰 **የአሁኑ ባላንስዎ፦** ${bal.toFixed(2)} ETB`);
});

// 📌 Admin Deposit Approve ማድረጊያ - ባላንስ ወዲያውኑ እንዲደመር የተስተካከለ
bot.onText(/\/deposit_(\d+)_(\d+(\.\d+)?)/, (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;
  const targetUserId = match[1];
  const amount = parseFloat(match[2]);

  if (!usersDB[targetUserId]) usersDB[targetUserId] = { id: targetUserId, name: "ተጫዋች", balance: 0, history: [] };
  usersDB[targetUserId].balance += amount;

  // 📌 ለተጫዋቹ በ Socket እና በ Telegram አሳውቅ
  io.to(targetUserId).emit('balanceUpdated', usersDB[targetUserId].balance);
  bot.sendMessage(ADMIN_ID, `✅ ለ ID: ${targetUserId} የ ${amount} ETB Deposit ጸድቋል! የአሁኑ ባላንስ: ${usersDB[targetUserId].balance.toFixed(2)} ETB`);
  bot.sendMessage(targetUserId, `🎉 ሂሳብዎ ላይ ${amount} ETB ገቢ ሆኗል! የአሁኑ ባላንስዎ: ${usersDB[targetUserId].balance.toFixed(2)} ETB`);
});

// ⏱️ የ 1 ደቂቃ (60s) የሰዓት ቆጠራ
setInterval(() => {
  if (!isDrawing) {
    gameTimer--;
    io.emit('timerUpdate', gameTimer);
    if (gameTimer <= 0) startKenoDraw();
  }
}, 1000);

function startKenoDraw() {
  isDrawing = true;
  drawnNumbers = [];
  io.emit('drawStarted');

  let count = 0;
  const interval = setInterval(() => {
    let rand;
    do {
      rand = Math.floor(Math.random() * 80) + 1;
    } while (drawnNumbers.includes(rand));

    drawnNumbers.push(rand);
    count++;

    io.emit('newDrawnNumber', { number: rand, drawnList: drawnNumbers });

    if (count >= 20) {
      clearInterval(interval);
      calculateWinnings();

      // 📌 የወጣውን ቁጥር አረጋግጦ ለማየት 3 ሰከንድ ብቻ ጠብቆ Clear በማድረግ ቀጣዩን ጨዋታ ይጀምራል
      setTimeout(() => {
        isDrawing = false;
        gameTimer = 60;
        drawnNumbers = [];
        activeTickets = [];
        io.emit('gameReset');
      }, 3000);
    }
  }, 1200);
}

function calculateWinnings() {
  activeTickets.forEach(ticket => {
    const user = usersDB[ticket.userId];
    if (!user) return;

    const hits = ticket.numbers.filter(num => drawnNumbers.includes(num));
    const spotSize = ticket.numbers.length;
    const hitCount = hits.length;

    let winAmount = 0;
    if (PAYTABLE[spotSize] && PAYTABLE[spotSize][hitCount]) {
      winAmount = ticket.bet * PAYTABLE[spotSize][hitCount];
      user.balance += winAmount;
    }

    io.to(ticket.socketId).emit('ticketResult', {
      winAmount,
      hitsCount: hitCount,
      userBalance: user.balance
    });
  });
}

io.on('connection', (socket) => {
  socket.on('registerUser', (tgUser) => {
    const userId = String(tgUser.id);
    if (!usersDB[userId]) {
      usersDB[userId] = { id: userId, name: tgUser.first_name || "ተጫዋች", balance: 100.00, history: [] };
    }
    socket.userId = userId;
    socket.join(userId);

    socket.emit('userData', {
      user: usersDB[userId],
      activeTickets: activeTickets,
      timer: gameTimer,
      isDrawing: isDrawing,
      drawnNumbers: drawnNumbers
    });
  });

  socket.on('buyTicket', (data) => {
    const user = usersDB[data.userId];
    if (!user) return;

    // 📌 ጨዋታው ከጀመረ ወይም 1 ሰከንድ ሲቀረው ትኬት መቁረጥ ይከለክላል
    if (isDrawing || gameTimer <= 1) {
      return socket.emit('errorMsg', 'ጨዋታው ሊጀምር ስለሆነ ትኬት መቁረጥ ተዘግቷል! ቀጣዩን ዙር ይበቁ።');
    }
    if (user.balance < data.bet) return socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም! እባክዎን Deposit ያድርጉ።');

    user.balance -= data.bet;

    const newTicket = {
      id: Date.now(),
      userId: user.id,
      userName: user.name,
      numbers: data.numbers,
      bet: data.bet,
      socketId: socket.id
    };

    activeTickets.push(newTicket);
    io.emit('updateActiveTickets', activeTickets);
    socket.emit('balanceUpdated', user.balance);
  });

  socket.on('requestDeposit', (data) => {
    const user = usersDB[data.userId];
    bot.sendMessage(ADMIN_ID, 
      `📥 **የDeposit ጥያቄ!**\n\n👤 ተጫዋች: ${user ? user.name : 'Unknown'}\n🆔 ID: \`${data.userId}\`\n💰 መጠን: ${data.amount} ETB\n📱 Ref: ${data.ref}\n\nለማጽደቅ ይህን ይጫኑ፦\n/deposit_${data.userId}_${data.amount}`, 
      { parse_mode: 'Markdown' }
    );
    socket.emit('infoMsg', 'የDeposit ጥያቄዎ ለ Admin ተልኳል!');
  });

  socket.on('requestWithdraw', (data) => {
    const user = usersDB[data.userId];
    if (user && user.balance >= data.amount) {
      user.balance -= data.amount;
      socket.emit('balanceUpdated', user.balance);
      bot.sendMessage(ADMIN_ID, 
        `📤 **የWithdraw ጥያቄ!**\n\n👤 ተጫዋች: ${user.name}\n🆔 ID: \`${user.id}\`\n💰 መጠን: ${data.amount} ETB\n🏦 አካውንት: ${data.accountDetails}`,
        { parse_mode: 'Markdown' }
      );
      socket.emit('infoMsg', 'የወጪ ጥያቄዎ ለ Admin ተልኳል።');
    } else {
      socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');
    }
  });
});

app.use(express.static(__dirname));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
