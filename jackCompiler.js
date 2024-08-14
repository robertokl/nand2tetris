const fs = require('node:fs/promises');
const { type } = require('node:os');
const path = require('node:path');

class JackTokenizer {
    keywords = new Set(["class", "constructor", "function", "method", "field", "static", "var", "int", "char",
        "boolean", "void", "true", "false", "null", "this", "let", "do", "if", "else", "while", "return", "refreshScreen"]);
    symbols = new Set(["{", "}", "(", ")", "[", "]", ".", ",", ";", "+", "-", "*",
        "/", "&", "|", ">", "<", "=", "~", "%", "<<", ">>"]);
    static types = {
        KEYWORD: "KEYWORD",
        SYMBOL: "SYMBOL",
        IDENTIFIER: "IDENTIFIER",
        INT_CONST: "INT_CONST",
        STRING_CONST: "STRING_CONST",
    };

    constructor(filename, file) {
        this.filename = filename;
        this.file = file;
        this.fileLine = 0;
        this.atToken = -1;
        this.tokens = [];
    }

    async tokenize() {
        try {
            let commentBlock = false;
            for await (let line of this.file.readLines()) {
                this.fileLine++;
                line = line.trim();
                if (line.length === 0 || line.substring(0, 2) === "//") continue;
                if (commentBlock || line.substring(0, 2) === "/*") {
                    commentBlock = true;
                    if (line.substring(line.length - 2) === "*/") commentBlock = false;
                    continue;
                }
                let startAt = 0;
                while (startAt < line.length) {
                    const token = this.findNextToken(line, startAt);
                    if (token === null) {
                        startAt = line.length;
                        continue;
                    };
                    startAt = token.curr;
                    token.token.lineNumber = this.fileLine;
                    token.token.line = line;
                    this.tokens.push(token.token);
                }
            }
        } catch (e) {
            e.message = `Line ${this.fileLine} - ` + e.message
            throw e;
        }
    }

    hasMoreTokens() {
        return this.atToken < this.tokens.length - 1;
    }

    advance() {
        return this.atToken++;
    }

    token() {
        return this.tokens[this.atToken];
    }

    findNextSymbolToken(line, startAt) {
        let i = 1;
        let symb = line[startAt];
        while (this.symbols.has(symb + line[startAt + i])) {
            symb += line[startAt + i];
        }
        return { token: new Token(symb, JackTokenizer.types.SYMBOL), curr: startAt + symb.length }
    }

    findNextConstToken(line, startAt, regex) {
        let curr = startAt, token = "";
        while (line[curr].match(regex)) {
            token += line[curr];
            curr++;
            if (curr >= line.length - 1) break;
        }
        return { token, curr };
    }

    findNextToken(line, startAt) {
        let curr = startAt
        while (line[curr] === " " || line[curr] === "\t") {
            curr++;
            if (curr >= line.length) return null;
        }
        if (line[curr] === "/" && line[curr + 1] === "/") return null;
        if (this.symbols.has(line[curr])) {
            return this.findNextSymbolToken(line, curr);
        } else if (line[curr].match(/[0-9]/)) {
            const token = this.findNextConstToken(line, curr, /[0-9]/);
            return { token: new Token(token.token, JackTokenizer.types.INT_CONST), curr: token.curr }
        } else if (line[curr].match(/[a-zA-Z_]/)) {
            const token = this.findNextConstToken(line, curr, /[a-zA-Z0-9_]/);
            const type = this.keywords.has(token.token) ? JackTokenizer.types.KEYWORD : JackTokenizer.types.IDENTIFIER;
            return { token: new Token(token.token, type), curr: token.curr }
        }
        else if (line[curr] === "\"") {
            const token = this.findNextConstToken(line, curr + 1, /[^\"]/);
            if (line[token.curr] !== "\"") {
                throw new Error(`Expected to close string literal ${curr}: "${line}"`);
            }
            return { token: new Token(token.token, JackTokenizer.types.STRING_CONST), curr: token.curr + 1 }
        }
        const err = line.substring(0, curr) + " >" + line[curr] + "< " + line.substring(curr + 1, line.length);
        throw new Error(`Unknown token on pos ${curr}: "${err}"`);
    }
}

class Token {
    constructor(token, type, lineNumber, line) {
        this.token = token;
        this.type = type;
        this.lineNumber = lineNumber;
        this.line = line;
    }

    tokenByType(type) {
        if (this.type !== type) throw new Error(`Not a ${type} type (type: ${this.type})`);
        return this.token;
    }

    keyword() {
        return this.tokenByType(JackTokenizer.types.KEYWORD);
    }

    symbol() {
        return this.tokenByType(JackTokenizer.types.SYMBOL);
    }

    identifier() {
        return this.tokenByType(JackTokenizer.types.IDENTIFIER);
    }

    intVal() {
        return this.tokenByType(JackTokenizer.types.INT_CONST) * 1;
    }

    stringVal() {
        return this.tokenByType(JackTokenizer.types.STRING_CONST);
    }
}

class CompilationEngine {
    operators = new Set(["+", "-", "*", "/", "&", "|", ">", "<", "=", "%"]);

    constructor(jackTokenizer) {
        this.tokenizer = jackTokenizer;
        this.compiled = [];
        this.className = "";
        this.uniqCounter = 1;
        this.subroutineClass = "";
    }

    t() {
        return this.tokenizer.token();
    }

    validate(type, val) {
        if (this.t().type !== type)
            throw new Error(`Unexpected '${this.t().type}, ${this.t().token}', expected '${type}, ${val}' (line (${this.t().lineNumber}): "${this.t().line}")`);
        if (val && !val.includes(this.t().token))
            throw new Error(`Unexpected '${this.t().token}', expected '${val}' (line (${this.t().lineNumber}): "${this.t().line}")`);
    }

    compile() {
        this.compileClass();
    }

    compileClass() {
        this.validate(JackTokenizer.types.KEYWORD, ["class"]);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.IDENTIFIER);
        this.className = this.t().token;
        this.symbolTable = new SymbolTable(this.className);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["{"])
        this.tokenizer.advance();
        const varCountByKind = this.compileClassVarDec();
        this.compileSubroutineDec(varCountByKind["field"]);
        this.validate(JackTokenizer.types.SYMBOL, ["}"])
        this.tokenizer.advance();
    }

    compileClassVarDec() {
        const varCountByKind = { field: 0, static: 0 };
        while (this.t().type === JackTokenizer.types.KEYWORD && ["field", "static"].includes(this.t().keyword())) {
            this.validate(JackTokenizer.types.KEYWORD, ["field", "static"]);
            const kind = this.t().token;
            this.tokenizer.advance();
            const varCount = this.compileVarList(kind);
            varCountByKind[kind] += varCount;
        }
        return varCountByKind;
    }

    compileVarList(kind) {
        let varCount = 1;
        if (this.t().type === JackTokenizer.types.KEYWORD) {
            this.validate(JackTokenizer.types.KEYWORD, ["int", "boolean", "char"]);
        }
        const type = this.t().token;
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.IDENTIFIER);
        const varName = this.t().token;
        this.symbolTable.define(varName, type, kind);
        this.tokenizer.advance();
        while (this.t().symbol() === ",") {
            this.validate(JackTokenizer.types.SYMBOL, [","]);
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            const varName = this.t().token;
            this.symbolTable.define(varName, type, kind);
            this.tokenizer.advance();
            varCount++;
        }
        this.validate(JackTokenizer.types.SYMBOL, [";"])
        this.tokenizer.advance();
        return varCount;
    }

    compileSubroutineDec(fieldVarCount) {
        while (this.t().type === JackTokenizer.types.KEYWORD && ["function", "constructor", "method"].includes(this.t().keyword())) {
            this.validate(JackTokenizer.types.KEYWORD, ["function", "constructor", "method"]);
            this.subroutineClass = this.t().token;
            this.tokenizer.advance();
            if (this.t().type === JackTokenizer.types.KEYWORD) {
                this.validate(JackTokenizer.types.KEYWORD, ["int", "boolean", "char", "void"]);
            }
            const subroutineType = this.t().token;
            this.symbolTable.startSubroutine(this.subroutineClass, subroutineType);
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            const subroutineName = this.t().token;
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.SYMBOL, "(");
            this.tokenizer.advance();
            this.compileParametersList();
            this.validate(JackTokenizer.types.SYMBOL, ")");
            this.tokenizer.advance();
            this.compiled.push(`function ${this.className}.${subroutineName} `);
            const idxToUpdate = this.compiled.length - 1;
            if (fieldVarCount > 0 && this.subroutineClass === "constructor") {
                this.compiled.push(`push constant ${fieldVarCount}`);
                this.compiled.push(`call Memory.alloc 1`);
                this.compiled.push(`pop pointer 0`);
            } else if (this.subroutineClass === "method") {
                this.compiled.push(`push argument 0`);
                this.compiled.push(`pop pointer 0`);
            }
            const varCount = this.compileSubroutineBody();
            this.compiled[idxToUpdate] += varCount;
        }
    }

    compileParametersList() {
        let paramCount = 0;
        while ([JackTokenizer.types.IDENTIFIER, JackTokenizer.types.KEYWORD].includes(this.t().type)) {
            if (this.t().type === JackTokenizer.types.KEYWORD) {
                this.validate(JackTokenizer.types.KEYWORD, ["int", "boolean", "char"]);
            }
            const type = this.t().token;
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            const varName = this.t().token;
            this.tokenizer.advance();
            this.symbolTable.define(varName, type, SymbolTable.KINDS.arg);
            paramCount++;
            if (this.t().symbol() === ",") {
                this.validate(JackTokenizer.types.SYMBOL, ",");
                this.tokenizer.advance();
                paramCount++;
            }
        }
        return paramCount;
    }

    compileSubroutineBody() {
        this.hasReturn = false;
        let varCount = 0;
        this.validate(JackTokenizer.types.SYMBOL, "{");
        this.tokenizer.advance();
        while (this.t().token === "var") {
            varCount += this.compileVarDec();
        }
        this.compileStatements();
        this.validate(JackTokenizer.types.SYMBOL, "}");
        if (!this.hasReturn) {
            throw new Error(`Return statement expected on ${this.className} line ${this.t().lineNumber}.`);
        }
        this.tokenizer.advance();
        return varCount;
    }

    compileVarDec() {
        this.validate(JackTokenizer.types.KEYWORD, ["var"]);
        const kind = this.t().token;
        this.tokenizer.advance();
        return this.compileVarList(kind);
    }

    compileStatements() {
        while ((["let", "while", "if", "do", "return", "refreshScreen"]).includes(this.t().token)) {
            this.compileStatement();
        }
    }

    compileStatement() {
        const fn = "compile" + this.t().token[0].toUpperCase() + this.t().token.substring(1) + "Statement";
        if (!this[fn]) throw new Error(`Unknown ${fn} statement`);
        this[fn].call(this);
    }

    compileRefreshScreenStatement() {
        this.validate(JackTokenizer.types.KEYWORD, ["refreshScreen"]);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["("]);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, [")"]);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, [";"]);
        this.compiled.push(`refreshScreen`);
        this.tokenizer.advance();
    }

    compileLetStatement() {
        this.validate(JackTokenizer.types.KEYWORD, ["let"]);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.IDENTIFIER);
        const varName = this.t().token;
        const variable = this.symbolTable.findVar(varName);
        if (!variable) throw new Error(`Unknown identifier '${varName}' (${this.className}#${this.t().lineNumber}).`);
        this.tokenizer.advance();
        if (this.t().token === "[") {
            this.compiled.push(`push ${variable.vmKind} ${variable.index}`);
            this.validate(JackTokenizer.types.SYMBOL, ["["]);
            this.tokenizer.advance();
            this.compileExpression();
            this.validate(JackTokenizer.types.SYMBOL, ["]"]);
            this.tokenizer.advance();
            this.compiled.push(`add`);
            this.validate(JackTokenizer.types.SYMBOL, ["="]);
            this.tokenizer.advance();
            this.compileExpression()
            this.validate(JackTokenizer.types.SYMBOL, ";");
            this.tokenizer.advance();
            this.compiled.push(`pop temp 0`);
            this.compiled.push(`pop pointer 1`);
            this.compiled.push(`push temp 0`);
            this.compiled.push(`pop that 0`);
        } else {
            this.validate(JackTokenizer.types.SYMBOL, ["="]);
            this.tokenizer.advance();
            this.compileExpression()
            this.validate(JackTokenizer.types.SYMBOL, ";");
            this.tokenizer.advance();
            this.compiled.push(`pop ${variable.vmKind} ${variable.index}`);
        }
    }

    compileExpressionList() {
        let expCount = 0;
        if (this.t().token !== ")") {
            this.compileExpression();
            expCount++;
            while (this.t().token === ",") {
                this.validate(JackTokenizer.types.SYMBOL, [","]);
                this.tokenizer.advance();
                this.compileExpression();
                expCount++;
            }
        }
        return expCount;
    }

    compileExpression() {
        this.compileTerm();
        while (this.t().type === JackTokenizer.types.SYMBOL && this.operators.has(this.t().token)) {
            this.validate(JackTokenizer.types.SYMBOL);
            const op = this.t().token;
            this.tokenizer.advance();
            this.compileTerm();
            this.compiled.push(this.tranlasteOperation(op));
        }
    }

    tranlasteOperation(op) {
        switch (op) {
            case "+":
                return "add";
            case "-":
                return "sub";
            case "*":
                return "call Math.multiply 2";
            case "/":
                return "call Math.divide 2";
            case "%":
                return "call Math.mod 2";
            case "&":
                return "and";
            case "|":
                return "or";
            case ">":
                return "gt";
            case "<":
                return "lt";
            case "=":
                return "eq";
        }
    }

    compileTerm() {
        if (this.t().token === "(") {
            this.validate(JackTokenizer.types.SYMBOL, ["("]);
            this.tokenizer.advance();
            this.compileExpression();
            this.validate(JackTokenizer.types.SYMBOL, [")"]);
            this.tokenizer.advance();
            return;
        }
        if (["-", "~", "<<", ">>"].includes(this.t().token)) {
            this.validate(JackTokenizer.types.SYMBOL, ["-", "~", "<<", ">>"]);
            const op = this.t().token;
            this.tokenizer.advance();
            this.compileTerm();
            switch (op) {
                case "-":
                    this.compiled.push("neg");
                    break;
                case "~":
                    this.compiled.push("not");
                    break;
                case "<<":
                    this.compiled.push("shiftl");
                    break;
                case ">>":
                    this.compiled.push("shiftr");
                    break;
            }
            return;
        }
        if (this.t().type === JackTokenizer.types.INT_CONST) {
            this.compiled.push(`push constant ${this.t().token}`);
            this.tokenizer.advance();
            return;
        }
        if (this.t().type === JackTokenizer.types.STRING_CONST) {
            const t = this.t().token;
            this.compiled.push(`push constant ${t.length}`);
            this.compiled.push(`call String.new 1`);
            for (let i = 0; i < t.length; i++) {
                this.compiled.push(`push constant ${t.charCodeAt(i)}`);
                this.compiled.push(`call String.appendChar 2`);
            }
            this.tokenizer.advance();
            return;
        }
        if (this.t().type === JackTokenizer.types.KEYWORD) {
            switch (this.t().token) {
                case "true":
                    this.compiled.push(`push constant 0`);
                    this.compiled.push(`not`);
                    break;
                case "false":
                case "null":
                    this.compiled.push(`push constant 0`);
                    break;
                case "this":
                    this.compiled.push(`push pointer 0`);
                    break;
            }
            this.tokenizer.advance();
            return;
        }
        const prev = this.t();
        this.tokenizer.advance();
        if (this.t().token === ".") {
            this.validate(JackTokenizer.types.SYMBOL, ["."]);
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            let className = prev.token;
            const fnName = this.t().token;
            const symbol = this.symbolTable.findVar(className);
            let paramsCount = 0;
            if (symbol) { // Call to a method on an object;
                paramsCount = 1;
                this.compiled.push(`push ${symbol.vmKind} ${symbol.index}`);
                className = symbol.type;
            }
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.SYMBOL, ["("]);
            this.tokenizer.advance();
            paramsCount += this.compileExpressionList();
            this.validate(JackTokenizer.types.SYMBOL, [")"]);
            this.tokenizer.advance();
            this.compiled.push(`call ${className}.${fnName} ${paramsCount}`);
            return;
        }
        if (this.t().token === "[") {
            const arr = this.symbolTable.findVar(prev.token);
            if (!arr) throw new Error(`Unknown identifier '${prev.token}'.`);
            this.validate(JackTokenizer.types.SYMBOL, ["["]);
            this.tokenizer.advance();
            this.compiled.push(`push ${arr.vmKind} ${arr.index}`);
            this.compileExpression();
            this.validate(JackTokenizer.types.SYMBOL, ["]"]);
            this.tokenizer.advance();
            this.compiled.push(`add`);
            this.compiled.push(`pop pointer 1`);
            this.compiled.push(`push that 0`);
            return;
        }
        if (this.t().token === "(") {
            this.validate(JackTokenizer.types.SYMBOL, ["("]);
            this.tokenizer.advance();
            let paramsCount = 0;
            if (this.subroutineClass === "method" || this.subroutineClass === "constructor") {
                this.compiled.push(`push pointer 0`);
                paramsCount++;
            }
            paramsCount += this.compileExpressionList();
            this.validate(JackTokenizer.types.SYMBOL, [")"]);
            this.tokenizer.advance();
            this.compiled.push(`call ${this.className}.${prev.token} ${paramsCount}`);
            return;
        }
        if (prev.type === JackTokenizer.types.IDENTIFIER) {
            const varName = prev.token;
            const variable = this.symbolTable.findVar(varName);
            if (!variable) throw new Error(`Unknown identifier "${varName}" (${this.className}#${this.t().lineNumber})`);
            this.compiled.push(`push ${variable.vmKind} ${variable.index}`);
            return;
        }
    }

    compileDoStatement() {
        this.validate(JackTokenizer.types.KEYWORD, ["do"]);
        this.tokenizer.advance();
        // this.validate(JackTokenizer.types.IDENTIFIER);
        let fnName = this.t().token;
        this.tokenizer.advance();
        let parameterCount = 0;
        if (this.t().token === ".") {
            this.validate(JackTokenizer.types.SYMBOL, ".");
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            const symbol = this.symbolTable.findVar(fnName);
            if (symbol) { // Call to a method on an object;
                parameterCount = 1;
                this.compiled.push(`push ${symbol.vmKind} ${symbol.index}`);
                fnName = symbol.type;
            }
            fnName = `${fnName}.${this.t().token}`;
            this.tokenizer.advance();
        } else {
            if (this.subroutineClass === "method" || this.subroutineClass === "constructor") {
                parameterCount = 1;
                this.compiled.push(`push pointer 0`);
            }
            fnName = `${this.className}.${fnName}`;
        }
        this.validate(JackTokenizer.types.SYMBOL, "(");
        this.tokenizer.advance();
        parameterCount += this.compileExpressionList();
        this.validate(JackTokenizer.types.SYMBOL, ")");
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ";");
        this.compiled.push(`call ${fnName} ${parameterCount}`);
        this.compiled.push(`pop temp 0`);
        this.tokenizer.advance();
    }

    compileReturnStatement() {
        this.validate(JackTokenizer.types.KEYWORD, ["return"]);
        this.hasReturn = true;
        this.tokenizer.advance();
        if (this.t().token !== ";") {
            this.compileExpression();
        } else {
            this.compiled.push("push constant 0");
        }
        this.validate(JackTokenizer.types.SYMBOL, [";"]);
        this.compiled.push("return");
        this.tokenizer.advance();
    }

    compileIfStatement() {
        const counter = this.uniqCounter++;
        const endLabelName = `${this.className}.ifEnd$${counter}`;
        const falseLabelName = `${this.className}.ifFalse$${counter}`;
        this.validate(JackTokenizer.types.KEYWORD, ["if"]);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["("]);
        this.tokenizer.advance();
        this.compileExpression();
        this.validate(JackTokenizer.types.SYMBOL, [")"]);
        this.tokenizer.advance();
        this.compiled.push(`not`);
        this.compiled.push(`if-goto ${falseLabelName}`);
        this.validate(JackTokenizer.types.SYMBOL, ["{"]);
        this.tokenizer.advance();
        this.compileStatements();
        this.validate(JackTokenizer.types.SYMBOL, ["}"]);
        this.tokenizer.advance();
        this.compiled.push(`goto ${endLabelName}`);
        this.compiled.push(`label ${falseLabelName}`);
        if (this.t().token === "else") {
            this.validate(JackTokenizer.types.KEYWORD, ["else"]);
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.SYMBOL, ["{"]);
            this.tokenizer.advance();
            this.compileStatements();
            this.validate(JackTokenizer.types.SYMBOL, ["}"]);
            this.tokenizer.advance();
        }
        this.compiled.push(`label ${endLabelName}`);
    }

    compileWhileStatement() {
        this.validate(JackTokenizer.types.KEYWORD, ["while"]);
        const counter = this.uniqCounter++;
        const beginLabelName = `${this.className}.while$${counter}`;
        const endLabelName = `${this.className}.whileEnd$${counter}`;
        this.compiled.push(`label ${beginLabelName}`);
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["("]);
        this.tokenizer.advance();
        this.compileExpression();
        this.validate(JackTokenizer.types.SYMBOL, [")"]);
        this.tokenizer.advance();
        this.compiled.push("not");
        this.compiled.push(`if-goto ${endLabelName}`);
        this.validate(JackTokenizer.types.SYMBOL, ["{"]);
        this.tokenizer.advance();
        this.compileStatements();
        this.validate(JackTokenizer.types.SYMBOL, ["}"]);
        this.tokenizer.advance();
        this.compiled.push(`goto ${beginLabelName}`);
        this.compiled.push(`label ${endLabelName}`);
    }
}

class SymbolTable {
    static KINDS = { static: "static", field: "field", arg: "arg", var: "var" };

    constructor(className) {
        this.className = className;
        this.classVars = { [SymbolTable.KINDS.static]: {}, [SymbolTable.KINDS.field]: {} }
        this.startSubroutine();
    }

    startSubroutine(subroutineClass, subroutineType) {
        let args = {};
        if (subroutineClass === "method") { // Making space for "this" argument on methods.
            args = { this: { type: this.className, kind: subroutineClass, vmKind: "argument", index: 0 } };
        }
        this.subroutineVars = { [SymbolTable.KINDS.var]: {}, [SymbolTable.KINDS.arg]: args };
    }

    define(name, type, kind) {
        if (this.findVar(name)) {
            throw new Error(`Var "${name}" already defined.`);
        }
        const vars = this.varTypeByKind(kind);
        const vmKind = (() => {
            switch (kind) {
                case "var":
                    return "local";
                case "arg":
                    return "argument";
                case "field":
                    return "this";
                case "static":
                    return "static";
            }
        })();
        vars[kind][name] = { type, kind, vmKind, index: this.varCount(kind) };
    }

    varTypeByKind(kind) {
        switch (kind) {
            case SymbolTable.KINDS.static:
            case SymbolTable.KINDS.field:
                return this.classVars;
            case SymbolTable.KINDS.arg:
            case SymbolTable.KINDS.var:
                return this.subroutineVars;
        }
    }

    varCount(kind) {
        return Object.keys(this.varTypeByKind(kind)[kind]).length;
    }

    findVar(varName) {
        for (const kind of [SymbolTable.KINDS.var, SymbolTable.KINDS.arg, SymbolTable.KINDS.field, SymbolTable.KINDS.static]) {
            const v = this.varTypeByKind(kind)[kind][varName];
            if (v) return v;
        }
        return null;
    }
}

(async () => {
    let input = process.argv[2];
    input = path.resolve(input);
    const isDir = (await fs.stat(input)).isDirectory();
    let files;
    if (isDir) {
        files = (await fs.readdir(input)).filter((f) => f.match(/.+\.jack$/)).map((f) => path.resolve(input, f));
    } else {
        files = [input];
    }
    let out;
    try {
        for (const file of files) {
            const outputFilename = path.join(path.dirname(file), path.basename(file).replace(".jack", ".vm"));
            out = await fs.open(outputFilename, "w");
            const tokenizer = new JackTokenizer(path.basename(file), await fs.open(file));
            await tokenizer.tokenize();
            const compiler = new CompilationEngine(tokenizer);
            tokenizer.advance();
            compiler.compile();
            out.write(compiler.compiled.join("\n"));
            out.close();
            // console.log(compiler.compiled.join("\n"));
        }
    } finally {
        out.close();
    }
})().catch((e) => console.error(e.stack));