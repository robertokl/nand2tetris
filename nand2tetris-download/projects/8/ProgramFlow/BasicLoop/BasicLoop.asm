// Setup memory segments

// Code starts
// push constant 0
@0
D=A
@SP
A=M
M=D
@SP
M=M+1
// pop local 0         // sum = 0
@0
D=A
@LCL
A=M
A=D+A
D=A
@R13
M=D
@SP
M=M-1
A=M
D=M
@R13
A=M
M=D
// label LOOP
(LOOP)
// push argument 0
@0
D=A
@ARG
A=M
A=D+A
D=M
@SP
A=M
M=D
@SP
M=M+1
// push local 0
@0
D=A
@LCL
A=M
A=D+A
D=M
@SP
A=M
M=D
@SP
M=M+1
// add
@SP
M=M-1
A=M
D=M
@SP
A=M-1
M=D+M
// pop local 0	        // sum = sum + n
@0	
D=A
@LCL
A=M
A=D+A
D=A
@R13
M=D
@SP
M=M-1
A=M
D=M
@R13
A=M
M=D
// push argument 0
@0
D=A
@ARG
A=M
A=D+A
D=M
@SP
A=M
M=D
@SP
M=M+1
// push constant 1
@1
D=A
@SP
A=M
M=D
@SP
M=M+1
// sub
@SP
M=M-1
A=M
D=M
@SP
A=M-1
M=M-D
// pop argument 0      // n--
@0
D=A
@ARG
A=M
A=D+A
D=A
@R13
M=D
@SP
M=M-1
A=M
D=M
@R13
A=M
M=D
// push argument 0
@0
D=A
@ARG
A=M
A=D+A
D=M
@SP
A=M
M=D
@SP
M=M+1
// if-goto LOOP        // if n > 0, goto LOOP
@SP
M=M-1
A=M
D=M
@LOOP
D;JNE
// push local 0        // else, pushes sum to the stack's top
@0
D=A
@LCL
A=M
A=D+A
D=M
@SP
A=M
M=D
@SP
M=M+1
