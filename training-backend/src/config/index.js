"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupabaseConfigured = exports.config = void 0;
exports.config = {
    port: Number(process.env.PORT) || 4000,
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
var isSupabaseConfigured = function () {
    return !!exports.config.supabaseUrl && !!exports.config.supabaseServiceKey;
};
exports.isSupabaseConfigured = isSupabaseConfigured;
