const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

// 載入模型與 Passport 設定
require('./models/user');
require('./models/battle');
require('./models/registration');
require('./models/leaveRequest');
require('./models/attendanceRecord');
require('./models/changeLog');
require('./config/passport');

const app = express();

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60
    }),
    cookie: {
        secure: false, // 暫時設為 false 來測試
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax' // 改為 lax
    },
    name: 'connect.sid' // 明確指定 cookie 名稱
}));
// 添加在 app.use(passport.session()); 之後
app.use((req, res, next) => {
    if (req.path === '/' || req.path.includes('.html')) {
        console.log('=== SESSION DEBUG ===');
        console.log('Path:', req.path);
        console.log('Session ID:', req.sessionID);
        console.log('Session passport:', req.session?.passport);
        console.log('req.user:', req.user ? {
            username: req.user.username,
            discordId: req.user.discordId,
            gameId: req.user.gameId
        } : 'null');
        console.log('isAuthenticated:', req.isAuthenticated?.());
        console.log('====================');
    }
    next();
});
app.use(passport.initialize());
app.use(passport.session());

// 路由
app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));


// 登入驗證中介
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        console.log(`✅ Authenticated user: ${req.user.discordId}`);
        return next();
    }
    console.log('❌ Unauthenticated access attempt');
    res.redirect('/login.html?error=unauthenticated');
};



// ✅ 首頁根據登入狀態導向
// 修改後
// ✅ 首頁根據登入狀態導向
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        // 檢查用戶是否完成初始設定
        if (req.user.gameId && req.user.job) {
            console.log('✅ User configured, redirecting to home.html');
            res.redirect('/home.html');
        } else {
            console.log('✅ User logged in but not configured, redirecting to index.html');
            res.redirect('/index.html');
        }
    } else {
        console.log('❌ User not logged in, redirecting to login.html');
        res.redirect('/login.html');
    }
});

// ✅ 保護頁面（例如 home）
app.get('/home.html', ensureAuthenticated, (req, res) => {
    const filePath = path.join(publicPath, 'home.html');
    console.log(`Serving home.html at ${filePath}`);
    res.sendFile(filePath, err => {
        if (err) {
            console.error('Error serving home.html:', err.message);
            res.status(404).send('Page not found');
        }
    });
});

// 靜態檔案目錄
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// 顯示 public 目錄內容（debug）
try {
    const publicFiles = fs.readdirSync(publicPath);
    console.log('Public directory contents:', publicFiles);
} catch (err) {
    console.error('Error reading public directory:', err.message);
}


// ✅ 404 fallback route
app.get('*', (req, res) => {
    const filePath = path.join(publicPath, '404.html');
    console.log(`Serving 404.html at ${filePath}`);
    res.status(404).sendFile(filePath, err => {
        if (err) {
            console.error('Error serving 404.html:', err.message);
            res.status(404).send('Page not found');
        }
    });
});

// ✅ MongoDB 連線
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
