' Kill other PawLink / Electron main processes (not --type= helpers).
' Args: <myPid> <exeName> [optionalCommandLineMarker]
Option Explicit
Dim myPid, exeName, marker, col, proc, cmd, killed, sh
If WScript.Arguments.Count < 2 Then WScript.Quit 1

myPid = CLng(WScript.Arguments(0))
exeName = WScript.Arguments(1)
marker = ""
If WScript.Arguments.Count >= 3 Then marker = LCase(WScript.Arguments(2))

killed = 0
Set sh = CreateObject("WScript.Shell")
Set col = GetObject("winmgmts:\\.\root\cimv2").ExecQuery( _
  "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='" & Replace(exeName, "'", "") & "'")

For Each proc In col
  If proc.ProcessId <> myPid Then
    cmd = ""
    On Error Resume Next
    cmd = proc.CommandLine
    On Error GoTo 0
    If InStr(1, cmd, "--type=", vbTextCompare) = 0 Then
      If marker = "" Or InStr(1, LCase(cmd), marker, vbBinaryCompare) > 0 Then
        ' /F only on the browser process — avoid /T so we do not tear down
        ' parent npm/concurrently/Vite trees used by start.bat.
        sh.Run "taskkill.exe /F /PID " & CStr(proc.ProcessId), 0, True
        killed = killed + 1
      End If
    End If
  End If
Next

WScript.Echo CStr(killed)
WScript.Quit 0
