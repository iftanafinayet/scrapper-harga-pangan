const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');

// Route Registrasi: POST /api/auth/register
router.post('/register', register);

// Route Login: POST /api/auth/login
router.post('/login', login);

module.exports = router;
