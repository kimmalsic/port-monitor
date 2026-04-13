; Custom NSIS include for Port Monitor.
; Goals:
;   - Kill every running instance (including child processes) before touching files.
;   - Clean uninstall: remove user data, shortcuts, registry, install dir.

!macro killPortMonitor
  DetailPrint "Closing running Port Monitor instances..."
  ; Two passes with sleep: first kills the main tree, second catches any child
  ; that respawned (tray/network service) and gives Windows time to release
  ; file handles before NSIS' running-app check runs.
  nsExec::Exec 'taskkill /F /T /IM "Port Monitor.exe"'
  Sleep 800
  nsExec::Exec 'taskkill /F /T /IM "Port Monitor.exe"'
  Sleep 400
!macroend

!macro customInit
  !insertmacro killPortMonitor
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\PortMonitor" "InstallPath" "$INSTDIR"
!macroend

!macro customUnInit
  !insertmacro killPortMonitor
!macroend

!macro customUnInstall
  ; --- Remove user data ---
  RMDir /r "$APPDATA\Port Monitor"
  RMDir /r "$APPDATA\port-monitor"
  RMDir /r "$LOCALAPPDATA\Port Monitor"
  RMDir /r "$LOCALAPPDATA\port-monitor"
  RMDir /r "$LOCALAPPDATA\Programs\Port Monitor"

  ; --- Remove registry keys ---
  DeleteRegKey HKCU "Software\PortMonitor"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PortMonitor"
  DeleteRegKey HKCU "Software\Classes\port-monitor"

  ; --- Remove shortcuts ---
  Delete "$DESKTOP\Port Monitor.lnk"
  Delete "$SMPROGRAMS\Port Monitor.lnk"
  RMDir  "$SMPROGRAMS\Port Monitor"

  ; --- Remove install dir ---
  RMDir /r "$INSTDIR"
!macroend
