
sync = {}

sync.localId = Math.random()
sync.foreignId = 2 // must be != localId

sync.init = function () {

    /*
        inits handled in arrays to group their code more intuitively
    */

    sync.onDocLoad = []
    sync.onYLoad = []
    sync.onModelLoad = []

    // Doc-load
    $(document).ready( function () {
        sync.onDocLoad.forEach(function(callback){callback()})
    })

    // Y-creation
    sync.onDocLoad.push(function () {
        // The Y-object creation takes a fair amount of time, blocking the UI
        Y({
          db: {
            name: 'memory'
          },
          connector: {
            name: 'websockets-client',
            room: 'Anatomy2.0-y-js-demo-v1.1.0',
          },
         sourceDir: location.pathname + 'bower_components',
         share: {
             showcase: 'Map'
         }
        }).then(function (y) {
            sync.y = y

            // for debugging
            window.y = y

            // catching errors because else Y-js would eat them
            try { sync.onYLoad.forEach(function(callback){callback()}) }
            catch(err) { console.log('Error in Y-load callbacks: ', err)}
        })
    })

    // x3d-object loaded
    sync.modelLoaded = function () {
        sync.x3dRoot = $('x3d')[0]

        sync.onModelLoad.forEach(function(callback){callback()})
    }


    // eye candy: start with fullshown object
    sync.onModelLoad.push(function() {
      x3dExtensions.normalizeCamera(sync.x3dRoot.runtime)
    })

    //////// viewport sync

    /*
        How to decide on whether to apply received remote state and whether to send local state:

        When local change is caused by remote-induced animation, the change is not echoed
        When local change is caused by local reasons, the change is propagated, but echoed remote changes are neglected
        (An echo can be created by local or remote)

        There are events which cause chairmanship of local or remote id
        see https://github.com/x3dom/x3dom/blob/master/src/Viewarea.js

                                                                                      propagate?
        viewpointChanged
                   |------- moving (onDrag, onMoveView)                                   ✓
                   |------- animating
                               |------- mixing (showAll, onDoubleClick,… → animateTo)
                               |           |------- local mixing                          ✓
                               |           |------- custom remote mixing                  ✗
                               |------- navigating, (navigateTo == true)                 (✓)

        (✓) = ignored for simplicity's sake

        animations are calling viewarea._scene.getViewpoint().setView()
        movements are changing viewarea._transMat and viewarea._rotMat

        To stay informed about the chairmanship, every modifying function is hooked
    */

    // limiting the amount of messages sent by Y-js
    // numbers in ms
    sync.sendInterval = 200
    sync.receiveInterval = 200

    sync.animDuration = 350
    sync.chairmanId = sync.localId

    // viewport: remote → local
    sync.onYLoad.push(function () {
        sync.remoteViewChanged = function (events) {
            receivedView = sync.y.share.showcase.get('view_matrix')

            if (receivedView == null) { return }

            // only set new view if not created from yourself
            if (receivedView.peerId == sync.localId) { return }

            x3dExtensions.setView( sync.x3dRoot.runtime, receivedView, sync.animDuration )
            sync.chairmanId = receivedView.peerId
        }

        sync.y.share.showcase.observePath(
                ['view_matrix']
                , sync.intervalBarrier(sync.remoteViewChanged, sync.receiveInterval)
        )
    })

    // viewport: local → remote
    sync.onModelLoad.push(function () {
        sync.localViewChanged = function (evt) {
            if (!sync.loadFlags.y) { return }

            // block if event was triggered by mixing-animation caused from remote state
            if (sync.chairmanId != sync.localId) { return }

            var currentView = x3dExtensions.getView(sync.x3dRoot.runtime)
            currentView.peerId = sync.localId
            sync.y.share.showcase.set('view_matrix', currentView)
        }

        $('#viewport').on(
                'viewpointChanged'
                , sync.intervalBarrier(sync.localViewChanged, sync.sendInterval)
        )

        sync.viewarea = sync.x3dRoot.runtime.canvas.doc._viewarea
        var viewarea = sync.viewarea

        var setViewareaHook = function (functionName, peerId) {
            var oldFunc = viewarea[functionName]
            viewarea[functionName] = function () {
                sync.chairmanId = peerId
                return oldFunc.apply(viewarea, arguments)
            }
        }

        // hooks for observing chairmanship
        setViewareaHook('animateTo', sync.localId)
        setViewareaHook('onDrag', sync.localId)
        setViewareaHook('onMoveView', sync.localId)
    })




    //////// resync all, document & model & y-object must be ready for this

    sync.loadFlags = {document:false, y:false, model:false}
    sync.oneLoaded = function () {
      if (sync.loadFlags.document && sync.loadFlags.y && sync.loadFlags.model) {
        sync.remoteViewChanged()
      }
    }
    sync.onYLoad.push(function () {
      sync.loadFlags.y = true
      sync.oneLoaded()
    })
    sync.onDocLoad.push(function () {
        sync.loadFlags.document = true;
        sync.oneLoaded()
    })
    sync.onDocLoad.push(function () {
        sync.loadFlags.model = true;
        sync.oneLoaded()
    })


}




//////////////// utility functions

/*
    utility function, similar to Knockout.js' rate-limiter (http://knockoutjs.com/documentation/rateLimit-observable.html)
    Here is an exaple sequence diagram:

    e←event                          e  e      e         e     e   e                              e
    [                ]←interval      [                ][                 ][                ]      [               ]
    ✓←passfunction()                 ✓  ✗      ✗-----✓  ✗     ✗  ✗-----✓                        ✓
*/
sync.intervalBarrier = function (passFunction, interval) {
	var state = {}
	state.interval = interval || 1000
	state.lastPassed = 0
	state.passFunction = passFunction

	return function () {
		if (state.timeout != null)
			return
		var now = new Date() .getTime()
		var timeToWait = (state.lastPassed + state.interval) - now
		if (timeToWait < 0) { timeToWait = 0 }
		state.timeout = setTimeout(
			function (state) { return function () {
				state.timeout = null
				state.lastPassed = new Date() .getTime()
				state.passFunction()
			} } (state)
			, timeToWait
		)
	}
}

/*
    utility-function to prevent subscription from echoing
    case is given when subscription changes the ViewModel's value
*/
sync.switchableSubscription = function (observable, func) {
    return {
        observable: observable,
        subscription: observable.subscribe(func),
        turnOff: function () {
            // "subscription.isDisposed = true/false" is easier, but "isDisposed" is obfuscated (called "R" when I tested)
            this.subscription.dispose()
        },
        turnOn: function () {
            // reassign subscription
            this.subscription = this.observable.subscribe( func )
        }
    }
}
