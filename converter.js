#!/user/bin/env node
const fs = require('fs');
var zipFolder = require('zip-folder');
var unzipper = require("unzipper");
var path = require('path');
const replace = require('replace-in-file');
var rimraf = require('rimraf');
const getSize = require('get-folder-size');
var async = require('async');
const prompt = require('prompt');


var watchFolder = __dirname + "/Import"
var outputFolder = __dirname + "/Converted"
var active = true; // flag control


listToConvert = [];

var running = 0;
//Check if there is content in the import/export folders before starting which may result in error if duplicate content
var request1 = new Promise(function(resolve) {
    getSize(watchFolder, (err, size) => {
        resolve(size)
    });
});


var request2 = new Promise(function(resolve) {
    getSize(outputFolder, (err, size) => {
        resolve(size)
    });
});

Promise.all([request1, request2]).then(function(payloads) {

    if (payloads[0] || payloads[1] > 0) {
        var schema = {
            properties: {
                answer: {
                    pattern: /^[a-zA-Z\s\-]+$/,
                    description: 'Your "Import" or "Converted" folders have courses in them which may result in an error if it contains duplicate content as your new imports, would you like to delete them now? Y or N',
                    required: true
                }
            }
        };

        prompt.start();

        prompt.get(schema, function(err, result) {
            if (result.answer.toLowerCase() == "y" || "yes") {
                console.log("Deleting..")
                rimraf(watchFolder + '/*', function() {});
                rimraf(outputFolder + '/*', function() {});

                 setTimeout(function() {
                    init()
                }, 3000);
            } else if (typeof(result) == 'undefined'){
            	return
            } else {
                console.log("Warning: Having duplicate content in those folders as you want to import may result in an error.")
                init()

            }
        });

       /* function onErr(err) {
            console.log(err);
            return 1;
        }*/
    } else {
        init()
    }

});
//End folder check

//Init Conversion
var init = function() {
    console.log("Ready for imports.")
    fs.watch(watchFolder, function(event, filename) {
        if (event === 'rename' && active) {
            active = false;
            listToConvert.push(filename)
            if (!active) {
                active = true
            }
        }
    });


    setInterval(function() {

        if (running == 0 && listToConvert.length > 0) {
            running = 1

            var first = listToConvert[0]
            console.log("Queue: " + listToConvert)

            active = false;

            var rootFolderName = first

            function openZip(itemname) {
                var itempath = path.normalize(watchFolder + '/' + rootFolderName + '/' + itemname)

                fs.createReadStream(itempath)
                    .pipe(unzipper.Extract({ path: itempath.slice(0, -4) }));
            }

            fs.readdir(watchFolder + '/' + rootFolderName, function(err, items) {
                if (items != undefined) {
                    console.log("Working on " + listToConvert[0] + "...")
                    var HTML5folderName;
                    var SWFFolderName;
                    for (var i = 0; i < items.length; i++) {
                        if (items[i].search(/HTML5/i) > -1) {
                            openZip(items[i])
                            HTML5folderName = items[i].slice(0, -4)
                        }
                        if (items[i].search(/SWF/i) > -1) {
                            openZip(items[i])
                            SWFFolderName = items[i].slice(0, -4)

                        }
                    }

                    HTML5folderPath = path.normalize(watchFolder + '/' + rootFolderName + '/' + HTML5folderName)
                    SWFfolderPath = path.normalize(watchFolder + '/' + rootFolderName + '/' + SWFFolderName)



                    filesToRename = ["SCORM_utilities.js", "scormdriver.js", "standard.js", "Utilities.js"]


                    setTimeout(function() {
                        var doSomething = new Promise(function(resolve, reject) {

                            for (var i = 0; i < filesToRename.length; i++) {

                                fs.rename(path.normalize(SWFfolderPath + '/' + filesToRename[i]), path.normalize(HTML5folderPath + '/' + filesToRename[i].slice(0, -3) + 'swf.js'), function(err) {
                                    if (err) console.log('ERROR: ' + err);
                                });
                            }


                            var css = fs.readdirSync(SWFfolderPath).filter(fn => fn.endsWith('.css'));
                            var swf = fs.readdirSync(SWFfolderPath).filter(fn => fn.endsWith('.swf'));
                            var htm = fs.readdirSync(SWFfolderPath).filter(fn => fn.endsWith('.htm'));


                            filesToMove = [css, swf, htm]


                            for (var i = 0; i < filesToMove.length; i++) {
                                fs.rename(path.normalize(SWFfolderPath + '/' + filesToMove[i]), path.normalize(HTML5folderPath + '/' + filesToMove[i]), function(err) {
                                    if (err) console.log('ERROR: ' + err);
                                });
                            }

                            setTimeout(function() {
                                const options = {
                                    files: path.normalize(HTML5folderPath + '/' + htm),
                                    from: [/standard.js/g, /scormdriver.js/g, /SCORM_utilities.js/g, /Utilities.js/g],
                                    to: ['standardswf.js', 'scormdriverswf.js', 'SCORM_utilitiesswf.js', 'Utilitiesswf.js'],
                                };
                                replace(options, (error, changes) => {
                                    if (error) {
                                        return console.error('Error occurred:', error);
                                    }

                                });
                            }, 1000);


                            var search = "<head>";


                            var body = fs.readFileSync(path.normalize(HTML5folderPath + '/' + 'index_scorm.html')).toString();

                            var scriptToInsert = "<script>if (\/*@cc_on!@*\/false || !!document.documentMode || !isIE && !!window.StyleMedia == true ) { window.location = " + "'" + String(htm) + "'" + ";}<\/script>"
                            var searchindex = body.indexOf(search)



                            body = body.split('\n');
                            body.splice(0, 0, scriptToInsert);

                            var output = body.join('\n');
                            fs.writeFileSync(path.normalize(HTML5folderPath + '/' + 'index_scorm.html'), output);


                            resolve(zipTheFolder())
                        });

                    }, 3000);

                    var zipTheFolder = function() {
                        setTimeout(function() {
                            zipFolder(HTML5folderPath, path.normalize(outputFolder + '/' + rootFolderName + '.zip'), function(err) {
                                if (err) {
                                    console.log('Oh no!', err);
                                } else {
                                    console.log('EXCELLENT! The ' + rootFolderName + ' course has been converted!');
                                    rimraf(HTML5folderPath, function() {});
                                    rimraf(SWFfolderPath, function() {});
                                    running = 0
                                    listToConvert.shift()
                                    console.log("Ready")
                                };
                            });

                        }, 3000);
                    };

                };
            });

            if (!active) {
                active = true
            };

        };
    }, 1000);
};
//End init conversion