/*
 * Initialize the graphic.
 */
var pymChild = null;
var onWindowLoaded = function() {
    pymChild = new pym.Child({});

    pymChild.onMessage('on-screen', function(bucket) {
        console.log('asset1-on-screen');
    });
    pymChild.onMessage('scroll-depth', function(data) {
        console.log('asset1-scrolldepth');
        data = JSON.parse(data);
    });
}

/*
 * Initially load the graphic
 * (NB: Use window.load to ensure all images have loaded)
 */
window.onload = onWindowLoaded;
