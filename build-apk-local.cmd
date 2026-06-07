@echo off
setlocal

if exist "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot\bin\java.exe" (
	set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
) else if exist "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot\bin\java.exe" (
	set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
) else (
	echo No se encontro un JDK compatible. Instala Microsoft.OpenJDK.21.
	exit /b 1
)

set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\build-tools\36.1.0;%PATH%"

cd /d "%~dp0android"
call gradlew.bat assembleDebug --console=plain --no-daemon

endlocal