!define APP_NAME "ShopTaBouffe"
!define APP_VERSION "1.0.12"
!define SRC_EXE "C:\Users\degre_3\Desktop\codes\delivro\rust-app\shoptabouffe\target\release\shoptabouffe.exe"

Name "${APP_NAME} ${APP_VERSION} (Rust preview)"
OutFile "ShopTaBouffe-Rust-Preview-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
RequestExecutionLevel user
Unicode true
SetCompressor /SOLID lzma

Page directory
Page instfiles

Section "Install"
  SetOutPath $INSTDIR
  File "${SRC_EXE}"
  CreateShortCut "$DESKTOP\${APP_NAME} (Rust).lnk" "$INSTDIR\shoptabouffe.exe"
  CreateShortCut "$SMPROGRAMS\${APP_NAME} (Rust).lnk" "$INSTDIR\shoptabouffe.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\shoptabouffe.exe"
  Delete "$DESKTOP\${APP_NAME} (Rust).lnk"
  Delete "$SMPROGRAMS\${APP_NAME} (Rust).lnk"
  RMDir $INSTDIR
SectionEnd
