const fs = require('node:fs/promises');
const path = require('node:path');

class JackTokenizer {
    keywords = new Set(["class", "constructor", "function", "method", "field", "static", "var", "int", "char",
        "boolean", "void", "true", "false", "null", "this", "let", "do", "if", "else", "while", "return"]);
    symbols = new Set(["{", "}", "(", ")", "[", "]", ".", ",", ";", "+", "-", "*", "/", "&", "|", ">", "<", "=", "~"]);
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
        return { token: new Token(line[startAt], JackTokenizer.types.SYMBOL), curr: startAt + 1 }
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
        while (line[curr] === " ") {
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
            const token = this.findNextConstToken(line, curr, /[a-zA-Z_]/);
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

    toXml() {
        let xml = "<tokens>\n";
        for (const token of this.tokens) {
            xml += token.toXml();
        }
        xml += "</tokens>\n";
        return xml;
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

    toXml() {
        let type, token;
        switch (this.type) {
            case JackTokenizer.types.STRING_CONST:
                type = "stringConstant";
                break;
            case JackTokenizer.types.INT_CONST:
                type = "integerConstant";
                break;
            default:
                type = this.type.toLowerCase()
        }
        switch (this.token) {
            case "<":
                token = "&lt;"
                break;
            case ">":
                token = "&gt;"
                break;
            case "&":
                token = "&amp;"
                break;
            case "\"":
                token = "&quot;"
                break;
            default:
                token = this.token;
        }
        return `<${type}> ${token} </${type}>\n`;
    }
}

class CompilationEngine {
    operators = new Set(["+", "-", "*", "/", "&", "|", ">", "<", "="]);

    constructor(jackTokenizer) {
        this.tokenizer = jackTokenizer;
        this.xml = "";
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

    compileToken() {
        this.xml += this.t().toXml();
    }

    compile() {
        this.compileClass();
    }

    compileClass() {
        this.validate(JackTokenizer.types.KEYWORD, ["class"]);
        this.xml += "<class>\n";
        this.compileToken()
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.IDENTIFIER);
        this.compileToken()
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["{"])
        this.compileToken()
        this.tokenizer.advance();
        this.compileClassVarDec();
        this.compileSubroutineDec();
        this.validate(JackTokenizer.types.SYMBOL, ["}"])
        this.compileToken()
        this.tokenizer.advance();
        this.xml += "</class>\n";
    }

    compileClassVarDec() {
        while (this.t().type === JackTokenizer.types.KEYWORD && ["field", "static"].includes(this.t().keyword())) {
            this.xml += "<classVarDec>\n";
            this.validate(JackTokenizer.types.KEYWORD, ["field", "static"]);
            this.compileToken();
            this.tokenizer.advance();
            this.compileVarList();
            this.xml += "</classVarDec>\n";
        }
    }

    compileVarList() {
        if (this.t().type === JackTokenizer.types.KEYWORD) {
            this.validate(JackTokenizer.types.KEYWORD, ["int", "boolean", "char"]);
        }
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.IDENTIFIER);
        this.compileToken();
        this.tokenizer.advance();
        while (this.t().symbol() === ",") {
            this.validate(JackTokenizer.types.SYMBOL, [","]);
            this.compileToken();
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            this.compileToken();
            this.tokenizer.advance();
        }
        this.validate(JackTokenizer.types.SYMBOL, [";"])
        this.compileToken();
        this.tokenizer.advance();
    }

    compileSubroutineDec() {
        while (this.t().type === JackTokenizer.types.KEYWORD && ["function", "constructor", "method"].includes(this.t().keyword())) {
            this.xml += "<subroutineDec>\n";
            this.validate(JackTokenizer.types.KEYWORD, ["function", "constructor", "method"]);
            this.compileToken();
            this.tokenizer.advance();
            if (this.t().type === JackTokenizer.types.KEYWORD) {
                this.validate(JackTokenizer.types.KEYWORD, ["int", "boolean", "char", "void"]);
            }
            this.compileToken();
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            this.compileToken();
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.SYMBOL, "(");
            this.compileToken();
            this.tokenizer.advance();
            this.compileParametersList();
            this.validate(JackTokenizer.types.SYMBOL, ")");
            this.compileToken();
            this.tokenizer.advance();
            this.compileSubroutineBody();
            this.xml += "</subroutineDec>\n";
        }
    }

    compileParametersList() {
        this.xml += "<parameterList>\n";
        while ([JackTokenizer.types.IDENTIFIER, JackTokenizer.types.KEYWORD].includes(this.t().type)) {
            if (this.t().type === JackTokenizer.types.KEYWORD) {
                this.validate(JackTokenizer.types.KEYWORD, ["int", "boolean", "char"]);
            }
            this.compileToken();
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            this.compileToken();
            this.tokenizer.advance();
            if (this.t().symbol() === ",") {
                this.validate(JackTokenizer.types.SYMBOL, ",");
                this.compileToken();
                this.tokenizer.advance();
            }
        }
        this.xml += "</parameterList>\n";
    }

    compileSubroutineBody() {
        this.xml += "<subroutineBody>\n";
        this.validate(JackTokenizer.types.SYMBOL, "{");
        this.compileToken();
        this.tokenizer.advance();
        while (this.t().token === "var") {
            this.compileVarDec();
        }
        this.compileStatements();
        this.validate(JackTokenizer.types.SYMBOL, "}");
        this.compileToken();
        this.tokenizer.advance();
        this.xml += "</subroutineBody>\n";
    }

    compileVarDec() {
        this.xml += "<varDec>\n";
        this.validate(JackTokenizer.types.KEYWORD, ["var"]);
        this.compileToken();
        this.tokenizer.advance();
        this.compileVarList();
        this.xml += "</varDec>\n";
    }

    compileStatements() {
        this.xml += "<statements>\n";
        while ((["let", "while", "if", "do", "return"]).includes(this.t().token)) {
            this.compileStatement();
        }
        this.xml += "</statements>\n";
    }

    compileStatement() {
        const fn = "compile" + this.t().token[0].toUpperCase() + this.t().token.substring(1) + "Statement";
        if (!this[fn]) throw new Error(`Unknown ${fn} statement`);
        this[fn].call(this);
    }

    compileLetStatement() {
        this.xml += "<letStatement>\n";
        this.validate(JackTokenizer.types.KEYWORD, ["let"]);
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.IDENTIFIER);
        this.compileToken();
        this.tokenizer.advance();
        if (this.t().token === "[") {
            this.validate(JackTokenizer.types.SYMBOL, ["["]);
            this.compileToken();
            this.tokenizer.advance();
            this.compileExpression();
            this.validate(JackTokenizer.types.SYMBOL, ["]"]);
            this.compileToken();
            this.tokenizer.advance();
        }
        this.validate(JackTokenizer.types.SYMBOL, ["="]);
        this.compileToken();
        this.tokenizer.advance();
        this.compileExpression()
        this.validate(JackTokenizer.types.SYMBOL, ";");
        this.compileToken();
        this.tokenizer.advance();
        this.xml += "</letStatement>\n";
    }

    compileExpressionList() {
        this.xml += "<expressionList>\n";
        if (this.t().token !== ")") {
            this.compileExpression();
            while (this.t().token === ",") {
                this.validate(JackTokenizer.types.SYMBOL, [","]);
                this.compileToken();
                this.tokenizer.advance();
                this.compileExpression();
            }
        }
        this.xml += "</expressionList>\n";
    }

    compileExpression() {
        this.xml += "<expression>\n";
        this.compileTerm();
        while (this.t().type === JackTokenizer.types.SYMBOL && this.operators.has(this.t().token)) {
            this.validate(JackTokenizer.types.SYMBOL);
            this.compileToken();
            this.tokenizer.advance();
            this.compileTerm();
        }
        this.xml += "</expression>\n";
    }

    compileTerm() {
        this.xml += "<term>\n";
        if (this.t().token === "(") {
            this.validate(JackTokenizer.types.SYMBOL, ["("]);
            this.compileToken();
            this.tokenizer.advance();
            this.compileExpression();
            this.validate(JackTokenizer.types.SYMBOL, [")"]);
            this.compileToken();
            this.tokenizer.advance();
        } else if (["-", "~"].includes(this.t().token)) {
            this.validate(JackTokenizer.types.SYMBOL, ["-", "~"]);
            this.compileToken();
            this.tokenizer.advance();
            this.compileTerm();
        } else {
            this.compileToken();
            this.tokenizer.advance();
            if (this.t().token === ".") {
                this.validate(JackTokenizer.types.SYMBOL, ["."]);
                this.compileToken();
                this.tokenizer.advance();
                this.validate(JackTokenizer.types.IDENTIFIER);
                this.compileToken();
                this.tokenizer.advance();
                this.validate(JackTokenizer.types.SYMBOL, ["("]);
                this.compileToken();
                this.tokenizer.advance();
                this.compileExpressionList();
                this.validate(JackTokenizer.types.SYMBOL, [")"]);
                this.compileToken();
                this.tokenizer.advance();
            }
            if (this.t().token === "[") {
                this.validate(JackTokenizer.types.SYMBOL, ["["]);
                this.compileToken();
                this.tokenizer.advance();
                this.compileExpression();
                this.validate(JackTokenizer.types.SYMBOL, ["]"]);
                this.compileToken();
                this.tokenizer.advance();
            }
        }
        this.xml += "</term>\n";
    }

    compileDoStatement() {
        this.xml += "<doStatement>\n";
        this.validate(JackTokenizer.types.KEYWORD, ["do"]);
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.IDENTIFIER);
        this.compileToken();
        this.tokenizer.advance();
        if (this.t().token === ".") {
            this.validate(JackTokenizer.types.SYMBOL, ".");
            this.compileToken();
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.IDENTIFIER);
            this.compileToken();
            this.tokenizer.advance();
        }
        this.validate(JackTokenizer.types.SYMBOL, "(");
        this.compileToken();
        this.tokenizer.advance();
        this.compileExpressionList();
        this.validate(JackTokenizer.types.SYMBOL, ")");
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ";");
        this.compileToken();
        this.tokenizer.advance();
        this.xml += "</doStatement>\n";
    }

    compileReturnStatement() {
        this.xml += "<returnStatement>\n";
        this.validate(JackTokenizer.types.KEYWORD, ["return"]);
        this.compileToken();
        this.tokenizer.advance();
        if (this.t().token !== ";") {
            this.compileExpression();
        }
        this.validate(JackTokenizer.types.SYMBOL, [";"]);
        this.compileToken();
        this.tokenizer.advance();
        this.xml += "</returnStatement>\n";
    }

    compileIfStatement() {
        this.xml += "<ifStatement>\n";
        this.validate(JackTokenizer.types.KEYWORD, ["if"]);
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["("]);
        this.compileToken();
        this.tokenizer.advance();
        this.compileExpression();
        this.validate(JackTokenizer.types.SYMBOL, [")"]);
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["{"]);
        this.compileToken();
        this.tokenizer.advance();
        this.compileStatements();
        this.validate(JackTokenizer.types.SYMBOL, ["}"]);
        this.compileToken();
        this.tokenizer.advance();
        if (this.t().token === "else") {
            this.validate(JackTokenizer.types.KEYWORD, ["else"]);
            this.compileToken();
            this.tokenizer.advance();
            this.validate(JackTokenizer.types.SYMBOL, ["{"]);
            this.compileToken();
            this.tokenizer.advance();
            this.compileStatements();
            this.validate(JackTokenizer.types.SYMBOL, ["}"]);
            this.compileToken();
            this.tokenizer.advance();
        }
        this.xml += "</ifStatement>\n";
    }

    compileWhileStatement() {
        this.xml += "<whileStatement>\n";
        this.validate(JackTokenizer.types.KEYWORD, ["while"]);
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["("]);
        this.compileToken();
        this.tokenizer.advance();
        this.compileExpression();
        this.validate(JackTokenizer.types.SYMBOL, [")"]);
        this.compileToken();
        this.tokenizer.advance();
        this.validate(JackTokenizer.types.SYMBOL, ["{"]);
        this.compileToken();
        this.tokenizer.advance();
        this.compileStatements();
        this.validate(JackTokenizer.types.SYMBOL, ["}"]);
        this.compileToken();
        this.tokenizer.advance();
        this.xml += "</whileStatement>\n";
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
    let tOut, out;
    try {
        for (const file of files) {
            const tOutputFilename = path.join(path.dirname(file), path.basename(file).replace(".jack", "T-my.xml"));
            const outputFilename = path.join(path.dirname(file), path.basename(file).replace(".jack", "-my.xml"));
            tOut = await fs.open(tOutputFilename, "w");
            out = await fs.open(outputFilename, "w");
            const tokenizer = new JackTokenizer(path.basename(file), await fs.open(file));
            await tokenizer.tokenize();
            const compiler = new CompilationEngine(tokenizer);
            tokenizer.advance();
            compiler.compile();
            tOut.write(tokenizer.toXml());
            tOut.close();
            out.write(compiler.xml);
            out.close();
            console.log(tOutputFilename);
            console.log(outputFilename);
        }
    } finally {
        tOut.close();
        out.close();
    }
})().catch((e) => console.error(e.stack));