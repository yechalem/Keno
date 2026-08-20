const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// --- 1. የቴሌግራም ቦት ማዋቀር ---
const token = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const webAppUrl = process.env.WEB_APP_URL || 'https://tiny-dasik-98c906.netlify.app'; // የ Netlify ሊንክዎ
const bot = new TelegramBot(token, { polling: true });

// --- 2. የዳታቤስ (MongoDB) ስኪማ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    name: String,
    balance: { type: Number, default: 500.00 }, // ነባሪ 500 ብር ቦነስ
    history: [{ type: Object }]
});
const User = mongoose.model('User', UserSchema);

// --- 3. የኬኖ ጨዋታ ተለዋዋጮች ---
let currentDrawnList = [];
let activeTickets = [];
let totalPlayersCount = 4325;
let timer = 60;

// የሰዓት ቆጣሪ እና የጨዋታ ዙር (Timer & Game Loop)
setInterval(() => {
    timer--;
    if (timer <= 0) {
        timer = 60;
        currentDrawnList = [];
        activeTickets = [];
        io.emit('gameReset');
    } else {
        // በየሰከንዱ አዳዲስ ቁጥሮች ማውጣት (ጨዋታው ሲጀመር)
        if (timer <= 50 && currentDrawnList.length < 20) {
            let randNum;
            do {
                randNum = Math.floor(Math.random() * 80) + 1;
            } while (currentDrawnList.includes(randNum));

            currentDrawnList.push(randNum);

            // የቲኬቶችን ውጤት ማላት
            activeTickets.forEach(ticket => {
                let hits = ticket.numbers.filter(n => currentDrawnList.includes(n)).length;
                ticket.hitsCount = hits;
            });

            io.emit('newDrawnNumber', { number: randNum, drawnList: currentDrawnList });
            io.emit('updateLiveStats', { tickets: activeTickets, totalPlayersCount });
        }
    }
    io.emit('timerUpdate', timer);
}, 1000);

// --- 4. የሶኬት ግንኙነት (Socket.io) ---
io.on('connection', (socket) => {
    console.log('User connected to socket:', socket.id);

    // ዩዘር ሲገባ መረጃውን ማዘጋጀት
    socket.on('registerUser', async (userData) => {
        try {
            let user = await User.findOne({ telegramId: userData.id });
            if (!user) {
                user = await User.create({
                    telegramId: userData.id,
                    name: userData.first_name,
                    balance: 500.00,
                    history: []
                });
            }
            totalPlayersCount++;
            socket.emit('userData', {
                user: { name: user.name, balance: user.balance },
                drawnNumbers: currentDrawnList,
                activeTickets: activeTickets,
                totalPlayersCount: totalPlayersCount
            });
        } catch (err) {
            console.error('Register error:', err);
        }
    });

    // ቲኬት መግዛት (Buy Ticket)
    socket.on('buyTicket', async (data) => {
        try {
            let user = await User.findOne({ telegramId: data.userId });
            if (!user || user.balance < data.bet) {
                return socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');
            }

            user.balance -= data.bet;
            await user.save();

            let newTicket = {
                userId: data.userId,
                userName: user.name,
                numbers: data.numbers,
                bet: data.bet,
                maxWin: data.maxWin,
                hitsCount: 0
            };

            activeTickets.push(newTicket);
            socket.emit('balanceUpdated', user.balance);
            socket.emit('ticketBoughtSuccess');
            io.emit('updateActiveTickets', activeTickets);
        } catch (err) {
            console.error('Buy ticket error:', err);
        }
    });

    // ቴሌብር SMS ዲፖዚት ማረጋገጥ
    socket.on('verifyAndDeposit', async (data) => {
        try {
            let user = await User.findOne({ telegramId: data.userId });
            if (user) {
                user.balance += data.amount;
                user.history.unshift({ type: 'DEPOSIT', amount: data.amount, date: new Date() });
                await user.save();
                socket.emit('balanceUpdated', user.balance);
                socket.emit('infoMsg', `🎉 የ ${data.amount} ETB ዲፖዚትዎ ተረጋግጧል!`);
            }
        } catch (err) {
            console.error('Deposit error:', err);
        }
    });

    // የብር ወጪ (Withdraw) ጥያቄ
    socket.on('requestWithdraw', async (data) => {
        try {
            let user = await User.findOne({ telegramId: data.userId });
            if (!user || user.balance < data.amount) {
                return socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');
            }
            user.balance -= data.amount;
            await user.save();
            socket.emit('balanceUpdated', user.balance);
            socket.emit('infoMsg', 'የወጪ ጥያቄዎ በትክክል ተልኳል፤ በቅርብ ጊዜ ይለቀቅልዎታል።');
        } catch (err) {
            console.error('Withdraw error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// --- 5. የቴሌግራም ቦት ትዕዛዞች (Telegram Bot Handlers) ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = "እንኳን ወደ ኬኖ ጨዋታ በደህና መጡ! ከታች ያሉትን አማራጮች በመጠቀም መጫወት ይችላሉ።";

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🎮 Play Keno", web_app: { url: webAppUrl } },
                    { text: "👤  አካውንት (Register)", callback_data: "register" }
                ],
                [
                    { text: "💰 ባላንስ ማረጋገጫ (Balance)", callback_data: "balance" },
                    { text: "💸 ገንዘብ ማስገባት (Deposit)", callback_data: "deposit" }
                ],
                [
                    { text: "💬 የጨዋታ መመሪያ", callback_data: "instruction" }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, welcomeText, options);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const telegramId = query.from.id.toString();
    const data = query.data;

    try {
        if (data === 'balance') {
            let user = await User.findOne({ telegramId });
            let bal = user ? user.balance : 500.00;
            bot.sendMessage(chatId, `💰 የሒሳብዎ መጠን: ${bal.toFixed(2)} ETB`);
        } else if (data === 'deposit') {
            bot.sendMessage(chatId, "📥 ገንዘብ ለማስገባት የሚከተለውን የቴሌብር ቁጥር ይጠቀሙ:\n\n**0915503379 (Mulualem Shewel)**\n\nከክፍያ በኋላ አጭር የጽሁፍ መልእክት (SMS) ጨዋታው ውስጥ ገብተው በ Deposit በኩል ይለጥፉ።");
        } else if (data === 'register') {
            let user = await User.findOne({ telegramId });
            if (!user) {
                await User.create({ telegramId, name: query.from.first_name, balance: 500.00 });
                bot.sendMessage(chatId, "👤 በအောင်ኬታ ተመዝግበዋል! 500.00 ETB ቦነስ ተሰጥቶዎታል።");
            } else {
                bot.sendMessage(chatId, "👤 እርስዎ ቀደም ብለው ተመዝግበዋል!");
            }
        } else if (data === 'instruction') {
            bot.sendMessage(chatId, "💬 **የጨዋታው መመሪያ፦**\n1. Play Keno የሚለውን በመጫን ጨዋታውን ይክፈቱ።\n2. ከ 1 እስከ 80 ካሉት ቁጥሮች እስከ 10 ቁጥሮች ይምረጡ።\n3. የመደብ ብር (Bet) በማስተካከል Buy ይበሉና ዕድልዎን ይሞክሩ!");
        }
    } catch (err) {
        console.error("Bot callback error:", err);
    }

    bot.answerCallbackQuery(query.id);
});

// --- ሰርቨሩን ማስጀመር ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/keno_db';

mongoose.connect(MONGO_URI)
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Server & Telegram Bot running on port ${PORT}`);
        });
    })
    .catch(err => console.log('Database connection error:', err));
