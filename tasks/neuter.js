/*
 * grunt-neuter
 *
 * Copyright (c) 2012 Trek Glowacki, contributors.
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {
  grunt.registerMultiTask('neuter', 'Concatenate files in the order you require', function() {
    // track required files for this task.
    // once a file has been required it will be added to this array
    // which will be checked before attempting to add a file.
    // each file can be required only once.
    var required = [];

    // the bufffer that we appened to over this run. 
    var out = [];

    // keeps track of out available compile to files
    var filteredFiles = [];

    // Hash of possible compile to languages    
    var compileTo = {
      'coffee' : {
        extension: 'coffee',
        moduleName: 'coffee-script'
      }
    }
    
    var options = this.options({
      template: "(function() {\n\n<%= src %>\n\n})();",
      separator: "\n\n",
      includeSourceURL: false,
      baseURL: '',
      compileTo: '',
    });

    var baseURL = options.baseURL

    if (baseURL){
      baseURL = baseURL[baseURL.length] !== '/' ? baseURL + '/' : baseURL;
    }

    // Check to see if the compile to language is valid
    if (options.compileTo !== '' && !compileTo[options.compileTo]){
      grunt.log.error('Compile to ' + options.compileTo + ' is not available.')
      return ''
    }

    // matches `require('some/path/file');` statements.
    // no need to include an extension as this will be appended for you.
    var requireSplitter = /(require[\(||\s][\'||\"].*[\'||\"||\'\)||\"\) || \"\)\; || \'\)\;])\n*/;
    var requireMatcher = /require[\(||\s][\'||\"](.*)[\'||\"]/;

    /*
      Attempt to find a vanilla javascript file of the same name.
    */
    var tryJs = function(filepath){
      var jsPath = filepath.substring(0, filepath.indexOf('.' + compileTo[options.compileTo].extension)) + '.js';
      grunt.log.ok('Could not find "' + filepath + '" checking for dependency at ' + jsPath);
      return finder(jsPath, true);
    }

    var finder = function(filepath, checkedJs){

      if (checkedJs == null){
        checkedJs = false
      }

      /*
        NOTE: Because grunt.file.exists returns a bool
        we have to graciously handle the conditions where
        the dependency is a js file and not a compile to 
        language
      */
      if (!grunt.file.exists(filepath)) {
        // Check the file again but this time as a js file
        if (compileTo[options.compileTo] && !checkedJs){
          tryJs(filepath)
        } else if (!grunt.file.exists(filepath) && checkedJs){
          // Couldn't find the dependency so let the user know
          grunt.log.error('Source file "' + filepath + '" not found.');
        }
        return '';
      }  else if (checkedJs && grunt.file.exists(filepath)) {
          // Found the js file
          grunt.log.ok('Found dependency at "' + filepath + '"');
      } 

      // once a file has been required its source will 
      // never be written to the resulting destination file again.
      if (required.indexOf(filepath) === -1) {
        required.push(filepath);

        // read the file and split it into code sections
        // these will be either require(...) statements
        // or blocks of code.

        var src = grunt.file.read(filepath);
        var sections = src.split(requireSplitter);

        // loop through sections appending to out buffer.
        sections.forEach(function(section){

          if (!section.length) { return; }

          // if the section is a require statement
          // recursively call find again. Otherwise
          // push the code section onto the buffer.
          var match = requireMatcher.exec(section);

          if (match) {
            if (compileTo[options.compileTo]){
              finder(baseURL + match[1] + '.' + compileTo[options.compileTo].extension);
            } else {
              finder(baseURL + match[1] + '.js');
            }
          } else {
            out.push({filepath: filepath, src: section});
          }
        });
      }
    };

    var determinePath = function (path){
      if(baseURL){
        if(path.substring(0, baseURL.length) === baseURL){
          path = path.substr(baseURL.length, path.length);
        }
        return baseURL + path
      }
      // Return the initial path if no cases are truthy
      return path;
    }

    // Creates an array of acceptable files to compile
    var filterOutJsfiles = function (filepath) {
      if (filepath.substring(filepath.indexOf('.' + compileTo[options.compileTo].extension), filepath.length) === '.' + compileTo[options.compileTo].extension) {
        filteredFiles.push(filepath);
      }
    }

    // kick off the process. Find code sections, combine them
    // in the correct order by wrapping in the template
    // which defaults to a functional closure.
    this.files.forEach(function(file) {
      grunt.file.expand({nonull: true}, file.src).map(function(path){
        path = determinePath(path);
        finder(path);
      }, this);

      var outStr = out.map(function(section){
        
        // Filter out all of the js files
        if (options.compileTo !== ''){
          filterOutJsfiles(section.filepath);
        }

        // Compile just the compile to files
        if (options.compileTo !== '' && filteredFiles.indexOf(section.filepath) > -1){
          section.src = require(compileTo[options.compileTo].moduleName).compile(section.src, {bare: true});
        }

        var templateData = {
          data: section
        };

        if (options.includeSourceURL) {
          return "eval(" + JSON.stringify(grunt.template.process(options.template, templateData) + "//@ sourceURL=" + section.filepath) +")";
        } else {
          return grunt.template.process(options.template, templateData);
        }
      }).join(options.separator);

      grunt.file.write(file.dest, outStr);
    });
  });
};
