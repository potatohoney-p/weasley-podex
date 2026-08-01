!macro customInstall
  nsExec::ExecToLog 'setx PATH "$INSTDIR\resources\server\bin;%PATH%"'
!macroend

!macro customUnInstall
  ; PATH cleanup deferred — complex on Windows
!macroend
