const fs = require('node:fs/promises');

class Parser {
  static async parse(file, symTable) {
    const parser = new Parser(file, symTable);
    await parser.parseAll();
    return parser;
  }

  constructor(file, symTable) {
    this.symTable = symTable;
    this.file = file;
    this.currLine = 0;
    this.fileLine = 0;
    this.parsedLines = [];
    this.parsedBinary = [];
    this.parsedHex = [];
  }

  async parseAll() {
    try {
      for await (const line of this.file.readLines()) {
        this.fileLine++;
        const l = Line.parse(line);
        if (l.type === Line.types.COMMENT) {
          continue;
        }
        if (l.type === Line.types.LABEL) {
          this.symTable.set(l.label, this.currLine);
          continue;
        }
        if (process.argv[3] === "d") {
          console.log(`${this.currLine}: ${this.fileLine}`);
        }
        this.parsedLines.push([this.currLine, l]);
        this.currLine++;
      }
    } catch (e) {
      e.message = `Line ${this.fileLine} - ` + e.message
      throw e;
    }
    const code = new Code(this.symTable);
    for (const line of this.parsedLines) {
      try {
        const bin = code.convertToBinary(line[1]);
        this.parsedBinary.push(bin);
        this.parsedHex.push(code.convertToHex(bin));
      } catch (e) {
        e.message = `Line ${line[0]} - ` + e.message
        throw e;
      }
    }
  }
}

class Line {
  static types = {
    COMMENT: "comment",
    AINST: "ainstruction",
    CINST: "cinstruction",
    LABEL: "label",
    REFRESH: "refresh",
  };

  commentMatcher = /^\/\/.*/;
  aMatcher = /@([0-9a-zA-Z_\.\$]+)\ *(\/\/)?.*/
  bMatcher = /([AMD]{0,3}\ *=)?\ *([-!]?([01DAM]|<<D|>>D)([-+&|][01ADM])?)?;?(J(GT|EQ|GE|LT|NE|LE|MP))?\ *(\/\/)?.*/
  labelMatcher = /\(([0-9a-zA-Z_\.\$]+)\)\ *(\/\/)?.*/
  refreshMatcher = /refreshscreen\ *(\/\/)?.*/

  static parse(line) {
    const l = new Line(line.trim());
    l.parse();
    return l;
  }

  constructor(line) {
    this.line = line;
  }

  parse() {
    if (this.line.length === 0) {
      this.type = Line.types.COMMENT;
      return;
    }
    let m;
    m = this.line.match(this.commentMatcher);
    if (m !== null) {
      this.type = Line.types.COMMENT;
      return;
    }
    m = this.line.match(this.aMatcher);
    if (m !== null) {
      this.type = Line.types.AINST;
      this.address = m[1];
      return;
    }
    m = this.line.match(this.labelMatcher);
    if (m !== null) {
      this.type = Line.types.LABEL;
      this.label = m[1];
      return;
    }
    m = this.line.match(this.refreshMatcher);
    if (m !== null) {
      this.type = Line.types.REFRESH;
      return;
    }
    m = this.line.match(this.bMatcher);
    if (m !== null) {
      this.type = Line.types.CINST;
      this.destination = m[1];
      if (this.destination) this.destination = this.destination.substring(0, this.destination.length - 1).trim(); // Removing "=".
      this.computation = m[2];
      this.jump = m[5];
      if (this.computation === undefined) throw new Error(`Syntax Error (unknown computation): "${this.line}".`);
      if (this.destination === undefined && this.jump === undefined) throw new Error(`Syntax Error (invalid C instruction): "${this.line}".`);
      return;
    }
  }
}

class Code {
  compTranslation = {
    "0":   "0101010",
    "1":   "0111111",
    "-1":  "0111010",
    "D":   "0001100",
    "A":   "0110000",
    "!D":  "0001101",
    "!A":  "0110001",
    "-D":  "0001111",
    "-A":  "0110011",
    "D+1": "0011111",
    "A+1": "0110111",
    "D-1": "0001110",
    "A-1": "0110010",
    "D+A": "0000010",
    "D-A": "0010011",
    "A-D": "0000111",
    "D&A": "0000000",
    "D|A": "0010101",
    "M":   "1110000",
    "!M":  "1110001",
    "-M":  "1110011",
    "M+1": "1110111",
    "M-1": "1110010",
    "D+M": "1000010",
    "D-M": "1010011",
    "M-D": "1000111",
    "D&M": "1000000",
    "D|M": "1010101",
    "<<D": "0000000",
    ">>D": "0000000",
  };

  destTranslation = {
    undefined: "000",
    "M":   "001",
    "D":   "010",
    "MD":  "011",
    "A":   "100",
    "AM":  "101",
    "AD":  "110",
    "AMD": "111",
  };

  jumpTranslation = {
    undefined: "000",
    "JGT": "001",
    "JEQ": "010",
    "JGE": "011",
    "JLT": "100",
    "JNE": "101",
    "JLE": "110",
    "JMP": "111",
  };

  constructor(symTable) {
    this.symTable = symTable;
  }

  convertToBinary(line) {
    switch(line.type) {
      case(Line.types.AINST):
        return this.convertAInstruction(line);
      case(Line.types.CINST):
        return this.convertCInstruction(line);
      case(Line.types.REFRESH):
        return "1100000000000000";
      default:
        throw new Error(`Can not convert ${line.line}`);
    }
  }

  convertToHex(bin) {
    let hex = Number.parseInt(bin, 2).toString(16).toUpperCase();
    hex = hex.padStart(4, "0");
    hex = hex.substring(2, 4) + hex.substring(0, 2);
    return hex;
  }

  convertAInstruction(line) {
    let intValue = Number(line.address);
    if (Number.isNaN(intValue)) {
      intValue = Number(this.symTable.get(line.address));
      if (Number.isNaN(intValue)) throw new Error(`Unknown address: ${line.address}`);
    }
    return intValue.toString(2).padStart(16, "0");
  }

  convertCInstruction(line) {
    let bin = "111";
    if (line.computation === "<<D") {
      bin = "100";
    } else if (line.computation === ">>D") {
      bin = "101";
    }
    bin += this.compTranslation[line.computation];
    bin += this.destTranslation[line.destination];
    bin += this.jumpTranslation[line.jump];
    return bin;
  }
}

class SymbolTable {
  table = {
    "R0":     0,
    "R1":     1,
    "R2":     2,
    "R3":     3,
    "R4":     4,
    "R5":     5,
    "R6":     6,
    "R7":     7,
    "R8":     8,
    "R9":     9,
    "R10":    10,
    "R11":    11,
    "R12":    12,
    "R13":    13,
    "R14":    14,
    "R15":    15,
    "SCREEN": 16384,
    "KBD":    24576,
    "SP":     0,
    "LCL":    1,
    "ARG":    2,
    "THIS":   3,
    "THAT":   4,
  };
  nextVar = 16;

  get(symbol) {
    if (this.table[symbol] === undefined) {
      this.table[symbol] = this.nextVar;
      this.nextVar++
    }
    return this.table[symbol];
  }

  set(symbol, val) {
    this.table[symbol] = val;
  }
}

(async () => {
  const input = process.argv[2];

  const symTable = new SymbolTable();
  const file = await fs.open(input);
  const parser = await Parser.parse(file, symTable);
  if (process.argv[3] === "h") {
    process.stdout.write(parser.parsedHex.join(" "));
  } else if (process.argv[3] === "b") {
    console.log(parser.parsedBinary.join("\n"));
  }
})().catch((e) => console.error(e.stack));
