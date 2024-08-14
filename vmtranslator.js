const fs = require('node:fs/promises');
const path = require('node:path');

class Parser {
    static uniqNumber = 32768;

    constructor(filename, file) {
        this.filename = filename;
        this.file = file;
        this.fileLine = 0;
        this.parsedLines = [];
    }

    static async parse(filename, file) {
        const parser = new Parser(filename, file);
        await parser.parseAll()
        return parser;
    }

    async parseAll() {
        try {
            for await (let line of this.file.readLines()) {
                line = line.trim();
                if (line.length === 0 || line.substring(0, 2) === "//") continue;
                this.fileLine++;
                const l = Line.parse(line, this.fileLine, this.filename);
                this.parsedLines.push(l);
            }
        } catch (e) {
            e.message = `Line ${this.fileLine} - ` + e.message
            throw e;
        }
    }

    static setup() {
        const l = new Line("", this.fileLine);
        l.parsed = [
            `// Setup memory segments`,
            `@256 // Stack`,
            `D=A`,
            `@SP`,
            `M=D`,
            `@300 // LCL`,
            `D=A`,
            `@LCL`,
            `M=D`,
            `@400 // ARG`,
            `D=A`,
            `@ARG`,
            `M=D`,
            `@3000 // THIS`,
            `D=A`,
            `@THIS`,
            `M=D`,
            `@3010 // THAT`,
            `D=A`,
            `@THAT`,
            `M=D`,
            // ...Graphics.lettersTable(),
            ...Line.parse("call Sys.init 0", Parser.uniqNumber++, "Sys").parsed,
            ...Line.parse("label PROGRAMEND", Parser.uniqNumber++, "Sys").parsed,
            ...Line.parse("goto PROGRAMEND", Parser.uniqNumber++, "Sys").parsed,
            // ...Line.parse("function Sys.init 0", Parser.uniqNumber++, "Sys").parsed,
            // ...Line.parse("call Main.main 0", Parser.uniqNumber++, "Sys").parsed,
            // ...Line.parse("goto PROGRAMEND", Parser.uniqNumber++, "Sys").parsed,
            // ...Graphics.printLetter(),
            ``,
            `// Code starts`,
            ``
        ];
        return l;
    }

    
}

class Line {
    constructor(line, lineNumber, filename) {
        this.line = line;
        this.lineNumber = lineNumber;
        this.filename = filename;
        this.parsed = [];
    }

    static parse(line, lineNumber, filename) {
        const l = new Line(line, lineNumber, filename);
        l.parse();
        return l;
    }

    parse() {
        const commands = this.line.split(" ");
        let cmd = commands.shift();
        cmd = cmd.replace("-", "");
        const fn = this[cmd + "Parse"];
        if (!fn) throw new Error(`"${cmd}" not defined`);
        this.parsed = [
            `// ${this.line}`,
            ...fn.apply(this, commands)
        ];
    }

    refreshScreenParse() {
        return [
            `refreshscreen`,
        ];
    }

    shiftlParse() {
        return [
            `@SP`,
            `A=M-1`,
            `D=M`,
            `M=<<D`,
        ];
    }

    shiftrParse() {
        return [
            `@SP`,
            `A=M-1`,
            `D=M`,
            `M=>>D`,
        ];
    }

    pushParse(register, value) {
        const addr = this[register + "Address"].call(this, value);
        let valueFrom;
        switch (register) {
            case ("constant"):
                valueFrom = "A";
                break;
            default:
                valueFrom = "M";
        }
        return [
            ...addr,
            `D=${valueFrom}`,
            `@SP`,
            `M=M+1`,
            `A=M-1`,
            `M=D`,
        ];
    }

    popParse(register, value) {
        const addr = this[register + "Address"].call(this, value);
        if (register === "pointer") {
            return [
                `@SP`,
                `M=M-1`,
                `A=M`,
                `D=M`,
                ...addr,
                `M=D`,
            ]
        }
        return [
            ...addr,
            `D=A`,
            `@R13`,
            `M=D`,
            `@SP`,
            `M=M-1`,
            `A=M`,
            `D=M`,
            `@R13`,
            `A=M`,
            `M=D`,
        ];
    }

    constantAddress(value) {
        return [`@${value}`];
    }

    localAddress(value) {
        return this.defaultMemorySegmentAddress(value, `LCL`);
    }

    argumentAddress(value) {
        return this.defaultMemorySegmentAddress(value, `ARG`);
    }

    thisAddress(value) {
        return this.defaultMemorySegmentAddress(value, `THIS`);
    }

    thatAddress(value) {
        return this.defaultMemorySegmentAddress(value, `THAT`);
    }

    staticAddress(value) {
        const filename = this.filename.substring(0, this.filename.indexOf("."));
        return [`@${filename}.${value}`];
    }

    tempAddress(value) {
        return [
            `@${value}`,
            `D=A`,
            `@5`,
            `A=D+A`,
        ];
    }

    pointerAddress(value) {
        let addr = "THIS";
        if (value === "1") {
            addr = "THAT"
        }
        return [
            `@${addr}`,
        ];
    }

    defaultMemorySegmentAddress(value, mem) {
        return [
            `@${value}`,
            `D=A`,
            `@${mem}`,
            `A=M`,
            `A=D+A`,
        ];
    }

    addParse() {
        return this.arithmethicParse("M=D+M");
    }

    subParse() {
        return this.arithmethicParse("M=M-D");
    }

    arithmethicParse(op) {
        return [
            `@SP`,
            `M=M-1`,
            `A=M`,
            `D=M`,
            `@SP`,
            `A=M-1`,
            `${op}`,
        ];
    }

    notParse() {
        return [
            `@SP`,
            `A=M-1`,
            `M=!M`,
        ];
    }

    eqParse() {
        return this.booleanParse("JEQ");
    }

    ltParse() {
        return this.booleanParse("JLT");
    }

    gtParse() {
        return this.booleanParse("JGT");
    }

    booleanParse(op) {
        const classname = this.filename.substring(0, this.filename.indexOf("."));
        return [
            `@SP`,
            `M=M-1`,
            `A=M`,
            `D=M`,
            `@SP`,
            `M=M-1`,
            `A=M`,
            `D=M-D`,
            `@13`,
            `M=D`,
            `@${classname}.JUMPTRUE${this.lineNumber}`,
            `D;${op}`,
            `D=0`,
            `@${classname}.JUMPWRITE${this.lineNumber}`,
            `0;JMP`,
            `(${classname}.JUMPTRUE${this.lineNumber})`,
            `D=-1`,
            `(${classname}.JUMPWRITE${this.lineNumber})`,
            `@SP`,
            `A=M`,
            `M=D`,
            `@SP`,
            `M=M+1`,
        ];
    }

    andParse() {
        return this.arithmethicParse("M=D&M")
    }

    orParse() {
        return this.arithmethicParse("M=D|M")
    }

    negParse() {
        return [
            `@SP`,
            `A=M-1`,
            `M=M-1`,
            `M=!M`,
        ];
    }

    labelParse(value) {
        return [`(${value})`];
    }

    gotoParse(value) {
        return [
            `@${value}`,
            `0;JMP`,
        ];
    }

    ifgotoParse(value) {
        return [
            `@SP`,
            `M=M-1`,
            `A=M`,
            `D=M`,
            `@${value}`,
            `D;JNE`,
        ]
    }

    callParse(fnName, argCount) {
        const className = this.filename.substring(0, this.filename.indexOf("."));
        return [
            `@${className}.${fnName}$ret.${this.lineNumber}`,
            `D=A`,
            `@SP`,
            `M=M+1`,
            `A=M-1`,
            `M=D`,
            `@LCL`,
            `D=M`,
            `@SP`,
            `M=M+1`,
            `A=M-1`,
            `M=D`,
            `@ARG`,
            `D=M`,
            `@SP`,
            `M=M+1`,
            `A=M-1`,
            `M=D`,
            `@THIS`,
            `D=M`,
            `@SP`,
            `M=M+1`,
            `A=M-1`,
            `M=D`,
            `@THAT`,
            `D=M`,
            `@SP`,
            `M=M+1`,
            `A=M-1`,
            `M=D`,
            `@${argCount}`,
            `D=A`,
            `@5`,
            `D=D+A`,
            `@SP`,
            `D=M-D`,
            `@ARG`,
            `M=D`,
            `@SP`,
            `D=M`,
            `@LCL`,
            `M=D`,
            `@${fnName}`,
            `0;JMP`,
            `(${className}.${fnName}$ret.${this.lineNumber})`,
        ];
    }

    functionParse(fnName, localCount) {
        let ret = [
            `(${fnName})`,
        ];
        for (let index = 0; index < localCount; index++) {
            ret = [
                ...ret,
                `@SP`,
                `M=M+1`,
                `A=M-1`,
                `M=0`,
            ]
        }
        return ret;
    }

    returnParse() {
        return [
            `@LCL`,
            `D=M`,
            `@R13`,
            `M=D`,
            `@5`,
            `D=D-A`,
            `A=D`,
            `D=M`,
            `@R14`,
            `M=D`,
            `@SP`,
            `A=M-1`,
            `D=M`,
            `@ARG`,
            `A=M`,
            `M=D`,
            `@ARG`,
            `D=M`,
            `@SP`,
            `M=D+1`,
            `@13`,
            `A=M-1`,
            `D=M`,
            `@THAT`,
            `M=D`,
            `@2`,
            `D=A`,
            `@R13`,
            `A=M-D`,
            `D=M`,
            `@THIS`,
            `M=D`,
            `@3`,
            `D=A`,
            `@R13`,
            `A=M-D`,
            `D=M`,
            `@ARG`,
            `M=D`,
            `@4`,
            `D=A`,
            `@R13`,
            `A=M-D`,
            `D=M`,
            `@LCL`,
            `M=D`,
            `@R14`,
            `A=M`,
            `0;JMP`
        ];
    }
}

class Graphics {
    static lettersTable() {
        return [
            `// Letters (31622 + ASCII Table * 7)`,
            `@31`,
            `D=A`,
            `@32098`,
            `M=D`,
            `@32104`,
            `M=D`,
            `@51`,
            `D=A`,
            `@32099`,
            `M=D`,
            `@32103`,
            `M=D`,
            `@99`,
            `D=A`,
            `@32100`,
            `M=D`,
            `@32101`,
            `M=D`,
            `@32102`,
            `M=D`,
            `// E`,
            `@127`,
            `D=A`,
            `@32105`,
            `M=D`,
            `@32108`,
            `M=D`,
            `@32111`,
            `M=D`,
            `@3`,
            `D=A`,
            `@32106`,
            `M=D`,
            `@32107`,
            `M=D`,
            `@32109`,
            `M=D`,
            `@32110`,
            `M=D`,
            `// H`,
            `@99`,
            `D=A`,
            `@32126`,
            `M=D`,
            `@32127`,
            `M=D`,
            `@32128`,
            `M=D`,
            `@32130`,
            `M=D`,
            `@32131`,
            `M=D`,
            `@32132`,
            `M=D`,
            `@127`,
            `D=A`,
            `@32129`,
            `M=D`,
            `// L`,
            `@3`,
            `D=A`,
            `@32154`,
            `M=D`,
            `@32155`,
            `M=D`,
            `@32156`,
            `M=D`,
            `@32157`,
            `M=D`,
            `@32158`,
            `M=D`,
            `@32159`,
            `M=D`,
            `@127`,
            `D=A`,
            `@32160`,
            `M=D`,
            `// O`,
            `@28`,
            `D=A`,
            `@32189`,
            `M=D`,
            `@32195`,
            `M=D`,
            `@54`,
            `D=A`,
            `@32190`,
            `M=D`,
            `@32194`,
            `M=D`,
            `@99`,
            `D=A`,
            `@32191`,
            `M=D`,
            `@32192`,
            `M=D`,
            `@32193`,
            `M=D`,
            `// R`,
            `@63`,
            `D=A`,
            `@32196`,
            `M=D`,
            `@51`,
            `D=A`,
            `@32197`,
            `M=D`,
            `@32201`,
            `M=D`,
            `@99`,
            `D=A`,
            `@32198`,
            `M=D`,
            `@123`,
            `D=A`,
            `@32199`,
            `M=D`,
            `@27`,
            `D=A`,
            `@32200`,
            `M=D`,
            `@115`,
            `D=A`,
            `@32202`,
            `M=D`,
            `// W`,
            `@99`,
            `D=A`,
            `@32231`,
            `M=D`,
            `@32232`,
            `M=D`,
            `@32233`,
            `M=D`,
            `@107`,
            `D=A`,
            `@32234`,
            `M=D`,
            `@32235`,
            `M=D`,
            `@62`,
            `D=A`,
            `@32236`,
            `M=D`,
            `@32237`,
            `M=D`,
        ];
    }

    static printLetter() {
        const loopLabel = `LOOP.${Parser.uniqNumber++}`;
        const endPrintLetterLabel = `ENDPRINTLETTER.${Parser.uniqNumber++}`;
        return [
            ...Line.parse("function Sys.printLetter 2 // arg1: Pos screen, arg2: Pos letter", Parser.uniqNumber++).parsed,
            ...Line.parse(`push argument 0`, Parser.uniqNumber++).parsed,
            ...Line.parse(`pop local 0`, Parser.uniqNumber++).parsed,
            ...Line.parse(`push argument 1`, Parser.uniqNumber++).parsed,
            ...Line.parse(`pop local 1`, Parser.uniqNumber++).parsed,
            `@LCL`,
            `A=M`,
            `D=M`,
            `@R13`,
            `M=D`,
            `@LCL`,
            `A=M+1`,
            `D=M`,
            `@R14`,
            `M=D`,
            `@7`,
            `D=A`,
            `@R15`,
            `M=D`,
            `(${loopLabel})`,
            `@R14`,
            `M=M+1`,
            `A=M-1`,
            `D=M`,
            `@R13`,
            `A=M`,
            `M=D`,
            `@R13`,
            `M=M+1`,
            `M=M+1`,
            `@R15`,
            `M=M-1`,
            `D=M`,
            `@${endPrintLetterLabel}`,
            `D;JEQ`,
            `@${loopLabel}`,
            `0;JMP`,
            `(${endPrintLetterLabel})`,
            ...Line.parse(`push constant 0`, Parser.uniqNumber++).parsed,
            ...Line.parse(`return`, Parser.uniqNumber++).parsed,
        ];
    }
}

(async () => {
    let input = process.argv[2];
    input = path.resolve(input);
    const isDir = (await fs.stat(input)).isDirectory();
    let files, outputFilename;
    if (isDir) {
        files = (await fs.readdir(input)).filter((f) => f.match(/.+\.vm$/)).map((f) => path.resolve(input, f));
        outputFilename = path.join(input, path.basename(input) + ".asm");
    } else {
        files = [input];
        outputFilename = input.replace(".vm", ".asm");
    }
    const out = await fs.open(outputFilename, "w");
    let contents = Parser.setup().parsed.join("\n");
    out.write(contents);
    console.log(contents);
    try {
        for (const file of files) {
            const parser = await Parser.parse(path.basename(file), await fs.open(file));
            contents = parser.parsedLines.map((line) => line.parsed.join("\n")).join("\n") + "\n";
            out.write(contents);
            console.log(contents);
        }
    } finally {
        out.close();
    }

})().catch((e) => console.error(e.stack));