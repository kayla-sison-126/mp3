const express = require('express');
const router = express.Router();
const User = require('../models/user');

// GET /api/users
router.get('/', async (req, res) => {
    try {
        const users = await User.find({});
        res.status(200).json({ message: 'OK', data: users });
    } catch (err) {
        res.status(500).json({ message: 'Server error', data: {} });
    }
});

module.exports = router;