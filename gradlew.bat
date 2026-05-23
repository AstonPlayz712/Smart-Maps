@rem
@rem Appflow compatibility shim — Windows.
@rem
@rem Forwards to android\gradlew.bat. See the POSIX `gradlew` script in the
@rem same folder for the rationale.

@if "%DEBUG%" == "" @echo off
@setlocal

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.\

if not exist "%DIRNAME%android\gradlew.bat" (
  echo error: %DIRNAME%android\gradlew.bat not found 1>&2
  exit /b 1
)

cd /d "%DIRNAME%android"
call gradlew.bat %*
set EXITCODE=%ERRORLEVEL%
@endlocal & exit /b %EXITCODE%
