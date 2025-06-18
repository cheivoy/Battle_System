const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/user');
require('dotenv').config();

passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ discordId: profile.id });
        if (!user) {
            user = new User({
                discordId: profile.id,
                isAdmin: profile.id === process.env.MASTER_ADMIN_ID
            });
            await user.save();
        }
        done(null, user);
    } catch (err) {
        done(err);
    }
}));