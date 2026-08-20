const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const BOT_TOKEN = process.env.BOT_TOKEN || "8707515963:AAEyGvW6EBngaucnqJkxx1iTERTvZ9U2T8E";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "686733543"; 
const WEB_APP_URL = "https://tiny-dasik-98c906.netlify.app";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const usersDb = {}; 

let bingoRoom = {
    takenCards: [],
    playersCount: 0,
    activePlayers: {}
};

// ==========================================
// 1. TELEGRAM BOT LOGIC
// ==========================================

const sendMainMenu = (chatId, firstName) => {
    const welcomeText = `እንኳን ወደ ጨዋታችን በደህና መጡ ${firstName}! የሚፈልጉትን አማራጭ ይምረጡ።`;
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🎮 Play Game", web_app: { url: WEB_APP_URL } },
                    { text: "👤 Profile", callback_data: "profile" }
                ],
                [
                    { text: "💰 Check Balance", callback_data: "balance" },
                    { text: "💸 Deposit", callback_data: "deposit" }
                ],
                [
                    { text: "📤 Withdraw", callback_data: "withdraw" },
                    { text: "💬 Instruction", callback_data: "instruction" }
                ],
                [
                    { text: "🚨 Contact Support", url: "https://t.me/YOUR_ADMIN_USERNAME" }
                ]
            ]
        }
    };
    bot.sendMessage(chatId, welcomeText, options);
};

// /start እና /play ሲላኩ የሚሰጠው ምላሽ
bot.onText(/\/(start|play)/, (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const firstName = msg.from.first_name || "Player";

    if (!usersDb[userId]) {
        usersDb[userId] = { id: userId, first_name: firstName, balance: 0.00 };
    }

    sendMainMenu(chatId, firstName);
});

// Admin እና User አዝራሮች (Callback Queries)
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);
    const data = query.data;

    // --- ADMIN APPROVAL LOGIC ---
    if (data.startsWith("approve_")) {
        const [_, targetUserId, amount] = data.split("_");
        const depositAmount = parseFloat(amount);

        if (!usersDb[targetUserId]) {
            usersDb[targetUserId] = { id: targetUserId, first_name: "Player", balance: 0.00 };
        }

        // ባላንስ መደመር
        usersDb[targetUserId].balance += depositAmount;

        // ለ Admin ማረጋገጫ መላክ
        bot.editMessageText(query.message.text + `\n\n✅ **ተጸድቋል!** (${depositAmount} ETB ተጨምሯል)`, {
            chat_id: chatId,
            message_id: query.message.message_id
        });

        // ለተጠቃሚው ማሳወቅ
        bot.sendMessage(targetUserId, `✅ <b>የገቢ ጥያቄዎ ጸድቋል!</b>\n\n💰 የተጨመረ: ${depositAmount} ETB\n💳 አሁናዊ ባላንስ: ${usersDb[targetUserId].balance.toFixed(2)} ETB`, { parse_mode: "HTML" });

        // WebApp ላይ ባላንስ ማዘመን
        io.emit("balanceUpdated", { userId: targetUserId, balance: usersDb[targetUserId].balance });
        return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith("reject_")) {
        const [_, targetUserId] = data.split("_");
        bot.editMessageText(query.message.text + `\n\n❌ **ጥያቄው ተሰርዟል (Rejected)!**`, {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        bot.sendMessage(targetUserId, `❌ የገቢ ጥያቄዎ አልፀደቀም። እባክዎን አድሚንን ያነጋግሩ።`);
        return bot.answerCallbackQuery(query.id);
    }

    // --- USER BUTTON LOGIC ---
    if (!usersDb[userId]) {
        usersDb[userId] = { id: userId, first_name: query.from.first_name || "Player", balance: 0.00 };
    }

    const userBalance = usersDb[userId].balance.toFixed(2);

    if (data === "balance") {
        bot.sendMessage(chatId, `💰 **የሕሳብዎ መጠን (Balance):** ${userBalance} ETB`);
    } else if (data === "deposit") {
        bot.sendMessage(chatId, `📥 **ገንዘብ ማስገቢያ (Deposit):**\n\nበቴሌብር ወደ **0915503379 (Mulualem)** ብር ያስገቡ።\nከዚያም በ Web App ውስጥ ገብተው የላኩበትን መጠን እና SMS ያስገቡ።`);
    } else if (data === "withdraw") {
        bot.sendMessage(chatId, `📤 **ገንዘብ ማውጫ (Withdraw):**\n\nበ Web App ውስጥ በመግባት የወጪ ማድረጊያ ጥያቄ ማቅረብ ይችላሉ።\nአሁን ያለዎት ባላንስ: **${userBalance} ETB**`);
    } else if (data === "profile") {
        bot.sendMessage(chatId, `👤 **የመገለጫ መረጃ:**\n\nስም: ${query.from.first_name}\nID: \`${userId}\` \nባላንስ: ${userBalance} ETB`, { parse_mode: "Markdown" });
    } else if (data === "instruction") {
        bot.sendMessage(chatId, "💬 **የጨዋታው መመሪያ፦**\n1. Web App ውስጥ ገብተው Bingo ወይም Keno ይምረጡ\n2. የካርድ ቁጥር ይምረጡ (የመረጡት ካርድ ለሌሎች ቀይ ሆኖ ይዘጋል)\n3. ጨዋታው ሲጀምር Bingo/Keno በማድረግ ያሸንፉ!");
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 2. SOCKET.IO REAL-TIME LOGIC (WEB APP)
// ==========================================

io.on("connection", (socket) => {
    socket.on("registerUser", (userData) => {
        const userId = String(userData.id);
        socket.userId = userId;

        if (!usersDb[userId]) {
            usersDb[userId] = { 
                id: userId, 
                first_name: userData.first_name || "Player", 
                balance: 0.00 
            };
        }

        socket.emit("userData", { user: usersDb[userId] });

        socket.emit("roomState", {
            takenCards: bingoRoom.takenCards,
            playersCount: bingoRoom.playersCount
        });
    });

    socket.on("selectCard", (data) => {
        const { userId, cardId, bet } = data;
        const uId = String(userId);
        const user = usersDb[uId];

        if (!user) return socket.emit("infoMsg", "ተጠቃሚው አልተገኘም!");

        if (bingoRoom.takenCards.includes(String(cardId))) {
            return socket.emit("infoMsg", "ይህ ካርድ በሌላ ተጫዋች ተይዟል!");
        }

        if (user.balance < bet) {
            return socket.emit("infoMsg", "በቂ ባላንስ የለዎትም!");
        }

        user.balance -= bet;
        bingoRoom.takenCards.push(String(cardId));
        bingoRoom.activePlayers[uId] = cardId;
        bingoRoom.playersCount = Object.keys(bingoRoom.activePlayers).length;

        socket.emit("balanceUpdated", { balance: user.balance });

        io.emit("cardTaken", { cardId: cardId });
        io.emit("updatePlayers", bingoRoom.playersCount);
    });

    socket.on("verifyAndDeposit", (data) => {
        const { userId, amount, smsText } = data;
        const uId = String(userId);
        const user = usersDb[uId];

        const adminMsg = `📥 <b>አዲስ የገቢ (Deposit) ጥያቄ</b>\n\n👤 <b>ስም:</b> ${user?.first_name || 'Unkown'}\n🆔 <b>ID:</b> <code>${uId}</code>\n💰 <b>መጠን:</b> ${amount} ETB\n📱 <b>SMS መልእክት:</b>\n<code>${smsText}</code>`;

        const options = {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Approve (አጽድቅ)", callback_data: `approve_${uId}_${amount}` },
                        { text: "❌ Reject (ሰርዝ)", callback_data: `reject_${uId}` }
                    ]
                ]
            }
        };

        bot.sendMessage(ADMIN_CHAT_ID, adminMsg, options);
        socket.emit("infoMsg", "የገቢ ጥያቄዎ ለአድሚን ተልኳል። ሲረጋገጥ ባላንስዎ ይስተካከላል!");
    });

    socket.on("requestWithdraw", (data) => {
        const { userId, amount, accountDetails } = data;
        const uId = String(userId);
        const user = usersDb[uId];

        if (!user || user.balance < parseFloat(amount)) {
            return socket.emit("infoMsg", "በቂ ባላንስ የለዎትም!");
        }

        user.balance -= parseFloat(amount);
        socket.emit("balanceUpdated", { balance: user.balance });

        const adminMsg = `📤 <b>አዲስ የወጪ (Withdraw) ጥያቄ</b>\n\n👤 <b>ስም:</b> ${user.first_name}\n🆔 <b>ID:</b> <code>${uId}</code>\n💰 <b>መጠን:</b> ${amount} ETB\n💳 <b>አካውንት:</b> ${accountDetails}`;

        bot.sendMessage(ADMIN_CHAT_ID, adminMsg, { parse_mode: "HTML" });
        socket.emit("infoMsg", "የወጪ ጥያቄዎ ተልኳል፤ በቅርቡ ገቢ ይደረጋል!");
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server & Telegram Bot running on port ${PORT}`);
});
