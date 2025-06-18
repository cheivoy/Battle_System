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
        const allowedIds = process.env.ALLOWED_MEMBER_IDS.split(',');
        if (!allowedIds.includes(profile.id)) {
            return done(null, false, { message: '未授權的用戶' });
        }
        let user = await User.findOne({ discordId: profile.id });
        if (!user) {
            user = new User({
                discordId: profile.id,
                username: profile.username,
                discriminator: profile.discriminator,
                gameId: '',
                job: '',
                isAdmin: profile.id === process.env.MASTER_ADMIN_ID
            });
        } else {
            user.username = profile.username;
            user.discriminator = profile.discriminator;
        }
        await user.save();
        return done(null, user);
    } catch (err) {
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