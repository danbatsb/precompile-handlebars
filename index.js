// Handlebars/Webpack pre-compilation plugin
// This plugin is meant to precompile and concatenate handlebars templates into a single file.
//
// Plugin can take a single object or an array of objects each describing a pair of templates-directory and output-file.
// example:
//  plugins: [
//      new HandlebarsPlugin([
//          {
//              inputDir: "templates",
//              outputFile: "output/compiled-templates.js"
//          },
//          {
//              inputDir: "cached-templates",
//              outputFile: "output/compiled-cached-templates.js"
//          }
//      ])
//  ]
//

var fs = require('fs');
var path = require('path');
var extend = require('util')._extend;
var async = require('async');
var mkdirp = require('mkdirp');
var Handlebars = require('handlebars');
var nsdeclare = require('nsdeclare');
var _ = require('underscore');



var preFile = 'this["Handlebars"] = this["Handlebars"] || {};\n\
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};\n\n';
var preTemplate1 = 'this["Handlebars"]["templates"]["';
var preTemplate2 = '"] = Handlebars.template(';
var postTemplate = ');\n\n';

var prePartialTemplate1 = 'Handlebars.registerPartial("';
var prePartialTemplate2 = '", Handlebars.template(';
var postPartial = '));\n\n';


function defaultProcessPartialName(filepath) {
    var pieces = _.last(filepath.split('/')).split('.');
    var name   = _(pieces).without(_.last(pieces)).join('.'); // strips file extension
    if (name.charAt(0) === '_') {
      name = name.substr(1, name.length); // strips leading _ character
    }
    return name;
}


function extractGlobalNamespace(nsDeclarations) {
    // Extract global namespace from any existing namespace declaration.
    // The purpose of this method is too fix an issue with AMD when using namespace as a function where the
    // nsInfo.namespace will contains the last namespace, not the global namespace.

    var declarations = _.keys(nsDeclarations);

    // no declaration found
    if (!declarations.length) {
      return '';
    }

    // In case only one namespace has been declared it will only return it.
    if (declarations.length === 1) {
      return declarations[0];
    }
    // We only need to take any declaration to extract the global namespace.
    // Another option might be find the shortest declaration which is the global one.
    var matches = declarations[0].match(/(this\[[^\[]+\])/g);
    return matches[0];
}

function CompileHandlebars(options) {
    var tasks = Array.isArray(options) ? options : [options];

    this.options = tasks.map(function(taskOptions) {
        return extend({
            inputDir: "templates",
            outputFile: "compiled-templates.js",
            outputDir: "",
            namespace: 'JST',
            seperator: '\r\n',
            wrapped: true,
            amd: false,
            commonjs: false,
            knownHelpers: [],
            knownHelpersOnly: false
        }, taskOptions);
    });
}

 // Just get the namespace info for a given template
var getNamespaceInfo = _.memoize(function(filepath) {
    if (!useNamespace) {
      return undefined;
    }
    if (_.isFunction(options.namespace)) {
      return nsdeclare(options.namespace(filepath), nsDeclareOptions);
    }
    return nsdeclare(options.namespace, nsDeclareOptions);
  });

CompileHandlebars.prototype.apply = function(compiler) {
    var plugin = this;
    
    console.log("CompileHandlebars plugin is loading... " + JSON.stringify(plugin.options));

    // content conversion for templates
    var defaultProcessContent = function(content) { return content; };

    // AST processing for templates
    var defaultProcessAST = function(ast) { return ast; };

    // filename conversion for templates
    var defaultProcessName = function(name) { return name; };

    // assign regex for partials directory detection
    var partialsPathRegex = this.options.partialsPathRegex || /./;

    // assign regex for partial detection
    var isPartialRegex = this.options.partialRegex || /^_/;

    // assign transformation functions
    var processContent = this.options.processContent || defaultProcessContent;
    var processName = this.options.processName || defaultProcessName;
    var processPartialName = this.options.processPartialName || defaultProcessPartialName;
    var processAST = this.options.processAST || defaultProcessAST;
    var useNamespace = this.options.namespace !== false;


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

        var compilerOptions = this.options.compilerOptions || {};


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
                    }, 
                    function(cb) {
                        var fileName = files[index], shortFileName = fileName.match(/(.*)\..*/)[1];
                        var input = path.join(options.inputDir, fileName);
                        
                        if (!fs.lstatSync(input).isFile()) {
                            setTimeout(function() {
                                index ++;
                                cb();
                            }, 0);
                            return;
                        }
                      
                        fs.readFile(input, 'utf8', function (err, data) {
                            if (err) {
                                console.log(err);
                                return cb(err);
                            }
                            
                            var declarations = [];
                            var partials = [];
                            var templates = [];
                            // template identifying parts
                            var ast, compiled, filename;
                    
                            // Namespace info for current template
                            var nsInfo;
                    
                            // Map of already declared namespace parts
                            var nsDeclarations = {};
                    
                            // nsdeclare options when fetching namespace info
                            var nsDeclareOptions = {response: 'details', declared: nsDeclarations};

                            var src = processContent(data, filepath);

                            try {
                                // parse the handlebars template into it's AST
                                ast = processAST(Handlebars.parse(src));
                                compiled = Handlebars.precompile(ast, compilerOptions);
                      
                                // if configured to, wrap template in Handlebars.template call
                                if (options.wrapped === true) {
                                    compiled = 'Handlebars.template(' + compiled + ')';
                                }
                            } 
                            catch (e) {
                                console.log(e);
                                console.warn('Handlebars failed to compile ' + filepath + '.');
                            }

                            // register partial or add template to namespace
                            if (partialsPathRegex.test(filepath) && isPartialRegex.test(_.last(filepath.split('/')))) {
                                filename = processPartialName(filepath);
                                
                                if (options.partialsUseNamespace === true) {
                                    nsInfo = getNamespaceInfo(filepath);
                                    if (nsInfo.declaration) {
                                        declarations.push(nsInfo.declaration);
                                    }
                                    partials.push('Handlebars.registerPartial(' + JSON.stringify(filename) + ', ' + nsInfo.namespace +
                                    '[' + JSON.stringify(filename) + '] = ' + compiled + ');');
                                } 
                                else {
                                    partials.push('Handlebars.registerPartial(' + JSON.stringify(filename) + ', ' + compiled + ');');
                                }
                            } 
                            else {
                                if ((options.amd || options.commonjs) && !useNamespace) {
                                    compiled = 'return ' + compiled;
                                }
                                filename = processName(filepath);
                                if (useNamespace) {
                                    nsInfo = getNamespaceInfo(filepath);
                                    if (nsInfo.declaration) {
                                        declarations.push(nsInfo.declaration);
                                    }
                                    templates.push(nsInfo.namespace + '[' + JSON.stringify(filename) + '] = ' + compiled + ';');
                                } 
                                else if (options.commonjs === true) {
                                    templates.push(compiled + ';');
                                } 
                                else {
                                    templates.push(compiled);
                                }
                            }

                            var output = declarations.concat(partials, templates);
                            if (output.length < 1) {
                                grunt.log.warn('Destination not written because compiled files were empty.');
                            } 
                            else {
                                if (useNamespace && options.node) {
                                    output.unshift('Handlebars = glob.Handlebars || require(\'handlebars\');');
                                    output.unshift('var glob = (\'undefined\' === typeof window) ? global : window,');

                                    var nodeExport = 'if (typeof exports === \'object\' && exports) {';
                                    nodeExport += 'module.exports = ' + nsInfo.namespace + ';}';

                                    output.push(nodeExport);
                                }

                                if (options.amd) {
                                    // Wrap the file in an AMD define fn.
                                    if (typeof options.amd === 'boolean') {
                                        output.unshift('define([\'handlebars\'], function(Handlebars) {');
                                    } 
                                    else if (typeof options.amd === 'string') {
                                        output.unshift('define([\'' + options.amd + '\'], function(Handlebars) {');
                                    } 
                                    else if (typeof options.amd === 'function') {
                                        output.unshift('define([\'' + options.amd(filename, ast, compiled) + '\'], function(Handlebars) {');
                                    } 
                                    else if (Array.isArray(options.amd)) {
                                        // convert options.amd to a string of dependencies for require([...])
                                        var amdString = '';
                                        for (var i = 0; i < options.amd.length; i++) {
                                            if (i !== 0) {
                                                amdString += ', ';
                                            }

                                            amdString += '\'' + options.amd[i] + '\'';
                                        }

                                        // Wrap the file in an AMD define fn.
                                        output.unshift('define([' + amdString + '], function(Handlebars) {');
                                    }

                                    if (useNamespace) {
                                        // Namespace has not been explicitly set to false; the AMD
                                        // wrapper will return the object containing the template.
                                        output.push('return ' + extractGlobalNamespace(nsDeclarations) + ';');
                                    }
                                    output.push('});');
                                }

                                if (options.commonjs) {
                                    if (useNamespace) {
                                        output.push('return ' + nsInfo.namespace + ';');
                                    }
                                    // Export the templates object for CommonJS environments.
                                    output.unshift('module.exports = function(Handlebars) {');
                                    output.push('};');
                                }
                            }

                            // console.log(templateSpec);
                            fs.appendFile(outputFile, output.join(grunt.util.normalizelf(options.separator)), function (err) {
                                index ++;
                                cb(err);
                            });
                        });
                    });

                }, cb);
            },
            function(cb) {
                console.log("Precompiled " + index + " templates from " + options.inputDir + " to " + options.outputFile);
                cb();
            }
        ], callback);
    }
};

module.exports = CompileHandlebars;
