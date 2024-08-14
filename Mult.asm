// Tests the Mult program, designed to compute R2 = R0 * R1.
// Tests the program by having it multiply several sets of
// R0 and R1 values.

// Verify if there are any of the inputs are 0.
@0
D=A
@R2
M=D
@R0
D=M
@END
D;JEQ
@R1
D=M
@END
D;JEQ

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
0;JMP
