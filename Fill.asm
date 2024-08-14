// Fill.asm

@fill
M=M-1

@blank
M=0

@8192
D=A
@topaint
M=D

(READKBD)
@KBD
D=M
@BLANKSCREEN
D;JEQ
@BLACKSCREEN
0;JMP

(BLACKSCREEN)
@fill
D=M
@filling
M=D
@PRINTSCREEN
0;JMP

(BLANKSCREEN)
@blank
D=M
@filling
M=D
@PRINTSCREEN
0;JMP

(PRINTSCREEN)
@SCREEN
D=A
@painting
M=D
@topaint
D=M
@i
M=D

(LOOP)
@filling
D=M
@painting
A=M
M=D
@i
M=M-1
D=M
@READKBD
D;JEQ
@painting
M=M+1
@LOOP
0;JMP


@READKBD
0;JMP
