/*
 * grunt
 * https://github.com/cowboy/grunt
 *
 * Copyright (c) 2012 "Cowboy" Ben Alman
 * Licensed under the MIT license.
 * http://benalman.com/about/license/
 */

var grunt = require('../grunt');

// Nodejs libs.
var fs = require('fs');
var path = require('path');

// External libs.
var glob = require('glob-whatev');

// The module to be exported.
var file = module.exports = {};

// Change the current base path (ie, CWD) to the specified path.
file.setBase = function() {
  var dirpath = path.join.apply(path, arguments);
  process.chdir(dirpath);
};

// Return an array of all file paths that match the given wildcard patterns.
file.expand = function() {
  // Use the first argument if it's an Array, otherwise convert the arguments
  // object to an array and use that.
  var patterns = arguments[0] instanceof Array ? arguments[0] : grunt.utils.toArray(arguments);
  // Generate a should-be-unique number.
  var uid = +new Date();
  // Return a flattened, uniqued array of matching file paths.
  return grunt.utils._(patterns).chain().flatten().map(function(pattern) {
    // If pattern is a template, process it accordingly.
    pattern = grunt.template.process(pattern);
    // Just return the pattern if it's an internal directive.
    if (grunt.task.getDirectiveParts(pattern)) { return pattern; }
    // Otherwise, expand paths.
    return glob.glob(pattern);
  }).flatten().uniq(false, function(filepath) {
    // Only unique file paths, but don't unique <something> directives, in case
    // they are repeated intentionally.
    return grunt.task.getDirectiveParts(filepath) ? ++uid : filepath;
  }).value();
};

// Further filter file.expand.
function expandByType(type) {
  return file.expand.apply(file, arguments).filter(function(filepath) {
    // Just return the filepath if it's an internal directive.
    if (grunt.task.getDirectiveParts(filepath)) { return filepath; }
    try {
      return fs.statSync(filepath)[type]();
    } catch(e) {
      throw grunt.task.taskError(e.message, e);
    }
  });
}

// A few type-specific file expansion methods.
file.expandDirs = expandByType.bind(file, 'isDirectory');
file.expandFiles = expandByType.bind(file, 'isFile');

// Return an array of all file paths that match the given wildcard patterns,
// plus any URLs that were passed at the end.
file.expandFileURLs = function() {
  // Use the first argument if it's an Array, otherwise convert the arguments
  // object to an array and use that.
  var patterns = arguments[0] instanceof Array ? arguments[0] : grunt.utils.toArray(arguments);
  var urls = [];
  // Filter all URLs out of patterns list and store them in a separate array.
  patterns = patterns.filter(function(pattern) {
    if (/^(?:file|https?):\/\//i.test(pattern)) {
      // Push onto urls array.
      urls.push(pattern);
      // Remove from patterns array.
      return false;
    }
    // Otherwise, keep pattern.
    return true;
  });
  // Return expanded filepaths with urls at end.
  return file.expandFiles(patterns).map(function(filepath) {
    var abspath = path.resolve(filepath);
    // Convert C:\foo\bar style paths to /C:/foo/bar.
    if (abspath.indexOf('/') !== 0) {
      abspath = ('/' + abspath).replace(/\\/g, '/');
    }
    return 'file://' + abspath;
  }).concat(urls);
};

// Like mkdir -p. Create a directory and any intermediary directories.
file.mkdir = function(dirpath) {
  if (grunt.option('no-write')) { return; }
  var parts = [];
  dirpath.split('/').forEach(function(part) {
    parts.push(part);
    var subpath = parts.join('/');
    if (part && !path.existsSync(subpath)) {
      fs.mkdirSync(subpath, '0755');
    }
  });
};

// Recurse into a directory, executing callback for each file.
file.recurse = function recurse(rootdir, callback, subdir) {
  var abspath = subdir ? path.join(rootdir, subdir) : rootdir;
  fs.readdirSync(abspath).forEach(function(filename) {
    var filepath = path.join(abspath, filename);
    if (fs.statSync(filepath).isDirectory()) {
      recurse(rootdir, callback, path.join(subdir, filename));
    } else {
      callback(path.join(rootdir, subdir, filename), rootdir, subdir, filename);
    }
  });
};

var root = path.resolve('/');

// Is a given file path absolute?
file.isPathAbsolute = function() {
  var filepath = path.join.apply(path, arguments);
  return filepath.indexOf(root) === 0;
};

// Search for a filename in the given directory or all parent directories.
file.findup = function findup(rootdir, filename) {
  var filepath = path.join(rootdir, filename);
  if (path.existsSync(filepath)) {
    return filepath;
  } else if (rootdir === root) {
    return null;
  } else {
    return findup(path.resolve(rootdir, '..'), filename);
  }
};

// Write a file.
file.write = function(filepath, contents) {
  var nowrite = grunt.option('no-write');
  grunt.verbose.write((nowrite ? 'Not actually writing ' : 'Writing ') + filepath + '...');
  try {
    // Create path, if necessary.
    file.mkdir(path.dirname(filepath));
    if (!nowrite) {
      // Actually write file.
      fs.writeFileSync(filepath, contents);
    }
    grunt.verbose.ok();
    return true;
  } catch(e) {
    grunt.verbose.error();
    throw grunt.task.taskError('Unable to write "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Read a file, return its contents.
file.read = function(filepath, encoding) {
  var src;
  grunt.verbose.write('Reading ' + filepath + '...');
  try {
    src = fs.readFileSync(String(filepath), encoding ? null : 'utf8');
    grunt.verbose.ok();
    return src;
  } catch(e) {
    grunt.verbose.error();
    throw grunt.task.taskError('Unable to read "' + filepath + '" file (Error code: ' + e.code + ').', e);
  }
};

// Read a file, optionally processing its content, then write the output.
file.copy = function(srcpath, destpath, options) {
  if (!options) { options = {}; }
  var src = file.read(srcpath, true);
  if (options.process) {
    grunt.verbose.write('Processing source...');
    try {
      src = options.process(src.toString('utf8'));
      grunt.verbose.ok();
    } catch(e) {
      grunt.verbose.error();
      throw grunt.task.taskError('Error while processing "' + srcpath + '" file.', e);
    }
  }
  file.write(destpath, src);
};

// Read a file, parse its contents, return an object.
file.readJSON = function(filepath) {
  var src = this.read(String(filepath));
  var result;
  grunt.verbose.write('Parsing ' + filepath + '...');
  try {
    result = JSON.parse(src);
    grunt.verbose.ok();
    return result;
  } catch(e) {
    grunt.verbose.error();
    throw grunt.task.taskError('Unable to parse "' + filepath + '" file (' + e.message + ').', e);
  }
};

// Clear the require cache for all passed filepaths.
file.clearRequireCache = function() {
  // If a non-string argument is passed, it's an array of filepaths, otherwise
  // each filepath is passed individually.
  var filepaths = typeof arguments[0] !== 'string' ? arguments[0] : grunt.utils.toArray(arguments);
  // For each filepath, clear the require cache, if necessary.
  filepaths.forEach(function(filepath) {
    var abspath = path.resolve(filepath);
    if (require.cache[abspath]) {
      grunt.verbose.write('Clearing require cache for "' + filepath + '" file...').ok();
      delete require.cache[abspath];
    }
  });
};

// Access files in the user's ".grunt" folder.
file.userDir = function() {
  var dirpath = path.join.apply(path, arguments);
  var win32 = process.platform === 'win32';
  var homepath = process.env[win32 ? 'USERPROFILE' : 'HOME'];
  dirpath = path.resolve(homepath, '.grunt', dirpath);
  return path.existsSync(dirpath) ? dirpath : null;
};
