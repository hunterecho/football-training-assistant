"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabase = getSupabase;
exports.getAdminSupabase = getAdminSupabase;
exports.dbGetSystemSettings = dbGetSystemSettings;
exports.dbSetSystemSettings = dbSetSystemSettings;
exports.dbInsert = dbInsert;
exports.dbSelect = dbSelect;
exports.dbCount = dbCount;
exports.dbUpdate = dbUpdate;
exports.dbDelete = dbDelete;
exports.dbUpsertUser = dbUpsertUser;
exports.resetMemoryStore = resetMemoryStore;
var supabase_js_1 = require("@supabase/supabase-js");
var ws_1 = require("ws");
var index_1 = require("../config/index");
var client = null;
var adminClient = null;
function getSupabase() {
    if (!(0, index_1.isSupabaseConfigured)())
        return null;
    if (!client) {
        client = (0, supabase_js_1.createClient)(index_1.config.supabaseUrl, index_1.config.supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
            realtime: {
                transport: ws_1.default,
            },
        });
    }
    return client;
}
function getAdminSupabase() {
    if (!(0, index_1.isSupabaseConfigured)() || !index_1.config.supabaseServiceKey)
        return null;
    if (!adminClient) {
        adminClient = (0, supabase_js_1.createClient)(index_1.config.supabaseUrl, index_1.config.supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
            realtime: {
                transport: ws_1.default,
            },
        });
    }
    return adminClient;
}
function uid(prefix) {
    if (prefix === void 0) { prefix = 'id'; }
    return "".concat(prefix, "_").concat(Date.now().toString(36)).concat(Math.random()
        .toString(36)
        .slice(2, 8));
}
var memUsers = new Map();
var memTemplates = new Map();
var memPlans = new Map();
var memRecords = new Map();
var memSystemSettings = new Map();
function getBucket(table) {
    if (table === 'templates')
        return memTemplates;
    if (table === 'plans')
        return memPlans;
    if (table === 'training_records')
        return memRecords;
    return new Map();
}
function dbGetSystemSettings(key) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, res, setting;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    return [4 /*yield*/, sb.from('system_settings').select('value').eq('key', key).maybeSingle()];
                case 1:
                    res = _d.sent();
                    if (res.error)
                        throw new Error(res.error.message);
                    return [2 /*return*/, (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : null];
                case 2:
                    setting = memSystemSettings.get(key);
                    return [2 /*return*/, (_c = setting === null || setting === void 0 ? void 0 : setting.value) !== null && _c !== void 0 ? _c : null];
            }
        });
    });
}
function dbSetSystemSettings(key, value, description) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    return [4 /*yield*/, sb
                            .from('system_settings')
                            .upsert({ key: key, value: value, description: description, updated_at: new Date().toISOString() }, { onConflict: 'key' })];
                case 1:
                    res = _a.sent();
                    if (res.error)
                        throw new Error(res.error.message);
                    return [2 /*return*/];
                case 2:
                    memSystemSettings.set(key, { key: key, value: value, description: description });
                    return [2 /*return*/];
            }
        });
    });
}
function castRow(r) {
    return r;
}
function dbInsert(table, row, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, _, rowWithoutId, enrichedRow, finalRow, res, inserted, uidVal, bucket, list;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    _ = row.id, rowWithoutId = __rest(row, ["id"]);
                    enrichedRow = table !== 'users' && userId && !rowWithoutId.user_id
                        ? __assign(__assign({}, rowWithoutId), { user_id: userId }) : rowWithoutId;
                    finalRow = __assign(__assign({}, enrichedRow), { id: "".concat(table, "_").concat(Date.now().toString(36)).concat(Math.random().toString(36).slice(2, 8)) });
                    return [4 /*yield*/, sb.from(table).insert(finalRow).select().maybeSingle()];
                case 1:
                    res = _d.sent();
                    if (res.error)
                        throw new Error(res.error.message);
                    return [2 /*return*/, castRow(res.data)];
                case 2:
                    inserted = __assign(__assign({}, row), { id: uid(table), created_at: new Date().toISOString() });
                    if (table === 'users') {
                        memUsers.set(inserted.id, inserted);
                    }
                    else {
                        uidVal = (_b = (_a = row.user_id) !== null && _a !== void 0 ? _a : userId) !== null && _b !== void 0 ? _b : 'anon';
                        bucket = getBucket(table);
                        list = (_c = bucket.get(uidVal)) !== null && _c !== void 0 ? _c : [];
                        list.push(inserted);
                        bucket.set(uidVal, list);
                    }
                    return [2 /*return*/, castRow(inserted)];
            }
        });
    });
}
function dbSelect(table, column, value, _userId, limit, offset) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, query, res, u, u, bucket, allRows, _i, _a, list;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    query = sb.from(table).select('*').eq(column, value);
                    if (limit)
                        query = query.limit(limit);
                    if (offset)
                        query.offset(offset);
                    return [4 /*yield*/, query.throwOnError()];
                case 1:
                    res = _d.sent();
                    return [2 /*return*/, ((_b = res.data) !== null && _b !== void 0 ? _b : [])];
                case 2:
                    if (table === 'users') {
                        if (column === 'id') {
                            u = memUsers.get(value);
                            return [2 /*return*/, (u ? [u] : [])];
                        }
                        if (column === 'user_id') {
                            if (value === '__ALL__')
                                return [2 /*return*/, Array.from(memUsers.values())];
                            u = Array.from(memUsers.values()).find(function (x) { return x.user_id === value || x.id === value; });
                            return [2 /*return*/, (u ? [u] : [])];
                        }
                        return [2 /*return*/, Array.from(memUsers.values())];
                    }
                    bucket = getBucket(table);
                    allRows = [];
                    if (column === 'user_id') {
                        allRows = (_c = bucket.get(value)) !== null && _c !== void 0 ? _c : [];
                    }
                    else {
                        for (_i = 0, _a = bucket.values(); _i < _a.length; _i++) {
                            list = _a[_i];
                            allRows.push.apply(allRows, list);
                        }
                        allRows = allRows.filter(function (row) { return row[column] === value; });
                    }
                    if (offset)
                        allRows = allRows.slice(offset);
                    if (limit)
                        allRows = allRows.slice(0, limit);
                    return [2 /*return*/, allRows];
            }
        });
    });
}
function dbCount(table, column, value) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, res, bucket, count, _i, _a, list;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    return [4 /*yield*/, sb.from(table).select('id', { count: 'exact', head: true }).eq(column, value)];
                case 1:
                    res = _d.sent();
                    return [2 /*return*/, (_b = res.count) !== null && _b !== void 0 ? _b : 0];
                case 2:
                    if (table === 'users') {
                        if (column === 'id') {
                            return [2 /*return*/, memUsers.has(value) ? 1 : 0];
                        }
                        if (column === 'user_id') {
                            if (value === '__ALL__')
                                return [2 /*return*/, memUsers.size];
                            return [2 /*return*/, Array.from(memUsers.values()).some(function (x) { return x.user_id === value || x.id === value; }) ? 1 : 0];
                        }
                        return [2 /*return*/, memUsers.size];
                    }
                    bucket = getBucket(table);
                    if (column === 'user_id') {
                        return [2 /*return*/, ((_c = bucket.get(value)) !== null && _c !== void 0 ? _c : []).length];
                    }
                    count = 0;
                    for (_i = 0, _a = bucket.values(); _i < _a.length; _i++) {
                        list = _a[_i];
                        count += list.filter(function (row) { return row[column] === value; }).length;
                    }
                    return [2 /*return*/, count];
            }
        });
    });
}
function dbUpdate(table, id, patch, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, query, res, bucket, _i, _a, _b, uidKey, list, idx, updated;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    query = sb.from(table).update(patch).eq('id', id);
                    if (userId) {
                        query.eq('user_id', userId);
                    }
                    return [4 /*yield*/, query.select().maybeSingle()];
                case 1:
                    res = _c.sent();
                    if (res.error)
                        throw new Error(res.error.message);
                    if (!res.data)
                        throw new Error('Not found or no permission');
                    return [2 /*return*/, castRow(res.data)];
                case 2:
                    bucket = getBucket(table);
                    for (_i = 0, _a = bucket.entries(); _i < _a.length; _i++) {
                        _b = _a[_i], uidKey = _b[0], list = _b[1];
                        idx = list.findIndex(function (r) { return r.id === id; });
                        if (idx >= 0) {
                            if (userId && uidKey !== userId) {
                                throw new Error('Not found or no permission');
                            }
                            updated = __assign(__assign({}, list[idx]), patch);
                            list[idx] = updated;
                            bucket.set(uidKey, list);
                            return [2 /*return*/, castRow(updated)];
                        }
                    }
                    throw new Error('Not found');
            }
        });
    });
}
function dbDelete(table, id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, query, res, bucket, _i, _a, _b, uidKey, list, hasItem, filtered;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    query = sb.from(table).delete().eq('id', id);
                    if (userId) {
                        query.eq('user_id', userId);
                    }
                    return [4 /*yield*/, query];
                case 1:
                    res = _c.sent();
                    if (res.error)
                        throw new Error(res.error.message);
                    if (res.count === 0 && userId) {
                        throw new Error('Not found or no permission');
                    }
                    return [2 /*return*/];
                case 2:
                    bucket = getBucket(table);
                    for (_i = 0, _a = bucket.entries(); _i < _a.length; _i++) {
                        _b = _a[_i], uidKey = _b[0], list = _b[1];
                        hasItem = list.some(function (r) { return r.id === id; });
                        if (hasItem) {
                            if (userId && uidKey !== userId) {
                                throw new Error('Not found or no permission');
                            }
                            filtered = list.filter(function (r) { return r.id !== id; });
                            bucket.set(uidKey, filtered);
                            return [2 /*return*/];
                        }
                    }
                    throw new Error('Not found');
            }
        });
    });
}
function dbUpsertUser(row) {
    return __awaiter(this, void 0, void 0, function () {
        var sb, finalRow, res, existing;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    sb = getSupabase();
                    if (!sb) return [3 /*break*/, 2];
                    finalRow = __assign(__assign({}, row), { id: row.id || "user_".concat(Date.now().toString(36)).concat(Math.random().toString(36).slice(2, 8)) });
                    return [4 /*yield*/, sb
                            .from('users')
                            .upsert(finalRow, { onConflict: 'id' })
                            .select()
                            .maybeSingle()];
                case 1:
                    res = _b.sent();
                    if (res.error)
                        throw new Error(res.error.message);
                    return [2 /*return*/, castRow(res.data)];
                case 2:
                    existing = memUsers.get(row.id);
                    if (existing)
                        return [2 /*return*/, existing];
                    memUsers.set(row.id, __assign(__assign({}, row), { created_at: (_a = row.created_at) !== null && _a !== void 0 ? _a : new Date().toISOString() }));
                    return [2 /*return*/, memUsers.get(row.id)];
            }
        });
    });
}
function resetMemoryStore() {
    memUsers.clear();
    memTemplates.clear();
    memPlans.clear();
    memRecords.clear();
}
