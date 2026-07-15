"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmRoutes = void 0;
var express_1 = require("express");
var auth_1 = require("../middleware/auth");
var client_1 = require("../db/client");
var client_2 = require("../db/client");
var router = (0, express_1.Router)();
router.use(auth_1.authRequired);
function parseTrainingDescription(text) {
    try {
        var drills = [];
        var durationPattern = /(\d+)\s*(分钟|分|秒)/gi;
        var match = void 0;
        while ((match = durationPattern.exec(text)) !== null) {
            var duration = parseInt(match[1]);
            var unit = match[2];
            var seconds = unit.includes('分') ? duration * 60 : duration;
            var title = '';
            var contextStart = Math.max(0, match.index - 50);
            var contextEnd = Math.min(text.length, match.index + 50);
            var context = text.slice(contextStart, contextEnd);
            var actionWords = ['热身', '训练', '练习', '对抗', '比赛', '休息', '拉伸', '技术', '体能', '传球', '射门', '防守', '进攻'];
            for (var _i = 0, actionWords_1 = actionWords; _i < actionWords_1.length; _i++) {
                var word = actionWords_1[_i];
                if (context.includes(word)) {
                    title = word;
                    break;
                }
            }
            if (!title) {
                title = "\u8BAD\u7EC3\u73AF\u8282 ".concat(drills.length + 1);
            }
            drills.push({
                title: title,
                duration: seconds,
            });
        }
        if (drills.length === 0) {
            return null;
        }
        var datePattern = /(今天|明天|后天|本周|下周|(\d{4})[-/](\d{1,2})[-/](\d{1,2}))/;
        var dateMatch = text.match(datePattern);
        var planDate = void 0;
        if (dateMatch) {
            if (dateMatch[1] === '今天') {
                planDate = new Date().toISOString().split('T')[0];
            }
            else if (dateMatch[1] === '明天') {
                var tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                planDate = tomorrow.toISOString().split('T')[0];
            }
            else if (dateMatch[1] === '后天') {
                var dayAfter = new Date();
                dayAfter.setDate(dayAfter.getDate() + 2);
                planDate = dayAfter.toISOString().split('T')[0];
            }
            else if (dateMatch[4] && dateMatch[5] && dateMatch[6]) {
                planDate = "".concat(dateMatch[4], "-").concat(dateMatch[5].padStart(2, '0'), "-").concat(dateMatch[6].padStart(2, '0'));
            }
        }
        var hasPlanKeyword = text.includes('训练计划') || text.includes('今天训练') || text.includes('安排');
        if (!planDate && hasPlanKeyword) {
            planDate = new Date().toISOString().split('T')[0];
        }
        return {
            template: {
                name: 'AI生成训练模板',
                description: "\u6839\u636E\u63CF\u8FF0\u751F\u6210\u7684\u8BAD\u7EC3\u6A21\u677F: ".concat(text.slice(0, 50), "..."),
                drills: drills,
            },
            planDate: planDate,
        };
    }
    catch (_a) {
        return null;
    }
}
router.post('/parse', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var description, result, msg;
    return __generator(this, function (_a) {
        try {
            description = req.body.description;
            if (!description) {
                res.status(400).json({ error: 'description is required' });
                return [2 /*return*/];
            }
            result = parseTrainingDescription(description);
            if (!result) {
                res.status(400).json({
                    error: '无法解析训练描述，请提供更详细的训练安排，例如："前十分钟热身然后二十五分钟技术训练"',
                    needsMoreInfo: true,
                    suggestions: [
                        '请提供具体的训练环节和时长',
                        '例如："热身10分钟，技术训练25分钟，对抗比赛20分钟"',
                        '可以指定日期："今天安排一个训练计划，热身10分钟..."',
                    ],
                });
                return [2 /*return*/];
            }
            res.json({
                success: true,
                template: result.template,
                planDate: result.planDate,
                needsConfirmation: !result.planDate,
            });
        }
        catch (err) {
            msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
        return [2 /*return*/];
    });
}); });
router.post('/create', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, template, planDate, createdTemplate, createdPlan, shareUrl, err_1, msg;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 4, , 5]);
                _a = req.body, template = _a.template, planDate = _a.planDate;
                if (!template || !template.name || !template.drills || template.drills.length === 0) {
                    res.status(400).json({ error: 'template data is invalid' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, client_1.dbInsert)('templates', {
                        user_id: req.auth.userId,
                        name: template.name,
                        description: template.description,
                        drills: template.drills,
                        is_public: false,
                    }, req.auth.userId)];
            case 1:
                createdTemplate = _b.sent();
                createdPlan = null;
                shareUrl = null;
                if (!planDate) return [3 /*break*/, 3];
                return [4 /*yield*/, (0, client_1.dbInsert)('plans', {
                        user_id: req.auth.userId,
                        template_id: createdTemplate.id,
                        title: template.name,
                        date: planDate,
                        status: 'planned',
                    }, req.auth.userId)];
            case 2:
                createdPlan = (_b.sent());
                shareUrl = "".concat(process.env.FRONTEND_URL || 'http://localhost:5173', "/share/").concat(createdPlan.id);
                _b.label = 3;
            case 3:
                res.json({
                    success: true,
                    template: createdTemplate,
                    plan: createdPlan,
                    shareUrl: shareUrl,
                });
                return [3 /*break*/, 5];
            case 4:
                err_1 = _b.sent();
                msg = err_1 instanceof Error ? err_1.message : String(err_1);
                res.status(500).json({ error: msg });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
router.post('/generate', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var description, parsed, createdTemplate, createdPlan, shareUrl, err_2, msg;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                description = req.body.description;
                if (!description) {
                    res.status(400).json({ error: 'description is required' });
                    return [2 /*return*/];
                }
                parsed = parseTrainingDescription(description);
                if (!parsed) {
                    res.status(400).json({
                        error: '无法解析训练描述',
                        needsMoreInfo: true,
                    });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, client_1.dbInsert)('templates', {
                        user_id: req.auth.userId,
                        name: parsed.template.name,
                        description: parsed.template.description,
                        drills: parsed.template.drills,
                        is_public: false,
                    }, req.auth.userId)];
            case 1:
                createdTemplate = _a.sent();
                createdPlan = null;
                shareUrl = null;
                if (!parsed.planDate) return [3 /*break*/, 3];
                return [4 /*yield*/, (0, client_1.dbInsert)('plans', {
                        user_id: req.auth.userId,
                        template_id: createdTemplate.id,
                        title: parsed.template.name,
                        date: parsed.planDate,
                        status: 'planned',
                    }, req.auth.userId)];
            case 2:
                createdPlan = (_a.sent());
                shareUrl = "".concat(process.env.FRONTEND_URL || 'http://localhost:5173', "/share/").concat(createdPlan.id);
                _a.label = 3;
            case 3:
                res.json({
                    success: true,
                    template: createdTemplate,
                    plan: createdPlan,
                    shareUrl: shareUrl,
                    needsDate: !parsed.planDate,
                });
                return [3 /*break*/, 5];
            case 4:
                err_2 = _a.sent();
                msg = err_2 instanceof Error ? err_2.message : String(err_2);
                res.status(500).json({ error: msg });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
router.post('/card', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var planId, sb, _a, plan, planError, _b, template, templateError, totalDuration, drillCount, shareUrl, cardData, err_3, msg;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                planId = req.body.planId;
                if (!planId) {
                    res.status(400).json({ error: 'planId is required' });
                    return [2 /*return*/];
                }
                sb = (0, client_2.getAdminSupabase)();
                if (!sb) {
                    res.status(500).json({ error: 'Database not configured' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, sb
                        .from('plans')
                        .select('id, title, date, template_id')
                        .eq('id', planId)
                        .single()];
            case 1:
                _a = _c.sent(), plan = _a.data, planError = _a.error;
                if (planError || !plan) {
                    res.status(404).json({ error: 'Plan not found' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, sb
                        .from('templates')
                        .select('name, drills')
                        .eq('id', plan.template_id)
                        .single()];
            case 2:
                _b = _c.sent(), template = _b.data, templateError = _b.error;
                if (templateError || !template) {
                    res.status(404).json({ error: 'Template not found' });
                    return [2 /*return*/];
                }
                totalDuration = template.drills.reduce(function (acc, d) { return acc + (d.duration || 0); }, 0);
                drillCount = template.drills.length;
                shareUrl = "".concat(process.env.FRONTEND_URL || 'http://localhost:5173', "/share/").concat(planId);
                cardData = {
                    type: 'training_plan',
                    title: plan.title,
                    date: plan.date,
                    totalDuration: formatDuration(totalDuration),
                    drillCount: drillCount,
                    drills: template.drills.map(function (d) { return ({
                        title: d.title,
                        duration: formatDuration(d.duration),
                    }); }),
                    shareUrl: shareUrl,
                    thumbnail: generateThumbnail(template.drills),
                };
                res.json({
                    success: true,
                    card: cardData,
                });
                return [3 /*break*/, 4];
            case 3:
                err_3 = _c.sent();
                msg = err_3 instanceof Error ? err_3.message : String(err_3);
                res.status(500).json({ error: msg });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
function formatDuration(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    if (mins > 0) {
        return secs > 0 ? "".concat(mins, "\u5206").concat(secs, "\u79D2") : "".concat(mins, "\u5206\u949F");
    }
    return "".concat(secs, "\u79D2");
}
function generateThumbnail(drills) {
    var keywords = {
        '热身': '🏃',
        '训练': '⚽',
        '练习': '🎯',
        '对抗': '💪',
        '比赛': '🏆',
        '休息': '😴',
        '拉伸': '🧘',
        '技术': '⚡',
        '体能': '🔥',
        '传球': '🔄',
        '射门': '🎯',
        '防守': '🛡️',
        '进攻': '⚔️',
    };
    var emoji = '⚽';
    for (var _i = 0, drills_1 = drills; _i < drills_1.length; _i++) {
        var drill = drills_1[_i];
        for (var _a = 0, _b = Object.entries(keywords); _a < _b.length; _a++) {
            var _c = _b[_a], keyword = _c[0], icon = _c[1];
            if (drill.title && drill.title.includes(keyword)) {
                emoji = icon;
                break;
            }
        }
    }
    return emoji;
}
exports.llmRoutes = router;
