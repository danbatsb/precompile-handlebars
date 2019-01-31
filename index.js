
var fs = require('fs');
var path = require('path');
var extend = require('util')._extend;
var async = require('async');
var mkdirp = require('mkdirp');
var Handlebars = require('handlebars');

var preFile = 'this["Handlebars"] = this["Handlebars"] || {};\n\'';
var preTemplate1 = 'this["Handlebars"]["templates"]["';
var preTemplate2 = '"] = Handlebars.template(';
var postTemplate = ');\n\n';

var prePartialTemplate1 = 'Handlebars.registerPartial("';
var prePartialTemplate2 = '", Handlebars.template(';
var postPartial = '));\n\n';

var finalTemplate = '';

function CompileHandlebars(options) {
    var tasks = Array.isArray(options) ? options : [options];

    this.options = tasks.map(function(taskOptions) {
        return extend({
            inputDir: "templates",
            outputFile: "compiled-templates.js",
            outputDir: "",
            namespace: "Handlebars"
        }, taskOptions);
    });
}

CompileHandlebars.prototype.apply = function(compiler) {
    var plugin = this;
    console.log("CompileHandlebars plugin is loading... " + JSON.stringify(plugin.options));

    
    compiler.plugin('compile', function(compilation, callback) {
        async.parallel(plugin.options.map(function (options) {
            return function(cb) {
                doTask(options, cb);
            }
        }), callback);
    });

    function doTask(options, callback) {
        var index = 0;
        var outputFile = path.join(options.outputDir, options.outputFile);
        
        if (options.amd === true) {
            preFile = 'define([\'handlebars\'], function(Handlebars) {\n\n';
            finalTemplate = 'return this["'+ options.namespace +'"];\n\n});';
        }
    
        preFile += 'this["'+ options.namespace +'"] = this["'+ options.namespace +'"] || {};\n\n';
        preTemplate1 = 'this["'+ options.namespace +'"]["';
        preTemplate2 = '"] = Handlebars.template(';
        postTemplate = ');\n\n';

        async.series([
            function(cb) {
                if (options.outputDir && options.outputDir.length > 0) {
                    var outputDirectory = options.outputDir;
                    console.log("outputFile " + outputFile + " outputDirectory " + outputDirectory);
                    mkdirp(outputDirectory, function (err) {
                        if (err) console.error(err);
                        return cb(err);
                    });
                }
                else {
                    cb(null);
                }
            },
            function(cb) {
                fs.writeFile(outputFile, preFile, function(err) {
                    return cb(err);
                })
            },
            function(cb) {
                fs.readdir(options.inputDir , function( err, files ) {
                    if (err) {
                        console.error("Failed to read directory");
                        return;
                    }
                    files = files.filter(function(item) { return /^.*\.handlebars/.test(item) || /^.*\.hbs/.test(item); });
                    console.log("Number of templates to process: " + files.length);
                    async.whilst(function() {
                        return index < files.length;
                    }, function(cb) {
                        var fileName = files[index], shortFileName = fileName.match(/(.*)\..*/)[1];
                        var input = path.join(options.inputDir, fileName);
                        if (!fs.lstatSync(input).isFile()) {
                            setTimeout(function() {
                                index ++;
                                cb();
                            }, 0);
                            return;
                        }
                        // console.log(input);
                        fs.readFile(input, 'utf8', function (err,data) {
                            if (err) {
                                console.log(err);
                                return cb(err);
                            }
                            var templateSpec = Handlebars.precompile(data);
                            if (shortFileName[0] == '_') {
                                // handling partial
                                templateSpec = prePartialTemplate1 + shortFileName.slice(1) + prePartialTemplate2 + templateSpec + postPartial;
                            }
                            else {
                                templateSpec = preTemplate1 + shortFileName + preTemplate2 + templateSpec + postTemplate;
                            }
                            // console.log(templateSpec);
                            fs.appendFile(outputFile, templateSpec, function (err) {
                                index ++;
                                cb(err);
                            });
                        });
                    }, cb);
                });
            },
            function(cb) {
                fs.appendFile(outputFile, finalTemplate, function (err) {
                    cb(err);
                });
                console.log("Precompiled " + index + " templates from " + options.inputDir + " to " + options.outputFile);
          
            }
        ], callback);
    }
};

module.exports = CompileHandlebars;
