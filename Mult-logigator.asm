// Tests the Mult program, designed to compute R2 = R0 * R1.
// Tests the program by having it multiply several sets of
// R0 and R1 values.

// Load Values
@57
D=A
@R0
M=D
@354
D=A
@R1
M=D

@R1
D=M
@i
M=D

(LOOP)
@R0
D=M
@R2
M=D+M
@i
M=M-1
D=M
@END
D;JEQ
@LOOP
0;JMP

(END)
@R2
D=M
@END
0;JMP
