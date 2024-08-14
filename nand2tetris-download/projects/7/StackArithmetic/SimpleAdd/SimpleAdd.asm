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
// push constant 7
@7
D=A
@SP
A=M
M=D
@SP
M=M+1
// push constant 8
@8
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
