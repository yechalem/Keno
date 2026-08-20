const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const BOT_TOKEN = process.env.BOT_TOKEN || '8707515963:AAEyGvW6EBngaucnqJkxx1iTERTvZ9U2T8E';
const ADMIN_ID = process.env.ADMIN_ID || '686733543';
const TELEBIRR_NO = "0915503379";

// 📌 ዌብ አፕ ሊንኮች
const WEB_APP_URL = "https://stunning-croquembouche-c49862.netlify.app"; // Keno URL
const BINGO_WEB_APP_URL = "https://stunning-croquembouche-c49862.netlify.app/bingo"; // Bingo URL (ወይም የራሱ የተለየ Netlify URL ካለህ እዚህ ይተካል)

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

const MALE_NAMES = [
  "Abebe", "Dawit", "Daniel", "Kirubel", "Yonas", "Solomon", "Alex", "Sami", "Michael", "Robel",
  "Nati", "Aman", "Ermias", "Henok", "Yosef", "Kibrom", "Binyam", "Abel", "Tewodros", "Kaleb",
  "አበበ", "ዳዊት", "ሰለሞን", "ኪሩቤል", "ዮናስ", "በሬሳ", "ዮሴፍ", "አማኑኤል", "ኤርሚያስ", "ሄኖክ", "ካሌብ", "ናታን"
];

const FEMALE_NAMES = [
  "Martha", "Helen", "Tiji", "Eden", "Betelhem", "Feven", "Maki", "Ruth",
  "ማርታ", "ሄለን", "ቲጂ", "ቃልኪዳን", "እምነት"
];

function getRandomName() {
  const isMale = Math.random() < 0.9;
  const list = isMale ? MALE_NAMES : FEMALE_NAMES;
  return list[Math.floor(Math.random() * list.length)];
}

const BET_OPTIONS = [5, 10, 20, 50, 100, 200, 500, 1000];

bot.setMyCommands([
  { command: 'play', description: '🎮 Play Games' },
  { command: 'start', description: '🔄 Restart Bot' },
  { command: 'balance', description: '💰 Check Balance' }
]);

// 🔹 ዌልካም ሜሴጅ (Play Keno እና Play Bingo ጎን ለጎን ማሳያ)
const sendWelcomeMessage = (chatId, userName) => {
  const text = `እንኳን ደህና መጡ ${userName}! 👋\n\nለመጫወት የሚፈልጉትን ጨዋታ ከታች ይምረጡ፦\n📱 ቴሌብር አድራሻ: ${TELEBIRR_NO}`;
  bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎮 Play Keno", web_app: { url: WEB_APP_URL } },
          { text: "🎯 Play Bingo", web_app: { url: BINGO_WEB_APP_URL } }
        ]
      ]
    }
  });
};

bot.onText(/\/start/, (msg) => {
  const userId = String(msg.from.id);
  const userName = msg.from.first_name || "ተጫዋች";
  if (!usersDB[userId]) {
    usersDB[userId] = { id: userId, name: userName, balance: 50.00, history: [] };
  }
  sendWelcomeMessage(msg.chat.id, userName);
});

bot.onText(/\/play/, (msg) => {
  const userName = msg.from.first_name || "ተጫዋች";
  sendWelcomeMessage(msg.chat.id, userName);
});

bot.onText(/\/balance/, (msg) => {
  const userId = String(msg.from.id);
  const bal = usersDB[userId] ? usersDB[userId].balance : 0.00;
  bot.sendMessage(msg.chat.id, `💰 የለዎትም ባላንስ፦ ${bal.toFixed(2)} ETB`);
});

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

  io.to(targetUserId).emit('balanceUpdated', newBalance);
  bot.sendMessage(ADMIN_ID, `✅ Deposit ጸድቋል!\n\n🆔 User ID: ${targetUserId}\n💵 የተደመረ: ${amount} ETB\n💰 አዲሱ ባላንስ: ${newBalance.toFixed(2)} ETB`);
  bot.sendMessage(targetUserId, `🎉 የ ${amount} ETB Deposit ጥያቄዎ ጸድቋል!\n\n💰 የአሁኑ ባላንስዎ፦ ${newBalance.toFixed(2)} ETB`);
});

setInterval(() => {
  if (!isDrawing) {
    gameTimer--;
    currentFakePlayerCount += Math.floor(Math.random() * 25) + 10;
    addNewFakeTicket();

    io.emit('updateLiveStats', {
      tickets: activeTickets,
      totalPlayersCount: currentFakePlayerCount,
      timer: gameTimer
    });

    if (gameTimer <= 0) startKenoDraw();
  }
}, 1000);

function addNewFakeTicket() {
  const randomName = getRandomName();
  const spotCount = Math.floor(Math.random() * 6) + 2; 
  const numbers = [];

  while (numbers.length < spotCount) {
    const randNum = Math.floor(Math.random() * 80) + 1;
    if (!numbers.includes(randNum)) numbers.push(randNum);
  }

  const bet = BET_OPTIONS[Math.floor(Math.random() * BET_OPTIONS.length)];
  const maxWin = bet * (PAYTABLE[spotCount] && PAYTABLE[spotCount][spotCount] ? PAYTABLE[spotCount][spotCount] : 2);

  const fakeTicket = {
    id: "bot_" + Date.now() + "_" + Math.random(),
    userId: "bot_" + Math.floor(Math.random() * 10000),
    userName: randomName,
    numbers: numbers,
    bet: bet,
    maxWin: maxWin,
    isBot: true,
    socketId: null
  };

  activeTickets.push(fakeTicket);

  if (activeTickets.length > 30) {
    const realUsers = activeTickets.filter(t => !t.isBot);
    const botsOnly = activeTickets.filter(t => t.isBot);
    activeTickets = [...realUsers, ...botsOnly.slice(-25)];
  }

  sortActiveTickets();
}

function sortActiveTickets(currentUserId = null) {
  activeTickets.sort((a, b) => {
    if (currentUserId) {
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
    }
    if (!a.isBot && b.isBot) return -1;
    if (a.isBot && !b.isBot) return 1;
    return b.bet - a.bet;
  });
}

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

      setTimeout(() => {
        isDrawing = false;
        gameTimer = 60;
        drawnNumbers = [];
        activeTickets = [];
        currentFakePlayerCount = Math.floor(Math.random() * 1000) + 3200; 
        io.emit('gameReset');
      }, 4000);
    }
  }, 1200);
}

function calculateWinnings() {
  activeTickets.forEach(ticket => {
    if (ticket.isBot || !ticket.socketId) return;

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
    if (!tgUser || !tgUser.id) return;
    const userId = String(tgUser.id);

    if (!usersDB[userId]) {
      usersDB[userId] = { id: userId, name: tgUser.first_name || "ተጫዋች", balance: 100.00, history: [] };
    }
    
    socket.userId = userId;
    socket.join(userId);

    sortActiveTickets(userId);

    socket.emit('userData', {
      user: usersDB[userId],
      activeTickets: activeTickets,
      timer: gameTimer,
      isDrawing: isDrawing,
      drawnNumbers: drawnNumbers,
      totalPlayersCount: currentFakePlayerCount
    });
  });

  socket.on('buyTicket', (data) => {
    const userId = String(data.userId);
    const user = usersDB[userId];
    if (!user) return;

    if (isDrawing || gameTimer <= 1) {
      return socket.emit('errorMsg', 'ጨዋታው ሊጀምር ስለሆነ ትኬት መቁረጥ ተዘግቷል!');
    }
    if (user.balance < data.bet) return socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');

    user.balance -= data.bet;

    const newTicket = {
      id: Date.now(),
      userId: user.id,
      userName: user.name,
      numbers: data.numbers,
      bet: data.bet,
      maxWin: data.maxWin,
      isBot: false,
      socketId: socket.id
    };

    activeTickets.push(newTicket);
    sortActiveTickets(user.id);

    io.emit('updateLiveStats', {
      tickets: activeTickets,
      totalPlayersCount: currentFakePlayerCount + 1,
      timer: gameTimer
    });

    socket.emit('balanceUpdated', user.balance);
    socket.emit('ticketBoughtSuccess');
  });

  socket.on('verifyAndDeposit', (data) => {
    const userId = String(data.userId);
    const amount = parseFloat(data.amount);
    const smsText = data.smsText;
    const user = usersDB[userId];

    if (!user) {
      return socket.emit('errorMsg', 'ተጠቃሚው አልተገኘም!');
    }

    if (smsText.includes(TELEBIRR_NO) && smsText.includes(amount.toString())) {
      user.balance += amount;
      
      socket.emit('balanceUpdated', user.balance);
      socket.emit('infoMsg', `🎉 የ ${amount} ETB ዴፖዚትዎ በተሳካ ሁኔታ ተደምሯል!`);

      const adminMsg = `✅ አዲስ በቴሌብር የተረጋገጠ ዴፖዚት!\n\n👤 ተጫዋች: ${user.name}\n🆔 ID: ${userId}\n💰 መጠን: ${amount} ETB\n\n📝 SMS:\n${smsText}`;
      bot.sendMessage(ADMIN_ID, adminMsg);
    } else {
      const adminMsg = `⚠️ ያልተረጋገጠ የቴሌብር SMS ማረጋገጫ ሙከራ!\n\n👤 ተጫዋች: ${user.name}\n🆔 ID: ${userId}\n💰 መጠን: ${amount} ETB\n\n📝 SMS:\n${smsText}\n\nለማጽደቅ ይጠቀሙ፦\n/deposit_${userId}_${amount}`;
      bot.sendMessage(ADMIN_ID, adminMsg);
      
      socket.emit('infoMsg', 'የላኩት SMS በራስ ሰር ሊረጋገጥ አልቻለም፤ ለAdmin ተልኳል ተረጋግጦ ይጨመራል!');
    }
  });

  socket.on('requestWithdraw', (data) => {
    const userId = String(data.userId);
    const user = usersDB[userId];
    if (user && user.balance >= data.amount) {
      user.balance -= data.amount;
      socket.emit('balanceUpdated', user.balance);
      
      const msgText = `📤 የWithdraw ጥያቄ!\n\n👤 ተጫዋች: ${user ? user.name : 'Unknown'}\n🆔 ID: ${user ? user.id : userId}\n💰 መጠን: ${data.amount} ETB\n🏦 አካውንት: ${data.accountDetails}`;
      bot.sendMessage(ADMIN_ID, msgText);
      socket.emit('infoMsg', 'የወጪ ጥያቄዎ ለ Admin ተልኳል።');
    } else {
      socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');
    }
  });
});

app.use(express.static(__dirname));
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
