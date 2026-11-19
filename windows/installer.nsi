; ShopTaBouffe — installateur Windows SANS droits administrateur.
;   * RequestExecutionLevel user  → aucune élévation, aucune UAC
;   * installation dans $LOCALAPPDATA\Programs\ShopTaBouffe
;   * raccourcis utilisateur (Bureau + Menu Démarrer de l'utilisateur)
; Compilation : makensis installer.nsi   (depuis windows\, après npm run dist)

!define APP_NAME "ShopTaBouffe"
!define APP_VERSION "1.0.8"
!define APP_PUBLISHER "tear360"
!define APP_URL "https://chorizo.dpdns.org"
!define SRC_DIR "dist\ShopTaBouffe-win32-x64"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "ShopTaBouffe-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user          ; <-- aucun droit admin requis
Unicode true
SetCompressor /SOLID lzma

Page directory
Page instfiles

Section "Install"
  SetOutPath $INSTDIR
  File /r "${SRC_DIR}\*.*"

  ; Enregistre l'installation (désinstallation + mise à jour)
  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" $INSTDIR
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "URLInfoAbout" "${APP_URL}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayIcon" "$INSTDIR\${APP_NAME}.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoRepair" 1
  ; Taille approximative en Ko
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "EstimatedSize" 366000

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Raccourcis utilisateur uniquement (pas de Program Files, pas d'admin)
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Désinstaller.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  RMDir /r $INSTDIR
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
