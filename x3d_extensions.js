
/**
* Modifies the current camera of the scene in such a way that
* all elements are visible to the user.
*
* @param X3D.runtime Instance of X3D runtime which becomes available
*    after a scene is fully loaded.
*/

var x3dExtensions = {}

x3dExtensions.interpInterval = undefined

// typing "x3dom.runtime.showAll()" in the console will yield same result except it will add an animation
x3dExtensions.normalizeCamera = function (runtime) {
	var viewarea = runtime.canvas.doc._viewarea
	var animateTo_bak = viewarea.animateTo
	viewarea.animateTo = function(target, prev, dur) {
		viewarea._scene.getViewpoint().setView(target)
	}
	viewarea.showAll()
	viewarea.animateTo = animateTo_bak
}

/**
 * Returns the view matrix components from
 * the IWC parameters
 * @param X3DRuntime runtime information for retrieving
 *  the current local state of view matrix.
 * @return position translationMatrix
 * @return rotation rotationMatrix
 */
x3dExtensions.getView = function (runtime) {
	return runtime.canvas.doc._viewarea.getViewMatrix()
}

/*
 * Sets up the view matrix from the data provided
 * by a remote client.
 * @param X3DRuntime Runtime element to modify the local view matrix.
 * @param data Remote data
 * @param finishedCallback Callback triggered when modification
 * is complete
 */
x3dExtensions.setView = function (runtime, target, duration) {
	// copied from "x3dom.Viewarea.prototype.animateTo" in "Viewarea.js"

	// this function does not modify the CenterOfRotation or the Viewpoint
	// to do this, additionally to the target-viewmatrix a vector has to be provided

	// the viewmatrix is calculated with following formula: (see "Viewarea.js"→"x3dom.Viewarea.prototype.getViewMatrix")
	// "viewarea.getViewpointMatrix().mult(viewarea._transMat).mult(viewarea._rotMat)

	var viewarea = runtime.canvas.doc._viewarea
	viewarea._mixer._beginTime = viewarea._lastTS
	viewarea._mixer._endTime = viewarea._lastTS + duration/1000.0

	viewarea._mixer.setBeginMatrix( viewarea.getViewMatrix() )
	viewarea._mixer.setEndMatrix( x3dom.fields.SFMatrix4f.copy(target) )

	viewarea._rotMat = x3dom.fields.SFMatrix4f.identity();
	viewarea._transMat = x3dom.fields.SFMatrix4f.identity();
	viewarea._movement = new x3dom.fields.SFVec3f(0, 0, 0);
}

// creating debugging environment
x3dExtensions.debug = function() {
	runtime = $('x3d')[0].runtime
	va = runtime.canvas.doc._viewarea
	logViewport = function () {
		sync.x3dViewport.addEventListener('viewpointChanged'
											, function (e) { console.log(e) }
											) }
	mixer = va._mixer

}
