const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// የውሂብ ማከማቻዎች
const registeredUsers = {}; // { tgId: { id, name, balance, socketId } }
const bingoActiveCards = {}; // { tgId: { userName, numbers: [], bet: 20, hits: 0 } }
let bingoDrawnNumbers = []; // በቢንጎ የወጡ ቁጥሮች (ከ 1 እስከ 75)
let bingoTimer = 60; // የቢንጎ ቆጣሪ
let isBingoGameRunning = false;

// --- የቢንጎ ግሎባል ቆጣሪ እና ቁጥር ማውጫ (ለተመሳሳይ ሰዓት ለሁሉም Call ለማድረግ) ---
setInterval(() => {
  if (!isBingoGameRunning) return;

  bingoTimer--;
  io.emit('bingoTimerUpdate', bingoTimer);

  if (bingoTimer <= 0) {
    startNewBingoRound();
  }
}, 1000);

function startNewBingoRound() {
  bingoTimer = 60;
  bingoDrawnNumbers = [];
  
  // ቁጥሮችን በየሰኮንዱ ማውጣት (ከ 1 እስከ 75)
  let count = 0;
  const drawInterval = setInterval(() => {
    if (count >= 30 || bingoTimer > 40) {
      clearInterval(drawInterval);
      return;
    }

    let randNum;
    do {
      randNum = Math.floor(Math.random() * 75) + 1;
    } while (bingoDrawnNumbers.includes(randNum));

    bingoDrawnNumbers.push(randNum);

    // በቢንጎ ካርዶች ላይ የተመቱትን (Hits) ማረጋገጥ
    for (let tgId in bingoActiveCards) {
      let card = bingoActiveCards[tgId];
      card.hits = card.numbers.filter(n => bingoDrawnNumbers.includes(n)).length;
      
      // አሸናፊ ካለ ማረጋገጥ (ለምሳሌ 5 ወይም ሁሉም ቁጥር ሲመታ)
      if (card.hits >= 5) {
        io.emit('bingoWinnerFound', { winnerName: card.userName, winningNumbers: card.numbers });
      }
    }

    // ቁጥሩን ለሁሉም ተጠቃሚዎች በአንድ ጊዜ መጥራት (Call)
    io.emit('bingoNewDrawnNumber', {
      number: randNum,
      drawnList: bingoDrawnNumbers,
      allCards: bingoActiveCards
    });

    count++;
  }, 2000);
}

//  ጨዋታውን ማስጀመር
isBingoGameRunning = true;


io.on('connection', (socket) => {
  console.log('ተጫዋች ተገናኝቷል:', socket.id);

  // 1. ቴሌግራም ID በመጠቀም ተጠቃሚውን መመዝገብ
  socket.on('registerUser', (userData) => {
    if (!userData || !userData.id) return;
    const tgId = String(userData.id);

    if (!registeredUsers[tgId]) {
      registeredUsers[tgId] = {
        id: tgId,
        name: userData.first_name || "ተጫዋች",
        balance: 100.00, // የመጀመሪያ ቦነስ
        socketId: socket.id
      };
    } else {
      registeredUsers[tgId].socketId = socket.id;
    }

    // መረጃውን ለተጠቃሚው መመለስ
    socket.emit('userData', {
      user: registeredUsers[tgId],
      bingoDrawnNumbers: bingoDrawnNumbers,
      bingoActiveCards: bingoActiveCards,
      bingoTimer: bingoTimer
    });

    io.emit('updateLiveStats', { totalPlayersCount: Object.keys(registeredUsers).length });
  });

  // 2. ቢንጎ ላይ ተጠቃሚው ካርድ/ቁጥር ሲይዝ -> ለሁሉም ተጠቃሚዎች እንዲታይ ማድረግ
  socket.on('buyBingoCard', (data) => {
    // data = { userId: "...", numbers: [...], bet: 20 }
    const tgId = String(data.userId);
    const user = registeredUsers[tgId];

    if (!user) return socket.emit('errorMsg', 'እባክዎ መጀመሪያ ይመዝገቡ!');
    if (user.balance < data.bet) return socket.emit('errorMsg', 'ባላንስዎ በቂ አይደለም!');

    // ከባላንስ መቀነስ
    user.balance -= data.bet;
    socket.emit('balanceUpdated', user.balance);

    // የተጠቃሚውን ቢንጎ ካርድ መመዝገብ
    bingoActiveCards[tgId] = {
      userId: tgId,
      userName: user.name,
      numbers: data.numbers,
      bet: data.bet,
      hits: 0
    };

    // 🚀 የያዘውን ቁጥር እና ካርድ ለሁሉም ተጠቃሚዎች በቅጽበት ማሳየት (Broadcast)
    io.emit('updateAllBingoCards', {
      allCards: bingoActiveCards
    });
  });

  // 3. ኬኖ ጨዋታ (ቀድሞ የነበረው)
  socket.on('buyTicket', (data) => {
    const user = registeredUsers[String(data.userId)];
    if (!user || user.balance < data.bet) return socket.emit('errorMsg', 'ባላንስ በቂ አይደለም!');
    user.balance -= data.bet;
    socket.emit('balanceUpdated', user.balance);
    socket.emit('ticketBoughtSuccess');
  });

  socket.on('disconnect', () => {
    console.log('ተጫዋች ወጥቷል:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bingo & Keno Live Server በፖርት ${PORT} እየሰራ ነው...`);
});
