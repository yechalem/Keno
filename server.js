// --- የቢንጎ ጨዋታ ተለዋዋጮች (Bingo Live States) ---
let activeBingoCards = []; // የሁሉም ተጫዋቾች የቢንጎ ካርዶች
let bingoDrawnNumbers = []; // የቢንጎ የወጡ ቁጥሮች
let bingoTimer = 30; // የቢንጎ ቁጥር የሚወጣበት ሰዓት ቆጣሪ

// የቢንጎ ሰዓት ቆጣሪ እና የቁጥር ማውጫ ኡደት (Bingo Game Loop)
setInterval(() => {
    bingoTimer--;
    if (bingoTimer <= 0) {
        bingoTimer = 30;
        bingoDrawnNumbers = []; 
        activeBingoCards = []; 
        io.emit('bingoGameReset');
    } else {
        if (bingoDrawnNumbers.length < 75) {
            let randBingoNum;
            do {
                randBingoNum = Math.floor(Math.random() * 75) + 1;
            } while (bingoDrawnNumbers.includes(randBingoNum));

            bingoDrawnNumbers.push(randBingoNum);
            io.emit('newBingoCall', {
                currentCall: randBingoNum,
                drawnList: bingoDrawnNumbers
            });
        }
    }
    io.emit('bingoTimerUpdate', bingoTimer);
}, 1000);

// --- በ Socket.io ግንኙነት ውስጥ የሚጨመሩ የቢንጎ ኢቨንቶች ---
io.on('connection', (socket) => {
    // (የኬኖ ኮዶችዎ እዚህ ጋር እንዳሉ ይቀጥላሉ...)

    // ዩዘር ሲገባ የቢንጎ መረጃዎችን እንዲረከብ
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
            // ለተጫዋቹ የቢንጎ አሁን ያሉ መረጃዎችንም ማስተላለፍ
            socket.emit('userData', {
                user: { name: user.name, balance: user.balance },
                bingoCards: activeBingoCards,
                bingoDrawnList: bingoDrawnNumbers
            });
        } catch (err) {
            console.error('Register error:', err);
        }
    });

    // 1. የቢንጎ ካርድ ግዢ፣ የጋራ ባላንስ (Shared Wallet) እና የቁጥር መደራረብ ማረጋገጫ (Validation)
    socket.on('bingo_buy_card', async (data) => {
        try {
            let user = await User.findOne({ telegramId: data.userId });
            if (!user || user.balance < data.bet) {
                return socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');
            }

            // ተጫዋቹ የመረጠው ቁጥር ከዚህ በፊት በሌላ ተጫዋች የተያዘ መሆኑን ማረጋገጥ
            let allTakenNumbers = activeBingoCards.flatMap(c => c.numbers);
            let isAlreadyTaken = data.numbers.some(num => allTakenNumbers.includes(num));

            if (isAlreadyTaken) {
                return socket.emit('errorMsg', 'አንዳንድ መርጠዋቸው የነበሩ ቁጥሮች በሌላ ተጫዋች ተይዘዋል! እባክዎ እንደገና ይምረጡ።');
            }

            // የጋራ ባላንስ መቀነስ (Shared Wallet ከ MongoDB ጋር የተገናኘ)
            user.balance -= data.bet;
            user.history.unshift({ type: 'BINGO_BET', amount: -data.bet, date: new Date() });
            await user.save();

            let newCard = {
                userId: data.userId,
                userName: user.name,
                numbers: data.numbers,
                bet: data.bet
            };

            activeBingoCards.push(newCard);

            socket.emit('balanceUpdated', user.balance);
            socket.emit('bingoCardSuccess');
            io.emit('updateAllBingoCards', activeBingoCards); // የሁሉንም ተጫዋቾች ቦርድ ለሁሉም ማሳየት
        } catch (err) {
            console.error('Bingo buy error:', err);
        }
    });

    // 2. ቢንጎ አሸናፊ ሲሆን የጋራ ባላንሱን መጨመር
    socket.on('bingo_winner', async (data) => {
        try {
            let user = await User.findOne({ telegramId: data.userId });
            if (user) {
                user.balance += data.winAmount;
                user.history.unshift({ type: 'BINGO_WIN', amount: data.winAmount, date: new Date() });
                await user.save();

                socket.emit('balanceUpdated', user.balance);
                io.emit('infoMsg', `🎉 ተጫዋች ${user.name} የቢንጎ ጨዋታውን አሸንፏል! (+${data.winAmount} ETB)`);
            }
        } catch (err) {
            console.error('Bingo win error:', err);
        }
    });
});
