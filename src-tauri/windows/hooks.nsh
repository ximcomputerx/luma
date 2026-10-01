!macro LUMA_CLEAR_USERCHOICE EXT
  ClearErrors
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\${EXT}\UserChoice" "ProgId"
  ${If} $R9 == "Luma.md"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\${EXT}\UserChoice"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode = 1
    Goto luma_assoc_keep
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\Luma.md"
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "Luma.md"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "Luma.md"
  DeleteRegValue HKCU "Software\Classes\.mdown\OpenWithProgids" "Luma.md"
  DeleteRegValue HKCU "Software\Classes\.mkdn\OpenWithProgids" "Luma.md"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Luma"
  DeleteRegKey HKCU "Software\Luma"
  !insertmacro LUMA_CLEAR_USERCHOICE ".md"
  !insertmacro LUMA_CLEAR_USERCHOICE ".markdown"
  !insertmacro LUMA_CLEAR_USERCHOICE ".mdown"
  !insertmacro LUMA_CLEAR_USERCHOICE ".mkdn"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  luma_assoc_keep:
  ClearErrors
!macroend
