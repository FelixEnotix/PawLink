; Force-close elevated PawLink before file copy.
; Auto-retries like pressing "Retry" — no MessageBox for the user.
; Kill only PawLink.exe (never the Setup process).
!macro customCheckAppRunning
  DetailPrint "Closing PawLink processes..."
  StrCpy $R9 0

  kill_retry:
    nsExec::ExecToLog 'taskkill /F /IM PawLink.exe'
    Pop $R8
    Sleep 400
    nsExec::ExecToLog 'taskkill /F /T /IM PawLink.exe'
    Pop $R8
    Sleep 500
    nsExec::ExecToLog 'powershell.exe -NoProfile -WindowStyle Hidden -Command "Get-Process -Name PawLink -ErrorAction SilentlyContinue | Stop-Process -Force"'
    Pop $R8
    Sleep 700

    nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq PawLink.exe" /NH | find /I "PawLink.exe" >nul'
    Pop $R8
    StrCmp $R8 "0" still_running done_kill

  still_running:
    IntOp $R9 $R9 + 1
    ; ~90 silent retries (~2–3 min) — same as clicking Retry repeatedly.
    IntCmp $R9 90 give_up 0 0
    DetailPrint "PawLink still running, auto-retry $R9..."
    Sleep 1500
    Goto kill_retry

  give_up:
    ; Still alive after many tries — abort install quietly (no blocking dialog).
    DetailPrint "Could not close PawLink after auto-retries."
    Quit

  done_kill:
!macroend
