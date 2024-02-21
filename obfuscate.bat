@echo off

call npm config set registry=https://ctd-sv01.thinprint.de:440/repository/npm-group/

set gitWorkingDirRoot=%CD%
set buildtarget=%gitWorkingDirRoot%\\build\\release

:: assuming release target only
xcopy /Y /H /E /I "%gitWorkingDirRoot%\\src" "%buildtarget%" 

echo entering directory "%buildtarget%\\js"
pushd "%buildtarget%\\js"

dir 

uglifyjs background.js | jsobfuscate > background1.js  
xcopy /y background1.js background.js
del /F /Q background1.js

uglifyjs options.js | jsobfuscate > options1.js  
xcopy /y options1.js options.js
del /F /Q options1.js

echo entering directory "%gitWorkingDirRoot%"
popd
