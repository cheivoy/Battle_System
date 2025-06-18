const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
    battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attended: { type: Boolean, default: false },
    registered: { type: Boolean, default: false }
});

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);