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
    gv = global.gv,
    co = require('co'),  /* not included in localizr package! */
    thunkify = require('thunkify');  /* not included in localizr package! */

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
          
            var cah_i18n_server, data_cached, data_file, data_file_globals, file_globals, i, spud_deserialize_thunk;
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
              cah_i18n_server = global.caches.cah_i18n_server;
            } catch(e) { cah_i18n_server = null; }
            data_file = {}; data_file_globals = {};
            spud_deserialize_thunk = thunkify(spud.deserialize);
            
            var step3 = function() {
              that._data = merge(false, data_file_globals, data_file);
              that.load(callback);
            };
            
            /* get view i18n properties */
            var step2 = function() {
              co(function *() {
                data_cached = null;
                // Check if data is in cache already...
                if (cah_i18n_server!=null) {
                  if (cah_i18n_server.type==='lru')         data_cached = cah_i18n_server.get(that.file);
                  else if (cah_i18n_server.type==='redis')  data_cached = yield cah_i18n_server.get(that.file);
                  if (data_cached!=null) {
                    //console.log('IN CACHE [server] view!!! ('+cah_i18n_server.type+')', (false ? data_cached : ''));
                    data_file = data_cached;
                    step3();
                    return;
                  }
                }
                // If data is NOT in cache, get data from properties file...
                if (data_cached==null) {
                  if (gv.file_exists(that.file)==false)  { 
                    if (cah_i18n_server.type=='lru')         cah_i18n_server.del(''+that.file);
                    else if (cah_i18n_server.type=='redis')  yield cah_i18n_server.del(''+that.file);
                    data_file = {};
                    step3();
                    return;
                  }
                  data_cached = yield spud_deserialize_thunk(fs.createReadStream(that.file), that.type);
                  if (cah_i18n_server!=null && cah_i18n_server.type==='lru')         cah_i18n_server.set(that.file, data_cached);
                  else if (cah_i18n_server!=null && cah_i18n_server.type==='redis')  yield cah_i18n_server.set(that.file, data_cached);
                  data_file = data_cached;
                  step3();
                }
              }).catch(function(err) {
                console.error('ERROR [localizr/lib/bundle]: '+err.stack);
                callback(err);
                /* NOTE: we don't throw this error since it would propagate up to the view */
              });
            };
            
            /* get globals i18n properties */
            var step1 = function() {
              co(function *() {
                data_cached = null;
                if (file_globals!=null) {
                  // Check if data is in cache already...
                  if (cah_i18n_server!=null) {
                    if (cah_i18n_server.type==='lru')         data_cached = cah_i18n_server.get(file_globals);
                    else if (cah_i18n_server.type==='redis')  data_cached = yield cah_i18n_server.get(file_globals);
                    if (data_cached!=null) {
                      //console.log('IN CACHE [server] globals !!! ('+cah_i18n_server.type+')', (false ? data_cached : ''));
                      data_file_globals = data_cached;
                      step2();
                      return;
                    }
                  }
                  // If data is NOT in cache, get data from properties file...
                  if (data_cached==null) {
                    if (gv.file_exists(file_globals)==false)  { 
                      if (cah_i18n_server.type=='lru')         cah_i18n_server.del(file_globals);
                      else if (cah_i18n_server.type=='redis')  yield cah_i18n_server.del(file_globals);
                      data_file_globals = {};
                      step2();
                      return;
                    }
                    data_cached = yield spud_deserialize_thunk(fs.createReadStream(file_globals), 'properties');
                    if (cah_i18n_server!=null && cah_i18n_server.type==='lru')         cah_i18n_server.set(file_globals, data_cached);
                    else if (cah_i18n_server!=null && cah_i18n_server.type==='redis')  yield cah_i18n_server.set(file_globals, data_cached);
                    data_file_globals = data_cached;
                    step2();
                  }
                } else step2();
              }).catch(function(err) {
                console.error('ERROR [localizr/lib/bundle]: '+err.stack);
                step2();
                /* NOTE: we don't throw this error since it would propagate up to the view */
              });                
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
