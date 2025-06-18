const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();
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
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

// 靜態檔案
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// 診斷 public 目錄內容
try {
    const publicFiles = fs.readdirSync(publicPath);
    console.log('Public directory contents:', publicFiles);
} catch (err) {
    console.error('Error reading public directory:', err.message);
}

// 保護路由
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        console.log(`Authenticated user: ${req.user.discordId}`);
        return next();
    }
    console.log('Unauthenticated access attempt');
    res.redirect('/login.html?error=unauthenticated');
};

// 路由
app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));

// 頁面路由
app.get(['/', '/index.html'], (req, res) => {
    const fileName = req.isAuthenticated() ? 'index.html' : 'login.html';
    const filePath = path.join(publicPath, fileName);
    console.log(`Serving ${fileName} at ${filePath}`);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error serving ${fileName}:`, err.message);
            res.status(404).send('Page not found');
        }
    });
});

app.get('/home.html', ensureAuthenticated, (req, res) => {
    const filePath = path.join(publicPath, 'home.html');
    console.log(`Serving home.html at ${filePath}`);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error serving home.html:', err.message);
            res.status(404).send('Page not found');
        }
    });
});

// 404 處理
app.get('*', (req, res) => {
    const filePath = path.join(publicPath, '404.html');
    console.log(`Serving 404.html at ${filePath}`);
    res.status(404).sendFile(filePath, (err) => {
        if (err) {
            console.error('Error serving 404.html:', err.message);
            res.status(404).send('Page not found');
        }
    });
});

// MongoDB 連線
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});