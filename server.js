const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS setup
const io = new Server(server, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// ==========================================
// 1. መረጃዎች (BOT TOKEN & ADMIN ID)
// ==========================================
const BOT_TOKEN = '8901580259:AAEaj8ATX_5bHooffxAWtTVFDTsVqzIFB-8';
const ADMIN_ID = 686733543;

// Telegram Bot ማስነሳት
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Static Files & Routes Setup
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🟢 Bingo Route
app.get('/bingo', (req, res) => {
  const bingoFilePath = path.join(__dirname, 'public', 'bingo.html');
  res.sendFile(bingoFilePath, (err) => {
    if (err) {
      res.status(404).send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
          <h1 style="color:red;">bingo.html ፋይል አልተገኘም!</h1>
          <p>እባክዎን በ <strong>public</strong> ፎልደር ውስጥ <strong>bingo.html</strong> የሚባል ፋይል መኖሩን ያረጋግጡ።</p>
        </div>
      `);
    }
  });
});

// 🟢 Admin Route
app.get('/admin', (req, res) => {
  const adminFilePath = path.join(__dirname, 'public', 'admin.html');
  res.sendFile(adminFilePath, (err) => {
    if (err) {
      res.status(404).send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
          <h1 style="color:red;">admin.html ፋይል አልተገኘም!</h1>
          <p>እባክዎን በ <strong>public</strong> ፎልደር ውስጥ <strong>admin.html</strong> የሚባል ፋይል መኖሩን ያረጋግጡ።</p>
        </div>
      `);
    }
  });
});

// ==========================================
// 2. DATABASE & PAYTABLE
// ==========================================
global.usersDB = {}; 
const usersDB = global.usersDB;

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

// ==========================================
// 3. TELEGRAM BOT COMMANDS
// ==========================================

// 🔹 /start Command (Play Keno እና Play Bingo ጎን ለጎን)
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "ተጫዋች";

  bot.sendMessage(
    chatId, 
    `ሰላም ${firstName}! 👋\nለመጫወት የሚፈልጉትን ጨዋታ ይምረጡ፦\n\n🎮 Keno ለመጫወት "Play Keno" ይጫኑ\n🎯 Bingo ለመጫወት "Play Bingo" ይጫኑ\n\n📱 ቴሌብር አድራሻ: 0915503379`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎮 Play Keno",
              web_app: { url: "https://keno-server-2.onrender.com" }
            },
            {
              text: "🎯 Play Bingo",
              web_app: { url: "https://keno-server-2.onrender.com/bingo" }
            }
          ]
        ]
      }
    }
  );
});

// 🔹 /addbalance Command
bot.onText(/\/addbalance (\d+) (\d+(\.\d+)?)/, (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  if (Number(senderId) !== Number(ADMIN_ID)) {
    return bot.sendMessage(chatId, "🚫 ፈቃድ የለዎትም!");
  }

  const targetUserId = match[1];
  const amountToAdd = parseFloat(match[2]);

  if (usersDB[targetUserId]) {
    usersDB[targetUserId].balance += amountToAdd;

    bot.sendMessage(
      chatId, 
      `✅ **ስኬታማ ጭማሪ!**\n\n👤 ተጫዋች: ${usersDB[targetUserId].name}\n🆔 ID: ${targetUserId}\n💰 የተጨመረ: ${amountToAdd} ETB\n💳 አዲሱ ባላንስ: ${usersDB[targetUserId].balance.toFixed(2)} ETB`
    );

    io.to(targetUserId).emit('userDataUpdate', usersDB[targetUserId]);
    io.emit('adminUsersList', Object.values(usersDB));
  } else {
    bot.sendMessage(chatId, `❌ ተጫዋቹ አልተገኘም! ID: ${targetUserId}`);
  }
});

// 🔹 /admin Command
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  if (Number(senderId) === Number(ADMIN_ID)) {
    bot.sendMessage(
      chatId, 
      "⚙️ **ወደ አድሚን ዳሽቦርድ ለመግባት ከታች ያለውን ሊንክ ይጫኑ፦**\n\nhttps://keno-server-2.onrender.com/admin"
    );
  } else {
    bot.sendMessage(chatId, "🚫 ይህንን ትእዛዝ ለመጠቀም ፈቃድ የለዎትም።");
  }
});

// ==========================================
// 4. MULTIPLAYER GAME LOOP
// ==========================================
let activeTickets = [];
let drawnNumbers = [];
let isDrawing = false;
let timer = 30;

setInterval(() => {
  if (!isDrawing) {
    timer--;
    io.emit('timerUpdate', { timerVal: timer });

    if (timer <= 0) {
      startDrawProcess();
    }
  }
}, 1000);

function startDrawProcess() {
  isDrawing = true;
  drawnNumbers = [];
  io.emit('drawStarted');

  let count = 0;
  const drawInterval = setInterval(() => {
    let rand;
    do {
      rand = Math.floor(Math.random() * 80) + 1;
    } while (drawnNumbers.includes(rand));

    drawnNumbers.push(rand);
    count++;

    io.emit('newDrawnNumber', { number: rand, count: count });

    if (count >= 20) {
      clearInterval(drawInterval);
      processWinnings();

      setTimeout(() => {
        isDrawing = false;
        timer = 30;
        activeTickets = [];
        io.emit('gameReset');
      }, 5000);
    }
  }, 1000);
}

function processWinnings() {
  activeTickets.forEach(ticket => {
    const user = usersDB[ticket.userId];
    if (!user) return;

    let hitsCount = 0;
    ticket.numbers.forEach(num => {
      if (drawnNumbers.includes(num)) hitsCount++;
    });

    const spotSize = ticket.numbers.length;
    if (PAYTABLE[spotSize] && PAYTABLE[spotSize][hitsCount]) {
      const multiplier = PAYTABLE[spotSize][hitsCount];
      const winAmount = ticket.bet * multiplier;

      user.balance += winAmount;
      io.to(ticket.userId).emit('userDataUpdate', user);
      io.emit('adminUsersList', Object.values(usersDB));

      bot.sendMessage(
        ticket.userId,
        `🎊 **እንኳን ደስ አለዎት!**\n\nበእጣ ቁጥር ${hitsCount}/${spotSize} በማስመዝገብ ${winAmount.toFixed(2)} ETB አሸንፈዋል!`
      ).catch(e => {});
    }
  });
}

// ==========================================
// 5. SOCKET CONNECTIONS
// ==========================================
io.on('connection', (socket) => {

  socket.on('userInit', (userData) => {
    const userId = String(userData.id || socket.id);

    if (!usersDB[userId]) {
      usersDB[userId] = {
        id: userId,
        name: userData.first_name || "ተጫዋች",
        balance: 50.00
      };
    }

    socket.join(userId);
    socket.emit('userDataUpdate', usersDB[userId]);
    socket.emit('updateTickets', activeTickets);
    io.emit('adminUsersList', Object.values(usersDB));
  });

  socket.on('getAdminUsers', (adminId) => {
    if (Number(adminId) === Number(ADMIN_ID)) {
      socket.emit('adminUsersList', Object.values(usersDB));
    }
  });

  socket.on('adminAddBalance', ({ adminId, targetUserId, amount }) => {
    if (Number(adminId) === Number(ADMIN_ID)) {
      const addAmount = parseFloat(amount);
      if (usersDB[targetUserId] && !isNaN(addAmount)) {
        usersDB[targetUserId].balance += addAmount;
        io.to(targetUserId).emit('userDataUpdate', usersDB[targetUserId]);
        io.emit('adminUsersList', Object.values(usersDB));
      }
    }
  });

  socket.on('buyTicket', (ticketData) => {
    const userId = String(ticketData.userId);
    const user = usersDB[userId];

    if (isDrawing) return;

    if (user && user.balance >= ticketData.bet) {
      user.balance -= ticketData.bet;
      activeTickets.push(ticketData);

      socket.emit('userDataUpdate', user);
      io.emit('updateTickets', activeTickets);
      io.emit('adminUsersList', Object.values(usersDB));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
