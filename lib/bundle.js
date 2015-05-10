/*───────────────────────────────────────────────────────────────────────────*\
 │  Copyright (C) 2014 eBay Software Foundation                               │
 │                                                                            │
 │  Licensed under the Apache License, Version 2.0 (the "License");           │
 │  you may not use this file except in compliance with the License.          │
 │  You may obtain a copy of the License at                                   │
 │                                                                            │
 │    http://www.apache.org/licenses/LICENSE-2.0                              │
 │                                                                            │
 │  Unless required by applicable law or agreed to in writing, software       │
 │  distributed under the License is distributed on an "AS IS" BASIS,         │
 │  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  │
 │  See the License for the specific language governing permissions and       │
 │  limitations under the License.                                            │
 \*───────────────────────────────────────────────────────────────────────────*/
'use strict';

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    spud = require('spud'),
    merge = require('merge'),
    gv = global.gv;

var VError = require('verror');

var missing = '☃%s☃';

var prototype = {

    get: function get(key) {
        var namespace, value;

        if (!this._data) {
            throw new Error('Bundle not loaded.');
        }

        if (typeof key !== 'string') {
            return util.format(missing, String(key));
        }

        namespace = key.split('.');
        value = this._data;

        while (value && namespace.length) {
            value = value[namespace.shift()];
        }

        if (value === undefined || value === null) {
            value = util.format(missing, key);
        }

        return value;
    },

    load: function (callback) {
        var that = this;

        if (this._data) {
            callback(null, this);
            return;
        }

        if (!this.file) {
            callback(new Error('Content bundle not found: ' + this.name));
            return;
        }

        try {
          
            var i18n_cache, data_cached, data_file, data_file_globals, file_globals, i;
            // Get globals.properties file for current country and language
            if (global.holders!=null && global.holders.settings!=null && global.holders.settings.folder_i18n!=null) {
              file_globals = {base:global.holders.settings.folder_i18n, base_split:null, locale_sequence:['country','lang'], ilocale_sequence:-1};
              if (this.file.substring(0,file_globals.base.length)==file_globals.base) {
                file_globals.base_split = this.file.substring(file_globals.base.length).split( path.sep );
                for (i=0;i<file_globals.base_split.length;i++) {
                  if (i===0 && file_globals.base_split[i]==='') continue;
                  if (file_globals.ilocale_sequence+1>=file_globals.locale_sequence.length)  break;
                  file_globals.ilocale_sequence++; 
                  file_globals.base += path.sep + file_globals.base_split[i];
                  file_globals[ file_globals.locale_sequence[file_globals.ilocale_sequence] ] = file_globals.base_split[i];
                }
                if (file_globals.ilocale_sequence!=file_globals.locale_sequence.length-1)  file_globals = {lang:'en'};
                file_globals = path.join(global.holders.settings.folder_i18n, 'globals', 'globals_'+file_globals.lang+'.properties');
              }
            }
            try { 
              if (global.holders.app.settings.env=='production')
                i18n_cache = global.holders.i18n_cache;
            } catch(e) { i18n_cache = null; }
            if (i18n_cache==null)  i18n_cache = {};
            data_file = {}; data_file_globals = {};
            
            
            var step3 = function() {
              that._data = merge(false, data_file_globals, data_file);
              that.load(callback);
            };
            
            var step2 = function() {
              if (i18n_cache!=null && (data_cached = i18n_cache[''+that.file])!=null) {
                data_file = data_cached;
                step3();
                return;
              } else {
                if (gv.file_exists(that.file)==false)  { i18n_cache[''+that.file] = data_file = {}; step3(); return; }
                spud.deserialize(fs.createReadStream(that.file), that.type, function (err, data) {
                  if (err) {
                    callback(err);
                    return;
                  }
                  i18n_cache[''+that.file] = data_file = data;
                  step3();
                });
              }
            };
            
            var step1 = function() {
              if (file_globals!=null) {
                if (i18n_cache!=null && (data_cached = i18n_cache[''+file_globals])!=null) {
                  data_file_globals = data_cached;
                  step2();
                } else {
                  if (gv.file_exists(file_globals)==false)  { i18n_cache[''+file_globals] = data_file_globals = {}; step2(); return; }
                  spud.deserialize(fs.createReadStream(file_globals), 'properties', function (err, data) {
                    if (err) {
                      step2();
                      return;
                    }
                    i18n_cache[''+file_globals] = data_file_globals = data;
                    step2();
                  });
                }
              } else step2();
            };

            step1();            
            
            
        } catch (e) {
          var err = new VError(e, "Could not load bundle '%s'", this.file);
          setImmediate(function () {
            callback(err);
          });
        }
    }

};


exports.create = function (file) {

    file = file || '';

    return Object.create(prototype, {
        _data: {
            enumerable: false,
            writable: true,
            value: undefined
        },

        file: {
            enumerable: true,
            writable: false,
            value: file
        },

        type: {
            enumerable: true,
            writable: false,
            value: path.extname(file).substr(1)
        },

        name: {
            enumerable: true,
            writable: false,
            value: path.basename(file, path.extname(file))
        }
    });
};


exports.isContentBundle = function (obj) {
    return prototype.isPrototypeOf(obj);
};
