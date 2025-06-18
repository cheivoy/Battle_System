const express = require('express');
const passport = require('passport');
const router = express.Router();

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', passport.authenticate('discord', { failureRedirect: '/login.html?error=auth_failed' }), async (req, res) => {
    try {
        console.log('Callback received for user:', req.user?.discordId);
        if (!req.user) {
            console.error('No user in session after callback');
            return res.redirect('/login.html?error=no_user');
        }

        // 確保 session 保存
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/login.html?error=session_error');
            }
            console.log(`Session saved for user: ${req.user.discordId}`);
            res.redirect('/home.html');
        });
    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/login.html?error=callback_error');
    }
});

router.get('/logout', (req, res) => {
    console.log('User logging out:', req.user?.discordId);
    req.logout((err) => {
        if (err) console.error('Logout error:', err);
        req.session.destroy(() => {
            res.redirect('/login.html');
        });
    });
});

module.exports = router;
