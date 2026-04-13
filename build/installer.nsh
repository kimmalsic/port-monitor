; Custom NSIS include for Port Monitor — ensures clean uninstall.
; electron-builder merges this into its generated installer.nsi.

!macro customInit
  ; Ensure no running instance blocks uninstall/install
  nsExec::Exec 'taskkill /IM "Port Monitor.exe" /F'
!macroend

!macro customInstall
  ; Register global uninstall cleanup marker (idempotent)
  WriteRegStr HKCU "Software\PortMonitor" "InstallPath" "$INSTDIR"
!macroend

!macro customUnInit
  ; Kill running app so file handles are released before removal.
  nsExec::Exec 'taskkill /IM "Port Monitor.exe" /F'
!macroend

!macro customUnInstall
  ; --- Remove user data ---
  ; electron-builder's deleteAppDataOnUninstall already removes
  ; %APPDATA%\Port Monitor, but we also purge legacy/config paths
  ; defensively so nothing is left behind.
  RMDir /r "$APPDATA\Port Monitor"
  RMDir /r "$APPDATA\port-monitor"
  RMDir /r "$LOCALAPPDATA\Port Monitor"
  RMDir /r "$LOCALAPPDATA\port-monitor"
  RMDir /r "$LOCALAPPDATA\Programs\Port Monitor"

  ; --- Remove registry keys ---
  DeleteRegKey HKCU "Software\PortMonitor"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PortMonitor"
  DeleteRegKey HKCU "Software\Classes\port-monitor"

  ; --- Remove shortcuts (belt-and-braces; builder handles the standard ones) ---
  Delete "$DESKTOP\Port Monitor.lnk"
  Delete "$SMPROGRAMS\Port Monitor.lnk"
  RMDir  "$SMPROGRAMS\Port Monitor"

  ; --- Ensure install dir is gone if empty ---
  RMDir /r "$INSTDIR"
!macroend
