@rem
@rem Appflow compatibility shim — Windows. See the POSIX `gradlew` script
@rem in the same folder for the rationale.

@if "%DEBUG%" == "" @echo off
@setlocal enabledelayedexpansion

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.\
cd /d "%DIRNAME%"

if not exist "node_modules\" (
  echo [gradlew shim] node_modules missing - running npm ci
  if exist "package-lock.json" (
    call npm ci --no-audit --no-fund || exit /b %ERRORLEVEL%
  ) else (
    call npm install --no-audit --no-fund || exit /b %ERRORLEVEL%
  )
)

if not exist "dist\index.html" (
  echo [gradlew shim] no dist/index.html - running npm run build
  call npm run build || exit /b %ERRORLEVEL%
)

if not exist "android\capacitor-cordova-android-plugins\cordova.variables.gradle" (
  echo [gradlew shim] missing cap sync artefacts - running npx cap sync android
  call npx cap sync android || exit /b %ERRORLEVEL%
) else if not exist "android\app\src\main\assets\capacitor.config.json" (
  echo [gradlew shim] missing cap sync artefacts - running npx cap sync android
  call npx cap sync android || exit /b %ERRORLEVEL%
)

if not exist "%DIRNAME%android\gradlew.bat" (
  echo error: %DIRNAME%android\gradlew.bat not found 1>&2
  exit /b 1
)

cd /d "%DIRNAME%android"
call gradlew.bat %*
set EXITCODE=%ERRORLEVEL%
@endlocal & exit /b %EXITCODE%
