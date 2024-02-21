#mkversio
chmod +x ./*.sh
$IsServerBuild=
docker run --rm -w /src/ -v$(pwd):/src -e IsServerBuild=$IsServerBuild ctd-sv01.thinprint.de:5000/mkversio:3.2.19 pom.xml -c "ThinPrint GmbH" -vf relversion_file.txt -vp relversion_prod.txt

#npm
docker run --rm -w /src/ -v$(pwd):/src ctd-sv01.thinprint.de:5000/node:12.9 ./obfuscate.sh
# docker run --rm -w /src/ -v$(pwd):/src ctd-sv01.thinprint.de:5000/node:12.9 ./obfuscate.sh release

#maven
# docker run --rm -w /src/ -v$(pwd):/src ctd-sv01.thinprint.de:5000/maven:3.6.3-openjdk-8-slim mvn package -f pom.xml -s .m2/settings.xml
