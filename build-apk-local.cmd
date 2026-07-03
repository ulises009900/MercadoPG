@echo off
setlocal

for /d %%D in ("C:\Program Files\Microsoft\jdk-21*-hotspot") do (
	if exist "%%~fD\bin\java.exe" set "JAVA_HOME=%%~fD"
)

if not defined JAVA_HOME (
	for /d %%D in ("C:\Program Files\Microsoft\jdk-17*-hotspot") do (
		if exist "%%~fD\bin\java.exe" set "JAVA_HOME=%%~fD"
	)
)

if not defined JAVA_HOME (
	echo No se encontro un JDK compatible. Instala Microsoft.OpenJDK.21.
	exit /b 1
)

set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\build-tools\36.1.0;%PATH%"

cd /d "%~dp0android"
call gradlew.bat assembleDebug --console=plain --no-daemon

endlocal