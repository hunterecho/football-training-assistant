"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.authRequired = authRequired;
var jsonwebtoken_1 = require("jsonwebtoken");
var config_1 = require("../config");
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, config_1.config.jwtSecret, { expiresIn: '30d' });
}
function authRequired(req, res, next) {
    var _a;
    var header = (_a = req.headers.authorization) !== null && _a !== void 0 ? _a : '';
    var token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        var payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        req.auth = payload;
        next();
    }
    catch (_b) {
        res.status(401).json({ error: 'Invalid token' });
    }
}
