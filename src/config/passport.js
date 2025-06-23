const DiscordStrategy = require('passport-discord').Strategy;
const passport = require('passport');
const User = require('../models/user');
const Whitelist = require('../models/whitelist');

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ discordId: profile.id });
        
        // 檢查是否為 Master Admin
        const isMasterAdmin = profile.id === process.env.MASTER_ADMIN_ID;
        
        if (!user) {
            // 新用戶 - 檢查白名單或 Master Admin
            if (isMasterAdmin) {
                console.log(`✅ Master Admin login: ${profile.username}`);
                user = new User({
                    discordId: profile.id,
                    username: profile.username,
                    discriminator: profile.discriminator,
                    gameId: 'ADMIN',  // 給 Admin 一個特殊的 gameId
                    job: 'Administrator',
                    isAdmin: true
                });
            } else {
                // 檢查白名單
                console.log(`🔍 Checking whitelist for new user: ${profile.username}`);
                // 這裡我們暫時允許所有用戶註冊，但 gameId 和 job 保持空白
                // 用戶需要填寫 gameId，然後系統檢查該 gameId 是否在白名單中
                user = new User({
                    discordId: profile.id,
                    username: profile.username,
                    discriminator: profile.discriminator,
                    gameId: '',
                    job: '',
                    isAdmin: false
                });
            }
        } else {
            // 現有用戶 - 更新基本資料
            user.username = profile.username;
            user.discriminator = profile.discriminator;
            
            // 如果是 Master Admin 但還沒設定管理員權限
            if (isMasterAdmin && !user.isAdmin) {
                user.isAdmin = true;
                user.gameId = user.gameId || 'ADMIN';
                user.job = user.job || 'Administrator';
                console.log(`✅ Updated Master Admin privileges for: ${profile.username}`);
            }
        }
        
        await user.save();
        console.log(`✅ User saved: ${user.username}, GameId: ${user.gameId}, Job: ${user.job}`);
        return done(null, user);
    } catch (err) {
        console.error('❌ Passport strategy error:', err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;