const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
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
app.use(express.static(path.join(__dirname, 'public')));

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
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/home.html', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// 404 處理
app.get('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// MongoDB 連線
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
