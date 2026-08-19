// /start ትዕዛዝ ሲላክ
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeText = "Welcome to your bot! Choose an option below.";

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎮 Play", web_app: { url: "https://tiny-dasik-98c906.netlify.app" } },
          { text: "👤 Register", callback_data: "register" }
        ],
        [
          { text: "💰 Check Balance", callback_data: "balance" },
          { text: "💸 Deposit", callback_data: "deposit" }
        ],
        [
          { text: "🚨 Contact support", url: "https://t.me/YOUR_ADMIN_USERNAME" },
          { text: "💬 Instruction", callback_data: "instruction" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeText, options);
});

// የአዝራሮቹ ምላሽ (Callback Queries)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'balance') {
    bot.sendMessage(chatId, "💰 የሒሳብዎ መጠን: 0.00 ETB");
  } else if (data === 'deposit') {
    bot.sendMessage(chatId, "📥 ገንዘብ ለማስገባት የሚከተለውን የቴሌብር ቁጥር ይጠቀሙ...");
  } else if (data === 'register') {
    bot.sendMessage(chatId, "👤 ለመመዝገብ እባክዎን ስልክ ቁጥርዎን ያጋሩ።");
  } else if (data === 'instruction') {
    bot.sendMessage(chatId, "💬 **የጨዋታው መመሪያ፦**\n1. ቁጥሮች ይምረጡ\n2. መደብ ያስይዙ...");
  }

  // የአዝራሩን መጫን ማረጋገጫ (Loading እንዲቆም)
  bot.answerCallbackQuery(query.id);
});