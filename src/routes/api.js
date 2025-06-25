const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Battle = require('../models/battle');
const Registration = require('../models/registration');
const LeaveRequest = require('../models/leaveRequest');
const ChangeLog = require('../models/changeLog');
const Whitelist = require('../models/whitelist');
const PendingRequest = require('../models/pendingRequest');
const axios = require('axios');
const multer = require('multer');
const csvParser = require('csv-parser');
const stream = require('stream');
const AttendanceRecord = require('../models/attendanceRecord');

// 配置 multer 用於檔案上傳
const upload = multer({
    limits: { fileSize: 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv') {
            cb(null, true);
        } else {
            cb(new Error('僅支援 CSV 檔案'), false);
        }
    }
});

// 檢查是否為管理員
const isAdmin = (req, res, next) => {
    if (!req.isAuthenticated() || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: '無管理員權限' });
    }
    next();
};

// 發送 Discord Webhook 通知
async function sendWebhookNotification(message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('未設置 DISCORD_WEBHOOK_URL');
        return;
    }
    try {
        await axios.post(webhookUrl, { content: message });
    } catch (err) {
        console.error('Webhook 通知發送失敗:', err.message);
    }
}

// 獲取當前用戶資訊
router.get('/user/status', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.json({ success: false, message: '未登入' });
    }
    try {
        const user = await User.findById(req.user.id);
        res.json({
            success: true,
            user: {
                discordId: user.discordId,
                username: user.username,
                gameId: user.gameId,
                job: user.job,
                isAdmin: user.isAdmin,
                isWhitelisted: user.isWhitelisted
            }
        });
    } catch (err) {
        console.error('獲取用戶資訊錯誤:', err);
        res.json({ success: false, message: '無法獲取用戶資訊' });
    }
});

// 設置遊戲 ID 和職業
router.post('/user/setup', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.json({ success: false, message: '未登入' });
    }
    const { gameId, job } = req.body;
    if (!gameId || !job) {
        return res.json({ success: false, message: '請提供遊戲 ID 和職業' });
    }
    if (!/^[\u4e00-\u9fa5]{1,7}$/.test(gameId)) {
        return res.json({ success: false, message: '遊戲 ID 需為 1-7 個中文字符' });
    }
    try {
        const whitelistEntry = await Whitelist.findOne({ gameId });
        if (!whitelistEntry) {
            return res.json({ success: false, message: '遊戲 ID 不在白名單中' });
        }
        const user = await User.findById(req.user.id);
        user.gameId = gameId;
        user.job = job;
        user.isWhitelisted = true;
        await user.save();
        await ChangeLog.create({
            userId: user.discordId,
            type: 'setup',
            message: `用戶設置遊戲 ID: ${gameId}, 職業: ${job}`
        });
        res.json({ success: true, message: '設置成功' });
    } catch (err) {
        console.error('設置用戶資訊錯誤:', err);
        res.json({ success: false, message: '設置失敗' });
    }
});

// 白名單管理（管理員專用）
router.get('/whitelist', isAdmin, async (req, res) => {
    try {
        const whitelist = await Whitelist.find();
        res.json({ success: true, whitelist });
    } catch (err) {
        console.error('獲取白名單錯誤:', err);
        res.json({ success: false, message: '無法獲取白名單' });
    }
});

router.post('/whitelist', isAdmin, async (req, res) => {
    const { gameId } = req.body;
    if (!gameId) {
        return res.json({ success: false, message: '請提供遊戲 ID' });
    }
    try {
        const existing = await Whitelist.findOne({ gameId });
        if (existing) {
            return res.json({ success: false, message: '遊戲 ID 已存在' });
        }
        await Whitelist.create({ gameId });
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'whitelist_add',
            message: `添加白名單遊戲 ID: ${gameId}`
        });
        res.json({ success: true, message: '添加成功' });
    } catch (err) {
        console.error('添加白名單錯誤:', err);
        res.json({ success: false, message: '添加失敗' });
    }
});

router.delete('/whitelist/:gameId', isAdmin, async (req, res) => {
    try {
        const { gameId } = req.params;
        const whitelistEntry = await Whitelist.findOneAndDelete({ gameId });
        if (!whitelistEntry) {
            return res.json({ success: false, message: '遊戲 ID 不存在' });
        }
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'whitelist_remove',
            message: `移除白名單遊戲 ID: ${gameId}`
        });
        res.json({ success: true, message: '移除成功' });
    } catch (err) {
        console.error('移除白名單錯誤:', err);
        res.json({ success: false, message: '移除失敗' });
    }
});

// 批量導入白名單
router.post('/whitelist/bulk', isAdmin, upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: '請上傳 CSV 檔案' });
    }
    try {
        const results = [];
        const errors = [];
        const gameIds = [];

        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);
        bufferStream
            .pipe(csvParser({ headers: ['gameId'], skipLines: 0 }))
            .on('data', (row) => {
                const gameId = row.gameId?.trim();
                if (gameId && /^[\u4e00-\u9fa5]{1,7}$/.test(gameId)) {
                    gameIds.push(gameId);
                } else {
                    errors.push(`無效遊戲 ID: ${gameId || '空值'}`);
                }
            })
            .on('end', async () => {
                const existingIds = await Whitelist.find({ gameId: { $in: gameIds } }).distinct('gameId');
                const newIds = gameIds.filter(id => !existingIds.includes(id));

                if (newIds.length > 0) {
                    const bulkOps = newIds.map(id => ({
                        insertOne: { document: { gameId: id } }
                    }));
                    await Whitelist.bulkWrite(bulkOps);
                    results.push(`成功添加 ${newIds.length} 個遊戲 ID`);
                    await ChangeLog.insertMany(newIds.map(id => ({
                        userId: req.user.discordId,
                        type: 'whitelist_add',
                        message: `批量添加白名單遊戲 ID: ${id}`
                    })));
                    await sendWebhookNotification(`批量導入白名單：成功添加 ${newIds.length} 個遊戲 ID`);
                }

                if (existingIds.length > 0) {
                    errors.push(`以下 ${existingIds.length} 個遊戲 ID 已存在: ${existingIds.join(', ')}`);
                }

                res.json({
                    success: true,
                    message: '批量導入完成',
                    results,
                    errors
                });
            })
            .on('error', (err) => {
                console.error('CSV 解析錯誤:', err);
                res.json({ success: false, message: `CSV 解析錯誤: ${err.message}` });
            });
    } catch (err) {
        console.error('批量導入白名單錯誤:', err);
        res.json({ success: false, message: `處理失敗: ${err.message}` });
    }
});

// 職業變更申請
router.post('/job/change', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.json({ success: false, message: '未登入' });
    }
    const { newJob } = req.body;
    if (!newJob) {
        return res.json({ success: false, message: '請選擇新職業' });
    }
    try {
        const request = await PendingRequest.create({
            userId: req.user.id,
            type: 'job_change',
            data: { newJob }
        });
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'job_change_request',
            message: `申請變更職業為: ${newJob}`
        });
        await sendWebhookNotification(`新職業變更申請：用戶 ${req.user.discordId} 申請將職業變更為 ${newJob}`);
        res.json({ success: true, message: '申請已提交，待管理員審核' });
    } catch (err) {
        console.error('職業變更申請錯誤:', err);
        res.json({ success: false, message: '申請失敗' });
    }
});

// ID 變更申請
router.post('/id/change', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.json({ success: false, message: '未登入' });
    }
    const { newGameId } = req.body;
    if (!newGameId || !/^[\u4e00-\u9fa5]{1,7}$/.test(newGameId)) {
        return res.json({ success: false, message: '遊戲 ID 需為 1-7 個中文字符' });
    }
    try {
        const request = await PendingRequest.create({
            userId: req.user.id,
            type: 'id_change',
            data: { newGameId }
        });
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'id_change_request',
            message: `申請變更遊戲 ID 為: ${newGameId}`
        });
        await sendWebhookNotification(`新 ID 變更申請：用戶 ${req.user.discordId} 申請將遊戲 ID 變更為 ${newGameId}`);
        res.json({ success: true, message: '申請已提交，待管理員審核' });
    } catch (err) {
        console.error('ID 變更申請錯誤:', err);
        res.json({ success: false, message: '申請失敗' });
    }
});

// 獲取待審核申請（管理員專用）
router.get('/pending-requests', isAdmin, async (req, res) => {
    try {
        const requests = await PendingRequest.find({ status: 'pending' })
            .populate('userId', 'discordId username gameId job');
        res.json({ success: true, requests });
    } catch (err) {
        console.error('獲取待審核申請錯誤:', err);
        res.json({ success: false, message: '無法獲取待審核申請' });
    }
});

// 審核申請（管理員專用）
router.post('/pending-requests/:requestId', isAdmin, async (req, res) => {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
        return res.json({ success: false, message: '無效的操作' });
    }
    try {
        const request = await PendingRequest.findById(req.params.requestId)
            .populate('userId');
        if (!request) {
            return res.json({ success: false, message: '申請不存在' });
        }
        request.status = action === 'approve' ? 'approved' : 'rejected';
        request.reviewedBy = req.user.id;
        request.reviewedAt = new Date();
        await request.save();
        if (action === 'approve') {
            const user = await User.findById(request.userId);
            if (request.type === 'job_change') {
                user.job = request.data.newJob;
                await user.save();
                await ChangeLog.create({
                    userId: user.discordId,
                    type: 'job_change_approved',
                    message: `職業變更已批准，新職業: ${request.data.newJob}`
                });
            } else if (request.type === 'id_change') {
                const oldGameId = user.gameId;
                user.gameId = request.data.newGameId;
                await user.save();
                await Whitelist.findOneAndUpdate(
                    { gameId: oldGameId },
                    { gameId: request.data.newGameId },
                    { upsert: true }
                );
                await ChangeLog.create({
                    userId: user.discordId,
                    type: 'id_change_approved',
                    message: `遊戲 ID 變更已批准，新 ID: ${request.data.newGameId}`
                });
            }
        } else {
            await ChangeLog.create({
                userId: request.userId.discordId,
                type: `${request.type}_${action}`,
                message: `${request.type === 'job_change' ? '職業' : 'ID'} 變更申請被拒絕`
            });
        }
        await sendWebhookNotification(`申請審核結果：用戶 ${request.userId.discordId} 的${request.type === 'job_change' ? '職業' : 'ID'} 變更申請已被${action === 'approve' ? '批准' : '拒絕'}`);
        res.json({ success: true, message: '審核完成' });
    } catch (err) {
        console.error('審核申請錯誤:', err);
        res.json({ success: false, message: '審核失敗' });
    }
});

// 在 src/routes/api.js 中的創建幫戰路由，添加更詳細的錯誤處理和日誌

// 創建新幫戰 - 修復版本
router.post('/battle/create', isAdmin, async (req, res) => {
    try {
        const { battleDate, deadline, forceCreate } = req.body;
        console.log('📝 創建幫戰請求詳細資訊:');
        console.log('- battleDate:', battleDate, typeof battleDate);
        console.log('- deadline:', deadline, typeof deadline);
        console.log('- forceCreate:', forceCreate);
        console.log('- req.user:', req.user ? req.user.discordId : 'undefined');

        // 1. 驗證必要參數
        if (!battleDate || !deadline) {
            console.log('❌ 缺少必要參數');
            return res.status(400).json({ 
                success: false, 
                message: '請提供幫戰日期和報名截止時間',
                debug: { battleDate, deadline }
            });
        }

        // 2. 驗證日期格式
        const battleDateObj = new Date(battleDate);
        const deadlineObj = new Date(deadline);
        
        if (isNaN(battleDateObj.getTime()) || isNaN(deadlineObj.getTime())) {
            console.log('❌ 日期格式無效');
            return res.status(400).json({ 
                success: false, 
                message: '日期格式無效',
                debug: { 
                    battleDate, 
                    deadline,
                    battleDateValid: !isNaN(battleDateObj.getTime()),
                    deadlineValid: !isNaN(deadlineObj.getTime())
                }
            });
        }

        // 3. 檢查是否有未確認的出戰表
        const publishedBattle = await Battle.findOne({ status: 'published' });
        console.log('🔍 檢查現有已發布幫戰:', publishedBattle ? publishedBattle._id : 'none');
        
        if (publishedBattle && !forceCreate) {
            console.log('⚠️ 發現未確認的出戰表:', publishedBattle._id);
            return res.status(400).json({
                success: false,
                message: '請先確認最終出戰表',
                action: 'confirm',
                battleId: publishedBattle._id,
                battleDate: publishedBattle.battleDate
            });
        }

        // 4. 創建新幫戰
        console.log('📅 準備創建幫戰...');
        const battle = new Battle({
            battleDate: battleDateObj,
            deadline: deadlineObj,
            status: 'pending',
            formation: { groupA: [], groupB: [] }
        });

        console.log('💾 保存幫戰到資料庫...');
        const savedBattle = await battle.save();
        console.log('✅ 幫戰創建成功:', savedBattle._id);

        // 5. 記錄變更日誌
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'battle_create',
            message: `管理員創建幫戰，日期：${battleDate}${forceCreate ? '（強制創建）' : ''}`
        });

        console.log('📋 變更日誌已記錄');

        res.json({ 
            success: true, 
            message: '幫戰創建成功', 
            battleId: savedBattle._id,
            debug: {
                battleDate: savedBattle.battleDate,
                deadline: savedBattle.deadline,
                status: savedBattle.status
            }
        });

    } catch (err) {
        console.error('❌ 創建幫戰詳細錯誤:', {
            message: err.message,
            stack: err.stack,
            name: err.name
        });
        
        // 檢查是否為 MongoDB 連線問題
        if (err.name === 'MongooseError' || err.name === 'MongoError') {
            return res.status(500).json({ 
                success: false, 
                message: '資料庫連線錯誤，請稍後再試',
                error: err.message
            });
        }
        
        // 檢查是否為驗證錯誤
        if (err.name === 'ValidationError') {
            return res.status(400).json({ 
                success: false, 
                message: '資料驗證失敗',
                error: err.message,
                details: err.errors
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: '伺服器錯誤',
            error: err.message
        });
    }
});

// 額外的診斷路由 - 臨時添加用於除錯
router.get('/debug/battle-status', isAdmin, async (req, res) => {
    try {
        console.log('🔍 診斷幫戰狀態...');
        
        // 檢查所有幫戰
        const allBattles = await Battle.find().sort({ createdAt: -1 }).limit(10);
        console.log('📊 最近10個幫戰:', allBattles.map(b => ({
            id: b._id,
            date: b.battleDate,
            status: b.status,
            created: b.createdAt
        })));

        // 檢查已發布的幫戰
        const publishedBattles = await Battle.find({ status: 'published' });
        console.log('📋 已發布的幫戰:', publishedBattles.length);

        // 檢查資料庫連線
        const dbState = mongoose.connection.readyState;
        const dbStates = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        res.json({
            success: true,
            debug: {
                databaseStatus: dbStates[dbState],
                totalBattles: await Battle.countDocuments(),
                pendingBattles: await Battle.countDocuments({ status: 'pending' }),
                publishedBattles: await Battle.countDocuments({ status: 'published' }),
                confirmedBattles: await Battle.countDocuments({ status: 'confirmed' }),
                recentBattles: allBattles.map(b => ({
                    id: b._id,
                    date: b.battleDate,
                    status: b.status,
                    created: b.createdAt
                })),
                currentUser: {
                    id: req.user._id,
                    discordId: req.user.discordId,
                    isAdmin: req.user.isAdmin
                }
            }
        });

    } catch (err) {
        console.error('❌ 診斷錯誤:', err);
        res.status(500).json({
            success: false,
            error: err.message,
            stack: err.stack
        });
    }
});

// 臨時的測試路由 - 用於驗證基本功能
router.post('/debug/test-create', isAdmin, async (req, res) => {
    try {
        console.log('🧪 測試創建幫戰...');
        
        // 使用固定的測試數據
        const testBattle = new Battle({
            battleDate: new Date('2024-12-31'),
            deadline: new Date('2024-12-30'),
            status: 'pending',
            formation: { groupA: [], groupB: [] }
        });

        const saved = await testBattle.save();
        console.log('✅ 測試幫戰創建成功:', saved._id);

        // 立即刪除測試數據
        await Battle.findByIdAndDelete(saved._id);
        console.log('🗑️ 測試數據已清理');

        res.json({
            success: true,
            message: '測試創建成功',
            testId: saved._id
        });

    } catch (err) {
        console.error('❌ 測試創建失敗:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// 刪除幫戰
router.delete('/battle/:battleId', isAdmin, async (req, res) => {
    try {
        const { battleId } = req.params;
        console.log('刪除幫戰請求:', battleId);

        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(400).json({ success: false, message: '幫戰不存在' });
        }
        if (battle.status === 'confirmed') {
            return res.status(400).json({ success: false, message: '已確認的幫戰無法刪除' });
        }

        await Registration.deleteMany({ battleId });
        await battle.deleteOne();
        console.log('幫戰刪除成功:', battleId);

        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'battle_delete',
            message: `管理員刪除幫戰，日期：${battle.battleDate}`
        });

        res.json({ success: true, message: '幫戰刪除成功' });
    } catch (err) {
        console.error('刪除幫戰錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 關閉幫戰報名
router.post('/battle/close', isAdmin, async (req, res) => {
    try {
        const { battleId } = req.body;
        console.log('關閉報名請求:', battleId);

        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(400).json({ success: false, message: '幫戰不存在' });
        }
        if (battle.status !== 'pending') {
            return res.status(400).json({ success: false, message: '僅能關閉報名中的幫戰' });
        }

        battle.status = 'closed';
        await battle.save();
        console.log('報名關閉成功:', battleId);

        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'battle_close',
            message: `管理員關閉幫戰報名，日期：${battle.battleDate}`
        });

        res.json({ success: true, message: '報名已關閉' });
    } catch (err) {
        console.error('關閉報名錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取所有進行中的幫戰
router.get('/battle/current', async (req, res) => {
    try {
        const battles = await Battle.find({ status: { $in: ['pending', 'published'] } })
            .sort({ battleDate: 1 });
        console.log('獲取進行中幫戰:', battles.length);

        const battlesWithRegistrations = await Promise.all(battles.map(async (battle) => {
            const registrations = await Registration.find({ battleId: battle._id })
                .populate('userId', 'discordId username gameId job');
            return {
                ...battle.toObject(),
                registrations
            };
        }));

        res.json({ success: true, battles: battlesWithRegistrations });
    } catch (err) {
        console.error('獲取幫戰錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 報名
router.post('/registration/register', async (req, res) => {
    try {
        const { battleId } = req.body;
        if (!battleId) {
            return res.status(400).json({ success: false, message: '請提供幫戰 ID' });
        }
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'pending') {
            return res.status(400).json({ success: false, message: '無進行中的幫戰或報名已結束' });
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
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'register',
            message: `用戶 ${req.user.gameId} 報名幫戰，日期：${battle.battleDate}`
        });
        res.json({ success: true, message: registration.isBackup ? '您已進入備選名單' : '報名成功' });
    } catch (err) {
        console.error('報名錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 取消報名
router.post('/registration/cancel', async (req, res) => {
    try {
        const { battleId } = req.body;
        if (!battleId) {
            return res.status(400).json({ success: false, message: '請提供幫戰 ID' });
        }
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'pending') {
            return res.status(400).json({ success: false, message: '無進行中的幫戰或報名已結束' });
        }
        const now = new Date();
        if (now > battle.deadline) {
            return res.status(400).json({ success: false, message: '報名已截止，請聯繫指揮' });
        }
        const registration = await Registration.findOne({ battleId: battle._id, userId: req.user._id });
        if (!registration) {
            return res.status(400).json({ success: false, message: '您未報名' });
        }
        await registration.deleteOne();
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'cancel',
            message: `用戶 ${req.user.gameId} 取消報名，日期：${battle.battleDate}`
        });
        res.json({ success: true, message: '取消報名成功' });
    } catch (err) {
        console.error('取消報名錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 代報名
router.post('/registration/proxy', async (req, res) => {
    try {
        const { userId, battleId } = req.body;
        if (!battleId || !userId) {
            return res.status(400).json({ success: false, message: '請提供幫戰 ID 和用戶 ID' });
        }
        const battle = await Battle.findById(battleId);
        if (!battle || battle.status !== 'pending') {
            return res.status(400).json({ success: false, message: '無進行中的幫戰或報名已結束' });
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
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'proxy_register',
            message: `用戶 ${req.user.gameId} 為 ${targetUser.gameId} 代報名，日期：${battle.battleDate}`
        });
        res.json({ success: true, message: '代報名成功' });
    } catch (err) {
        console.error('代報名錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 更新陣型
router.post('/battle/formation', isAdmin, async (req, res) => {
    try {
        const { battleId, formation } = req.body;
        if (!battleId || !formation) {
            return res.status(400).json({ success: false, message: '請提供幫戰 ID 和陣型數據' });
        }
        const battle = await Battle.findById(battleId);
        if (!battle) {
            return res.status(400).json({ success: false, message: '幫戰不存在' });
        }
        battle.formation = formation;
        battle.status = 'published';
        await battle.save();
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'formation_update',
            message: `管理員更新幫戰陣型，日期：${battle.battleDate}`
        });
        res.json({ success: true, message: '陣型更新並發布成功' });
    } catch (err) {
        console.error('更新陣型錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 確認最終出戰表
router.post('/battle/confirm', isAdmin, async (req, res) => {
    try {
        const { battleId, attendance } = req.body;
        if (!battleId || !attendance) {
            return res.status(400).json({ success: false, message: '請提供幫戰 ID 和出勤數據' });
        }
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
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'battle_confirm',
            message: `管理員確認幫戰出戰表，日期：${battle.battleDate}`
        });
        res.json({ success: true, message: '出戰表確認成功' });
    } catch (err) {
        console.error('確認出戰表錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取成員列表
router.get('/users', isAdmin, async (req, res) => {
    try {
        const { job } = req.query;
        const query = job ? { job } : {};
        const users = await User.find(query).select('discordId gameId job isAdmin onLeave');
        res.json({ success: true, users });
    } catch (err) {
        console.error('獲取成員列表錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 更新成員狀態
router.post('/user/update', isAdmin, async (req, res) => {
    try {
        const { userId, isAdmin, onLeave } = req.body;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(400).json({ success: false, message: '用戶不存在' });
        }
        user.isAdmin = isAdmin;
        user.onLeave = onLeave;
        await user.save();
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'user_update',
            message: `管理員更新用戶 ${user.gameId} 狀態：管理員=${isAdmin}, 請假=${onLeave}`
        });
        res.json({ success: true, message: '用戶狀態更新成功' });
    } catch (err) {
        console.error('更新成員狀態錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 刪除成員
router.delete('/user/:id', isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(400).json({ success: false, message: '用戶不存在' });
        }
        await user.deleteOne();
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'user_delete',
            message: `管理員刪除用戶 ${user.gameId}`
        });
        res.json({ success: true, message: '用戶刪除成功' });
    } catch (err) {
        console.error('刪除成員錯誤:', err);
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
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'leave_request',
            message: `用戶 ${req.user.gameId} 申請請假，日期：${date}`
        });
        res.json({ success: true, message: '請假申請提交成功' });
    } catch (err) {
        console.error('請假申請錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 審核請假
router.post('/leave/approve', isAdmin, async (req, res) => {
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
        await ChangeLog.create({
            userId: req.user.discordId,
            type: 'leave_approve',
            message: `管理員${status === 'approved' ? '批准' : '拒絕'}用戶 ${leaveRequest.userId.gameId} 的請假申請`
        });
        res.json({ success: true, message: `請假申請已${status === 'approved' ? '批准' : '拒絕'}` });
    } catch (err) {
        console.error('審核請假錯誤:', err);
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
        console.error('獲取出勤記錄錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取統計資料
router.get('/statistics', isAdmin, async (req, res) => {
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
        console.error('獲取統計資料錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// 獲取變更日誌
router.get('/changelogs', isAdmin, async (req, res) => {
    try {
        const { date, userId, type } = req.query;
        const query = {};
        if (date) query.timestamp = { $gte: new Date(date), $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)) };
        if (userId) query.userId = userId;
        if (type) query.type = type;
        const logs = await ChangeLog.find(query).sort({ timestamp: -1 });
        res.json({ success: true, logs });
    } catch (err) {
        console.error('獲取變更日誌錯誤:', err);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

module.exports = router;