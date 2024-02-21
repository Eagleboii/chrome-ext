const zipFolder = require('zip-folder');

zipFolder('build/release', 'release.zip', function(err) { if (err) console.log('oh no! ', err); else console.log(`Successfully zipped the build/release directory and store as release.zip`);});
