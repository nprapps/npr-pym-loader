/*
 * Initialize the graphic.
 */
var pymChild = null;
var onWindowLoaded = function() {
    pymChild = new pym.Child();
}

/*
 * Initially load the graphic
 * (NB: Use window.load to ensure all images have loaded)
 */
window.onload = onWindowLoaded;
