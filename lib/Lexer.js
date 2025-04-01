"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLexer = exports.extractByTokenRange = exports.extractByPositionRange = exports.TokenRangeError = exports.TokenError = void 0;
function posToString(pos) {
    return pos === undefined ? '<END-OF-FILE>' : JSON.stringify(pos);
}
var TokenError = /** @class */ (function (_super) {
    __extends(TokenError, _super);
    function TokenError(pos, errorMessage) {
        var _this = _super.call(this, posToString(pos) + ": " + errorMessage) || this;
        _this.pos = pos;
        _this.errorMessage = errorMessage;
        return _this;
    }
    return TokenError;
}(Error));
exports.TokenError = TokenError;
var TokenRangeError = /** @class */ (function (_super) {
    __extends(TokenRangeError, _super);
    function TokenRangeError(first, next, errorMessage) {
        var _this = _super.call(this, posToString(first) + " - " + posToString(next) + ": " + errorMessage) || this;
        _this.first = first;
        _this.next = next;
        _this.errorMessage = errorMessage;
        return _this;
    }
    return TokenRangeError;
}(Error));
exports.TokenRangeError = TokenRangeError;
function extractByPositionRange(input, first, next) {
    var firstIndex = first === undefined ? input.length : first.index;
    var nextIndex = next === undefined ? input.length : next.index;
    if (firstIndex >= nextIndex) {
        return '';
    }
    return input.substring(firstIndex, nextIndex);
}
exports.extractByPositionRange = extractByPositionRange;
function extractByTokenRange(input, first, next) {
    return extractByPositionRange(input, (first === undefined ? undefined : first.pos), (next === undefined ? undefined : next.pos));
}
exports.extractByTokenRange = extractByTokenRange;
var TokenImpl = /** @class */ (function () {
    function TokenImpl(lexer, input, kind, text, pos, keep) {
        this.lexer = lexer;
        this.input = input;
        this.kind = kind;
        this.text = text;
        this.pos = pos;
        this.keep = keep;
    }
    Object.defineProperty(TokenImpl.prototype, "next", {
        get: function () {
            if (this.nextToken === undefined) {
                this.nextToken = this.lexer.parseNextAvailable(this.input, this.pos.index + this.text.length, this.pos.rowEnd, this.pos.columnEnd);
                if (this.nextToken === undefined) {
                    this.nextToken = null;
                }
            }
            return this.nextToken === null ? undefined : this.nextToken;
        },
        enumerable: false,
        configurable: true
    });
    return TokenImpl;
}());
function analyzeLexerRules(rules, topLevel, memo) {
    if (memo === void 0) { memo = new Set(); }
    memo.add(rules);
    for (var _i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
        var _a = rules_1[_i], regex = _a[1], state = _a[3];
        if (regex.source[0] !== '^') {
            throw new Error("Regular expression patterns for a tokenizer should start with '^': " + regex.source);
        }
        if (!regex.global) {
            throw new Error("Regular expression patterns for a tokenizer should be global: " + regex.source);
        }
        if (state !== undefined) {
            if (state === 'pop' || state === 'push') {
                if (topLevel) {
                    throw new Error("The 'push' and 'pop' directives are not allowed in the top-level lexer state");
                }
            }
            else {
                if (memo.has(state)) {
                    return;
                }
                analyzeLexerRules(state, false, memo);
            }
        }
    }
}
var LexerImpl = /** @class */ (function () {
    function LexerImpl(rules) {
        this.rules = rules;
        this.states = [this.rules];
        analyzeLexerRules(rules, true);
    }
    LexerImpl.prototype.parse = function (input) {
        return this.parseNextAvailable(input, 0, 1, 1);
    };
    LexerImpl.prototype.parseNext = function (input, indexStart, rowBegin, columnBegin) {
        if (indexStart === input.length) {
            return undefined;
        }
        var subString = input.substr(indexStart);
        var result;
        var currentRuleset = this.states[this.states.length - 1];
        var nextState;
        for (var _i = 0, currentRuleset_1 = currentRuleset; _i < currentRuleset_1.length; _i++) {
            var _a = currentRuleset_1[_i], keep = _a[0], regexp = _a[1], kind = _a[2], next = _a[3];
            regexp.lastIndex = 0;
            if (regexp.test(subString)) {
                var text = subString.substr(0, regexp.lastIndex);
                var rowEnd = rowBegin;
                var columnEnd = columnBegin;
                for (var _b = 0, text_1 = text; _b < text_1.length; _b++) {
                    var c = text_1[_b];
                    switch (c) {
                        case '\r': break;
                        case '\n':
                            rowEnd++;
                            columnEnd = 1;
                            break;
                        default: columnEnd++;
                    }
                }
                var newResult = new TokenImpl(this, input, kind, text, { index: indexStart, rowBegin: rowBegin, columnBegin: columnBegin, rowEnd: rowEnd, columnEnd: columnEnd }, keep);
                if (result === undefined || result.text.length < newResult.text.length) {
                    result = newResult;
                    nextState = next;
                }
            }
        }
        if (result === undefined) {
            throw new TokenError({ index: indexStart, rowBegin: rowBegin, columnBegin: columnBegin, rowEnd: rowBegin, columnEnd: columnBegin }, "Unable to tokenize the rest of the input: " + input.substr(indexStart));
        }
        else {
            if (nextState === 'pop') {
                this.states.pop();
            }
            else if (nextState === 'push') {
                this.states.push(currentRuleset);
            }
            else if (nextState !== undefined) {
                this.states.push(nextState);
            }
            return result;
        }
    };
    LexerImpl.prototype.parseNextAvailable = function (input, index, rowBegin, columnBegin) {
        var token;
        while (true) {
            token = this.parseNext(input, (token === undefined ? index : token.pos.index + token.text.length), (token === undefined ? rowBegin : token.pos.rowEnd), (token === undefined ? columnBegin : token.pos.columnEnd));
            if (token === undefined) {
                return undefined;
            }
            else if (token.keep) {
                return token;
            }
        }
    };
    return LexerImpl;
}());
function buildLexer(rules) {
    return new LexerImpl(rules);
}
exports.buildLexer = buildLexer;
// TESTING
var statements = [];
var stringLiteral = [];
statements.push([true, /^"/g, "stringDelimiter", stringLiteral]);
stringLiteral.push([true, /^\${/g, "stringInterpolationDelimiter", statements]);
buildLexer(statements);
//# sourceMappingURL=Lexer.js.map