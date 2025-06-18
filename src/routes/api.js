const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Battle = require('../models/battle');
const Registration = require('../models/registration');
const LeaveRequest = require('../models/leaveRequest');
const AttendanceRecord = require('../models/attendanceRecord');
const ChangeLog = require('../models/changeLog');
const moment = require('moment');

// 確保管理員
const ensureAdmin = (req, res, next) => {
    if (req.user.isAdmin) {
        return next();
    }
    res.status(403).json({ success: false, message: '無管理員權限' });
};

// 用戶狀態
router.get('/user/status', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.json({ success: false, message: '未登入' });
    }
    res.json({
        success: true,
        user: {
            discordId: req.user.discordId,
            gameId: req.user.gameId,
            job: req.user.job,
            isAdmin: req.user.isAdmin,
            onLeave: req.user.onLeave
        }
    });
});

// 用戶設定
router.post('/user/setup', async (req, res) => {
    try {
        const { gameId, job } = req.body;
        if (!gameId || !job || !/^[\u4e00-\u9fa5]{1,7}$/.test(gameId)) {
            return res.status(400).json({ success: false, message: '遊戲 ID 需為 1-7 個中文字符，且職業必填' });
        }
        const user = await User.findOne({ discordId: req.user.discordId });
        user.gameId = gameId;
        user.job = job;
        await user.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'setup',
            message: `用戶 ${gameId} 設定遊戲 ID 和職業 ${job}`
        }).save();
        res.json({ success: true, message: '設定完成' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 創建新幫戰
router.post('/battle/create', ensureAdmin, async (req, res) => {
    try {
        const { battleDate, deadline } = req.body;
        const existingBattle = await Battle.findOne({ status: { $ne: 'confirmed' } });
        if (existingBattle) {
            return res.status(400).json({ success: false, message: '請先確認最終出戰表', action: 'confirm' });
        }
        const battle = new Battle({
            battleDate: new Date(battleDate),
            deadline: new Date(deadline),
            status: 'pending',
            formation: { groupA: [], groupB: [] }
        });
        await battle.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'battle_create',
            message: `管理員創建幫戰，日期：${battleDate}`
        }).save();
        res.json({ success: true, message: '幫戰創建成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取當前幫戰
router.get('/battle/current', async (req, res) => {
    try {
        const battle = await Battle.findOne({ status: { $ne: 'confirmed' } }).populate('registrations.userId');
        if (!battle) {
            return res.json({ success: false, message: '無進行中的幫戰' });
        }
        res.json({ success: true, battle });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 報名
router.post('/registration/register', async (req, res) => {
    try {
        const battle = await Battle.findOne({ status: 'pending' });
        if (!battle) {
            return res.status(400).json({ success: false, message: '無進行中的幫戰' });
        }
        const now = new Date();
        if (now > battle.deadline) {
            return res.status(400).json({ success: false, message: '報名已截止，請聯繫指揮' });
        }
        const existing = await Registration.findOne({ battleId: battle._id, userId: req.user._id });
        if (existing) {
            return res.status(400).json({ success: false, message: '您已報名' });
        }
        const registration = new Registration({
            battleId: battle._id,
            userId: req.user._id,
            isBackup: now > battle.deadline
        });
        await registration.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'register',
            message: `用戶 ${req.user.gameId} 報名幫戰，日期：${battle.battleDate}`
        }).save();
        res.json({ success: true, message: registration.isBackup ? '您已進入備選名單' : '報名成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 取消報名
router.post('/registration/cancel', async (req, res) => {
    try {
        const battle = await Battle.findOne({ status: 'pending' });
        if (!battle) {
            return res.status(400).json({ success: false, message: '無進行中的幫戰' });
        }
        const now = new Date();
        if (now > battle.deadline) {
            return res.status(400).json({ success: false, message: '報名已截止，請聯繫指揮' });
        }
        const registration = await Registration.findOne({ battleId: battle._id, userId: req.user._id });
        if (!registration) {
            return res.status(400).json({ success: false, message: '您未報名' });
        }
        await registration.remove();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'cancel',
            message: `用戶 ${req.user.gameId} 取消報名，日期：${battle.battleDate}`
        }).save();
        res.json({ success: true, message: '取消報名成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 代報名
router.post('/registration/proxy', async (req, res) => {
    try {
        const { userId } = req.body;
        const battle = await Battle.findOne({ status: 'pending' });
        if (!battle) {
            return res.status(400).json({ success: false, message: '無進行中的幫戰' });
        }
        const now = new Date();
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(400).json({ success: false, message: '用戶不存在' });
        }
        const existing = await Registration.findOne({ battleId: battle._id, userId });
        if (existing) {
            return res.status(400).json({ success: false, message: '該用戶已報名' });
        }
        const registration = new Registration({
            battleId: battle._id,
            userId,
            isProxy: true,
            isBackup: now > battle.deadline
        });
        await registration.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'proxy_register',
            message: `用戶 ${req.user.gameId} 為 ${targetUser.gameId} 代報名，日期：${battle.battleDate}`
        }).save();
        res.json({ success: true, message: '代報名成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 更新陣型
router.post('/battle/formation', ensureAdmin, async (req, res) => {
    try {
        const { battleId, formation } = req.body;
        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(400).json({ success: false, message: '幫戰不存在' });
        }
        battle.formation = formation;
        battle.status = 'published';
        await battle.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'formation_update',
            message: `管理員更新幫戰陣型，日期：${battle.battleDate}`
        }).save();
        res.json({ success: true, message: '陣型更新並發布成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 確認最終出戰表
router.post('/battle/confirm', ensureAdmin, async (req, res) => {
    try {
        const { battleId, attendance } = req.body;
        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(400).json({ success: false, message: '幫戰不存在' });
        }
        for (const record of attendance) {
            await AttendanceRecord.create({
                battleId,
                userId: record.userId,
                attended: record.attended,
                registered: record.registered
            });
        }
        battle.status = 'confirmed';
        await battle.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'battle_confirm',
            message: `管理員確認幫戰出戰表，日期：${battle.battleDate}`
        }).save();
        res.json({ success: true, message: '出戰表確認成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取成員列表
router.get('/users', ensureAdmin, async (req, res) => {
    try {
        const { job } = req.query;
        const query = job ? { job } : {};
        const users = await User.find(query).select('discordId gameId job isAdmin onLeave');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 更新成員狀態
router.post('/user/update', ensureAdmin, async (req, res) => {
    try {
        const { userId, isAdmin, onLeave } = req.body;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(400).json({ success: false, message: '用戶不存在' });
        }
        user.isAdmin = isAdmin;
        user.onLeave = onLeave;
        await user.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'user_update',
            message: `管理員更新用戶 ${user.gameId} 狀態：管理員=${isAdmin}, 請假=${onLeave}`
        }).save();
        res.json({ success: true, message: '用戶狀態更新成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 刪除成員
router.delete('/user/:id', ensureAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(400).json({ success: false, message: '用戶不存在' });
        }
        await user.remove();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'user_delete',
            message: `管理員刪除用戶 ${user.gameId}`
        }).save();
        res.json({ success: true, message: '用戶刪除成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 請假申請
router.post('/leave/request', async (req, res) => {
    try {
        const { date } = req.body;
        const battle = await Battle.findOne({ status: 'pending' });
        if (battle && new Date() > battle.deadline) {
            return res.status(400).json({ success: false, message: '報名已截止，請聯繫指揮' });
        }
        const leaveRequest = new LeaveRequest({
            userId: req.user._id,
            date: new Date(date),
            status: 'pending'
        });
        await leaveRequest.save();
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'leave_request',
            message: `用戶 ${req.user.gameId} 申請請假，日期：${date}`
        }).save();
        res.json({ success: true, message: '請假申請提交成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 審核請假
router.post('/leave/approve', ensureAdmin, async (req, res) => {
    try {
        const { requestId, status } = req.body;
        const leaveRequest = await LeaveRequest.findById(requestId).populate('userId');
        if (!leaveRequest) {
            return res.status(400).json({ success: false, message: '請假申請不存在' });
        }
        leaveRequest.status = status;
        await leaveRequest.save();
        if (status === 'approved') {
            const user = await User.findById(leaveRequest.userId);
            user.onLeave = true;
            await user.save();
        }
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'leave_approve',
            message: `管理員${status === 'approved' ? '批准' : '拒絕'}用戶 ${leaveRequest.userId.gameId} 的請假申請`
        }).save();
        res.json({ success: true, message: `請假申請已${status === 'approved' ? '批准' : '拒絕'}` });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 職業變更申請
router.post('/job/change', async (req, res) => {
    try {
        const { newJob } = req.body;
        const user = await User.findOne({ discordId: req.user.discordId });
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'job_change',
            message: `用戶 ${user.gameId} 申請將職業從 ${user.job} 變更為 ${newJob}`
        }).save();
        res.json({ success: true, message: '職業變更申請提交成功，待管理員審核' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ID 變更申請
router.post('/id/change', async (req, res) => {
    try {
        const { newGameId } = req.body;
        if (!/^[\u4e00-\u9fa5]{1,7}$/.test(newGameId)) {
            return res.status(400).json({ success: false, message: '遊戲 ID 需為 1-7 個中文字符' });
        }
        const user = await User.findOne({ discordId: req.user.discordId });
        await new ChangeLog({
            userId: req.user.discordId,
            type: 'id_change',
            message: `用戶 ${user.gameId} 申請將遊戲 ID 變更為 ${newGameId}`
        }).save();
        res.json({ success: true, message: 'ID 變更申請提交成功，待管理員審核' });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取出勤記錄
router.get('/attendance', async (req, res) => {
    try {
        const records = await AttendanceRecord.find({ userId: req.user._id }).populate('battleId');
        const totalBattles = records.length;
        const attendedBattles = records.filter(r => r.attended).length;
        const registeredBattles = records.filter(r => r.registered).length;
        const attendanceRate = totalBattles > 0 ? (attendedBattles / totalBattles * 100).toFixed(2) : 0;
        res.json({
            success: true,
            records,
            stats: {
                totalBattles,
                attendedBattles,
                absentBattles: totalBattles - attendedBattles,
                registeredBattles,
                attendanceRate
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取統計資料
router.get('/statistics', ensureAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const registeredUsers = await Registration.countDocuments({ battleId: (await Battle.findOne({ status: 'pending' }))?._id });
        const leaveRequests = await LeaveRequest.countDocuments({ status: 'approved' });
        res.json({
            success: true,
            stats: {
                totalUsers,
                registeredUsers,
                leaveRequests
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取變更日誌
router.get('/changelogs', ensureAdmin, async (req, res) => {
    try {
        const { date, userId, type } = req.query;
        const query = {};
        if (date) query.timestamp = { $gte: new Date(date), $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)) };
        if (userId) query.userId = userId;
        if (type) query.type = type;
        const logs = await ChangeLog.find(query).sort({ timestamp: -1 });
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

module.exports = router;