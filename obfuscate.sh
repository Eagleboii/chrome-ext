set -e 

npm config set registry=https://ctd-sv01.thinprint.de:440/repository/npm-group/

if [ "$1" != "" ]; then
    echo "target parameter 1 is $1"
	export buildtarget=./build/$1
else
    echo "target parameter 1 is empty"
	mkdir -p ./build/tst
	cp -r ./src/* ./build/tst
    exit 0
fi

echo buildtarget is $buildtarget
echo installing js-obfuscator uglify-js

npm i -g js-obfuscator
npm i -g uglify-js

mkdir -p $buildtarget
cp -r ./src/* $buildtarget/

cd $buildtarget && ls -l
cd js && ls -l

# remove obfudcation due to google rules:
#
# Content Policies
# Code Readability Requirements:
# Developers must not obfuscate code or conceal functionality of their extension. This also applies to any external code or resource fetched by the 
# extension package. Minification is allowed, including the following forms:
#
#	Removal of whitespace, newlines, code comments, and block delimiters
#	Shortening of variable and function names
#	Collapsing files together
#
#echo uglifyjs background.js | jsobfuscate > background1.js
#uglifyjs background.js | jsobfuscate > background1.js
echo uglifyjs background.js > background1.js
uglifyjs background.js > background1.js

#echo uglifyjs options.js | jsobfuscate > options1.js  
#uglifyjs options.js | jsobfuscate > options1.js  
echo uglifyjs options.js > options1.js  
uglifyjs options.js > options1.js  

mv background1.js background.js
mv options1.js options.js
