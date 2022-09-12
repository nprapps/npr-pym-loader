/*
* npr-pym-loader is a wrapper library that deals with particular CMS scenarios to successfully load Pym.js and carebot in NPR.org into a given page
* To find out more about Pym.js check out the docs at http://blog.apps.npr.org/pym.js/ or the readme at README.md for usage.
*/

/** @module npr-pym-loader */
(function(requirejs, jQuery) {
    var pymParents = [];
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

    // PJAXNavigation
    var onPJAXNavigateMessage = function(url) {
        var anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.setAttribute('href', url);
        document.getElementById('main-section').appendChild(anchor);
        anchor.click();
        anchor.parentNode.removeChild(anchor);
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
            var containers = document.querySelectorAll('[data-pym-loader]:not([data-embed-loaded])');
            for (var idx = 0; idx < containers.length; ++idx) {
                if (containers[idx].getAttribute('id') === null) {
                    console.error('container element does not have an id attribute');
                    continue;
                }
                if (containers[idx].getAttribute('data-child-src') === null) {
                    console.error('container element does not have a data-child-src attribute');
                    continue;
                }
                (function() {
                    var container = containers[idx];
                    // Check scroll track options
                    var config = {};
                    if (container.getAttribute('data-pym-trackscroll') !== null) {
                        config['trackscroll'] = true;
                    }
                    if (container.getAttribute('data-pym-scrollwait') !== null) {
                        var n = Number(container.getAttribute('data-pym-scrollwait'));
                        if (!isNaN(n)) {
                            config['scrollwait'] = n;
                        }
                    }

                    var pymParent = new pym.Parent(
                        container.getAttribute('id'),
                        container.getAttribute('data-child-src'),
                        config
                    );
                    container.setAttribute('data-embed-loaded', '');

                    // Tell OneTrust to ignore this iframe
                    pymParent.iframe.setAttribute("data-ot-ignore","");

                    if (onNpr()) {
                        pymParent.onMessage('pjax-navigate', onPJAXNavigateMessage);
                    }
                    pymParents.push(pymParent);
                })();
                window.npr_pym_loader_loading = undefined;
            }
            return true;
        }
        return false;
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
            var instances = pymParents;
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
            var context = 'context_loader_' + pymUrl.split('/').slice(-1)[0];
            // Requirejs detected, create a local require.js namespace
            var require_pym = requirejs.config({
                'context': context,
                'paths': paths,
                'shim': shim
            });

            // Load pym into local namespace
            require_pym(libs, function(require, pym, carebot) {
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
                    jQuery(function () {
                        initializePym(window.pym);
                        // Load carebot when used inside npr.org
                        if (carebotUrl) {
                            jQuery.getScript(carebotUrl).done(function() {
                                initializeCarebot(window.pym, window.CarebotTracker);
                            });
                        }
                    });
                })
                .fail(function() {
                    console.error('could not load pym with jQuery');
                    window.npr_pym_loader_loading = undefined;
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
            window.npr_pym_loader_loading = undefined;
        };
        head.appendChild(script);
    };

    var pymUrl = "@@defaultPymUrl";
    var carebotUrl = "@@defaultCarebotUrl";
    carebotUrl =  onNpr() ? carebotUrl : null;
    // @ifdef ENV='production'
    // remove local test code
    pymUrl = 'https://pym.nprapps.org/pym.v1.min.js';
    carebotUrl = 'https://carebot.nprapps.org/carebot-tracker.v0.min.js';
    // @endif

    // Start load strategy
    // When the loader is added multiple times to the same page we need
    // to actually load scripts just once for better performance
    // 1. Use a flag (npr_pym_loader_loading) to account for asynchronous loading and remove it on actual load or error
    if (!window.npr_pym_loader_loading) {
        // Set the global loading flag
        window.npr_pym_loader_loading = true;
        tryLoadingWithRequirejs(pymUrl, carebotUrl) || tryLoadingWithJQuery(pymUrl, carebotUrl) || loadPymViaEmbedding(pymUrl, carebotUrl);
    }
})(window.requirejs, window.jQuery);
