// Setup memory segments
@256 // Stack
D=A
@SP
M=D
@300 // LCL
D=A
@LCL
M=D
@400 // ARG
D=A
@ARG
M=D
@3000 // THIS
D=A
@THIS
M=D
@3010 // THAT
D=A
@THAT
M=D

// Code starts
// push constant 10
@10
D=A
@SP
A=M
M=D
@SP
M=M+1
// push constant 20
@20
D=A
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
// pop local 0
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
