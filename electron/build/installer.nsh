!macro customInstall
  ; server/bin exposes the sole public CLI: weasley-podex.
  nsExec::ExecToLog 'setx PATH "$INSTDIR\resources\server\bin;%PATH%"'
!macroend

!macro customUnInstall
  ; PATH cleanup deferred — complex on Windows
!macroend
