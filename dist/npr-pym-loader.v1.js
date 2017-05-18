/*! npr-pym-loader.js - v1.0.0 - 2017-05-18 */
/*
* npr-pym-loader is a wrapper library that deals with particular CMS scenarios to successfully load Pym.js and carebot in NPR.org into a given page
* To find out more about Pym.js check out the docs at http://blog.apps.npr.org/pym.js/ or the readme at README.md for usage.
*/

/** @module npr-pym-loader */
(function(requirejs, jQuery) {
    /**
    * Create and dispatch a custom npr-pym-loader event
    *
    * @method _raiseCustomEvent
    * @inner
    *
    * @param {String} eventName
    */
   var _raiseCustomEvent = function(eventName) {
     var event = document.createEvent('Event');
     event.initEvent('npr-pym-loader:' + eventName, true, true);
     document.dispatchEvent(event);
   };

   var onNpr = function() {
        var re = /^https?:\/\/(www(-s1)?\.)?npr\.org/;
        if (window.location.href.match(re)) {
            return true;
        } else {
            return false;
        }
   };

    /**
    * Initialize pym instances if Pym.js itself is available
    *
    * @method initializePym
    * @instance
    *
    * @param {String} pym Pym.js loaded library.
    * @param {Boolean} doNotRaiseEvents flag to avoid sending custom events
    */
    var initializePym = function(pym, doNotRaiseEvents) {
        if(pym) {
            if (!doNotRaiseEvents) {
                _raiseCustomEvent("pym-loaded");
            }
            var autoInitInstances = pym.autoInit();
            return autoInitInstances;
        }
        return null;
    };

    /**
    * Initialize carebot instances if Pym.js itself is available
    *
    * @method initializeCarebot
    * @instance
    *
    * @param {Object} pym Pym.js loaded library.
    * @param {Object} carebot CarebotTracker loaded library.
    * @param {Boolean} doNotRaiseEvents flag to avoid sending custom events
    */
    var initializeCarebot = function(pym, carebot, doNotRaiseEvents) {
        if (pym && carebot) {
            if (!doNotRaiseEvents) { _raiseCustomEvent("carebot-loaded"); }
            var instances = pym.autoInitInstances;
            for (var idx = 0; idx < instances.length; ++idx) {
                if (instances[idx].el.getAttribute('data-carebot-skip') != null) {
                    continue;
                }

                // Create a valid anonymous closure for CarebotTracker callbacks
                (function() {
                    var instance = instances[idx];
                    new carebot.VisibilityTracker(instance.id, function(result) {
                        // Waiting for a more elegant solution synced with carebotTracker
                        if (instance.el.getElementsByTagName('iframe').length !== 0) {
                            instance.sendMessage('on-screen', result.bucket);
                        }
                    });
                    if (!doNotRaiseEvents) { _raiseCustomEvent("carebot-visibility-added"); }
                    // Check if there is already an scroll tracker somewhere on the page
                    if (!document.querySelector("[data-carebot-scroll]")) {
                        if (!doNotRaiseEvents) { _raiseCustomEvent("carebot-scroll-added"); }
                        instance.el.setAttribute("data-carebot-scroll", "");
                        new carebot.ScrollTracker('storytext', function(percent, seconds) {
                            // Waiting for a more elegant solution synced with carebotTracker
                            if (instance.el.getElementsByTagName('iframe').length !== 0) {
                                instance.sendMessage('scroll-depth', JSON.stringify({percent: percent,seconds: seconds}));
                            }
                        });
                    }
                })();
            }
        }
    };

    /**
     * Load pym with Requirejs if it is available on the page
     * Used in CorePublisher CMS member sites with persistent players
     * Create a different context to allow multiversion
     * via: http://requirejs.org/docs/api.html#multiversion
     *
     * @method tryLoadingWithRequirejs
     * @instance
     *
     * @param {String} pymUrl Url where Pym.js can be found
     */
    var tryLoadingWithRequirejs = function(pymUrl, carebotUrl) {
        if (typeof requirejs !== 'undefined') {
            // Requirejs config wants bare name, not the extension
            pymUrl = pymUrl.split(".js")[0];
            var paths = {'pym': pymUrl};
            var shim = {'pym': { 'exports': 'pym'}};
            var libs = ['require', 'pym'];
            if (carebotUrl) {
                carebotUrl = carebotUrl.split(".js")[0];
                paths['carebot'] = carebotUrl;
                shim['carebot'] = { 'exports': 'carebot' };
                libs.push('carebot');
            }
            var context = 'context_' + pymUrl.split('/').slice(-1)[0];
            // Requirejs detected, create a local require.js namespace
            var require_pym = requirejs.config({
                'context': context,
                'paths': paths,
                'shim': shim
            });

            // Load pym into local namespace
            require_pym(libs, function(require, pym, carebot) {
                window.npr_pym_loading = undefined;
                initializePym(pym);
                if (carebot) {
                    initializeCarebot(pym, carebot);
                }
            });
            return true;
        }
        return false;
    };

    /**
     * Load pym through jQuery async getScript module
     * Since this loader can be embedded multiple times in the same post
     * the function manages a global flag called pymloading to avoid
     * possible race conditions
     *
     * @method tryLoadingWithJQuery
     * @instance
     *
     * @param {String} pymUrl Url where Pym.js can be found
     * @param {String} carebotUrl Url where carebot-tracker.js can be found
     */
    var tryLoadingWithJQuery = function(pymUrl, carebotUrl) {
        if (typeof jQuery !== 'undefined' && typeof jQuery.getScript === 'function') {
            jQuery.getScript(pymUrl)
                .done(function() {
                    window.npr_pym_loading = undefined;
                    // Load carebot when used inside npr.org
                    if (carebotUrl) {
                        jQuery.getScript(carebotUrl).done(function() {
                            initializeCarebot(window.pym, window.CarebotTracker);
                        });
                    }
                })
                .fail(function() {
                    console.error('could not load pym with jQuery');
                    window.npr_pym_loading = undefined;
                });
            return true;
        }
        return false;
    };

    /**
     * As another loading fallback approach
     * try to append the script tag to the head of the document
     * via http://stackoverflow.com/questions/6642081/jquery-getscript-methods-internal-process
     * via http://unixpapa.com/js/dyna.html
     *
     * @method loadPymViaEmbedding
     * @instance
     *
     * @param {String} pymUrl Url where Pym.js can be found
     * @param {String} carebotUrl Url where carebot-tracker.js can be found
     */
    var loadPymViaEmbedding = function(pymUrl, carebotUrl) {
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = pymUrl;
        script.onload = function() {
            window.npr_pym_loading = undefined;
            // Remove the script tag once pym it has been loaded
            if (head && script.parentNode) {
                head.removeChild(script);
            }
            initializePym(window.pym);
            if (carebotUrl) {
                head = document.getElementsByTagName('head')[0];
                var carebotScript = document.createElement('script');
                carebotScript.type = 'text/javascript';
                carebotScript.src = carebotUrl;
                carebotScript.onload = function() {
                    // Remove the script tag once pym it has been loaded
                    if (head && carebotScript.parentNode) {
                        head.removeChild(carebotScript);
                    }
                    // Start tracking
                    initializeCarebot(window.pym, window.CarebotTracker);
                };
                head.appendChild(carebotScript);
            }
        };
        script.onerror = function() {
            console.error('could not append pym via embedding');
            window.npr_pym_loading = undefined;
        };
        head.appendChild(script);
    };

    var pymUrl = "https://pym.nprapps.org/pym.v1.min.js";
    var carebotUrl = "https://carebot.nprapps.org/carebot-tracker.v0.min.js";
    carebotUrl =  onNpr() ? carebotUrl : null;

    // When the loader is added multiple times to the same page we need
    // to actually load scripts just once in order not to loose the references
    // to the autoInitInstances
    // For that purpose we will use two checks
    // 1. If the page contains data-pym-auto-initialized elements
    //    that means pym is already loaded and executed on the page
    // 2. Use a flag (npr_pym_loading) to account for asynchronous loading and remove it on actual load or error
    if ((!document.querySelectorAll('[data-pym-auto-initialized]').length) &&
        (!window.npr_pym_loading)) {
        window.npr_pym_loading = true;
        tryLoadingWithRequirejs(pymUrl, carebotUrl) || tryLoadingWithJQuery(pymUrl, carebotUrl) || loadPymViaEmbedding(pymUrl, carebotUrl);

        /** Callback to initialize Pym.js on document load events
         *
         * @method pageLoaded
         * @instance
         */
        var pageLoaded = function() {
            document.removeEventListener("DOMContentLoaded", pageLoaded);
            window.removeEventListener("load", pageLoaded);
            return initializePym(window.pym, true);
        };

        // Listen to page load events to account for pjax load and sync issues
        window.document.addEventListener("DOMContentLoaded", pageLoaded);
        // Fallback for wider browser support
        window.addEventListener("load", pageLoaded);
    }

})(window.requirejs, window.jQuery);
