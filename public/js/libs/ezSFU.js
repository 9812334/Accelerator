//@ts-check
function ezSFU(socket, newConfig = {}) {
    var sfuConfig = {
        trickle: true
    }
    for (var i in newConfig) {
        sfuConfig[i] = newConfig[i];
    }
    this.socket = socket;
    this.mappedEvents = {};
    this.peers = {}; //contains all peers (to main and load balancers)
    this.allStreamAttributes = {};
    this.connectedToMainPeer = false;
    this.currentIceServers = [];
    this.log = function (msg, msg2) {  //You can override this to log somewhere else!
        console.log("ezSFU", msg, msg2)
    };
    this.on = function (eventname, callback) {
        if (this.mappedEvents[eventname]) {
            this.mappedEvents[eventname].push(callback)
        } else {
            this.mappedEvents[eventname] = [callback];
        }
    };
    this.emitEvent = function (eventname) {
        for (var i in this.mappedEvents[eventname]) {
            this.mappedEvents[eventname][i](arguments[1], arguments[2], arguments[3])
        }
        this.log(eventname + ":" + JSON.stringify(arguments[1]))
    };
    this.makeNewPeer = function (peerId, connectedCallback, iceServers) {
        var _this = this;
        if (_this.peers[peerId]) {
            return _this.log("Already connected to this peer!");
        }
        // @ts-ignore
        _this.peers[peerId] = new SimplePeer({
            initiator: true,
            trickle: sfuConfig.trickle,
            config: {
                iceServers: iceServers
            }
        })
        _this.peers[peerId].on('error', err => _this.log('error', err))

        _this.peers[peerId].on('signal', data => {
            socket.emit("sfu_signaling", { instanceTo: peerId, data: data })
        })

        _this.peers[peerId].on('stream', stream => {
            stream.audioMuted = false;
            var streamId = stream.id.replace("{", "").replace("}", "");
            stream["streamAttributes"] = _this.allStreamAttributes[streamId];
            _this.log("New Stream on peer:", streamId)
            stream.hasVideo = (stream.getVideoTracks().length > 0);
            stream.hasAudio = (stream.getAudioTracks().length > 0);

            _this.emitEvent("streamAdded", stream);
        })

        _this.peers[peerId].on('connect', () => {
            _this.log('CONNECTED PEER');
            if (connectedCallback)
                connectedCallback();
        })

        _this.peers[peerId].on('data', data => {
            _this.log('data: ' + data)
        })

        _this.peers[peerId].on('close', () => {
            _this.peers[peerId].destroy();
            delete _this.peers[peerId];
            _this.emitEvent("peerDisconnected", peerId);
        })
    };
    this.init = function () {
        var _this = this;
        socket.on("connect", function () {
            _this.log("sfu socket connected");

            socket.on("sfu_signaling", function (content) {
                var data = content["data"];
                var instanceFrom = content["instanceFrom"];
                if (_this.peers[instanceFrom]) {
                    _this.peers[instanceFrom].signal(data);
                } else {
                    _this.log("Error: Can not send signal to disconnected peer!", content)
                }
            })

            socket.on("sfu_onUserJoinedRoom", function (content) {
                _this.emitEvent("userJoinedRoom", content);
            })

            socket.on("sfu_onUserDisconnectedFromRoom", function (socketId) {
                _this.emitEvent("userDisconnectedFromRoom", socketId);
            })

            socket.on("sfu_onStreamUnpublished", function (streamAttributes) {
                _this.emitEvent("streamUnpublished", streamAttributes);
            })

            socket.on("sfu_recordingStarted", function (streamId) {
                _this.emitEvent("recordingStarted", streamId);
            })

            socket.on("sfu_recordingDone", function (content) {
                var streamId = content.streamId;
                var filename = content.filename;
                _this.emitEvent("recordingDone", streamId, filename);
            })

            socket.on("sfu_onIceServers", function (iceServers) {
                _this.makeNewPeer("main", function () {
                    //Connected callback
                    _this.connectedToMainPeer = true;
                }, iceServers);
                _this.currentIceServers = iceServers;
            })

            socket.on("sfu_onNewStreamPublished", function (content) {
                console.log("sfu_onNewStreamPublished", content)
                // var username = content["username"];
                // var socketId = content["socketId"];
                // var roomname = content["roomname"];
                // var attributes = content["attributes"];
                // var instanceTo = content["instanceTo"];
                var streamId = content["streamId"];
                _this.allStreamAttributes[streamId] = content;
                _this.emitEvent("newStreamPublished", content);
            })

            socket.on('error', (error) => {
                _this.log(error);
            });

            socket.on('connect_error', (error) => {
                _this.log(error);
            });

            socket.on('connect_timeout', (timeout) => {
                _this.log(timeout);
            });
        });
    };
    this.joinRoom = function (username, roomname, callback) {
        var _this = this;
        socket.emit("sfu_joinRoom", {
            roomname: roomname,
            username: username
        }, function (iceServers) {
            console.log("iceServers", iceServers)
            var joinI = setInterval(function () {
                if (_this.connectedToMainPeer) { //Make sure the peer connection is active
                    clearInterval(joinI);
                    _this.log("JOINED!");
                    callback();
                }
            }, 10)
        });
    };
    this.unpublishStream = function (stream) {
        var _this = this;
        socket.emit("sfu_unpublishStream", stream.id.replace("{", "").replace("}", ""), function (err) {
            if (err) _this.log(err);
        });
        for (var i in stream.getAudioTracks()) {
            stream.getAudioTracks()[i].stop();
        }
        for (var i in stream.getVideoTracks()) {
            stream.getVideoTracks()[i].stop();
        }
    };
    this.muteMediaStream = function (mute, stream) {
        for (var i in stream.getAudioTracks()) {
            stream.getAudioTracks()[i].enabled = !mute;
        }
        stream.audioMuted = mute;
    };
    this.showMediaStream = function (elmDomId, stream, css = "") {
        var streamId = stream.id.replace("{", "").replace("}", "")
        var mediaEl = null;

        mediaEl = stream.hasVideo ? document.createElement('video') : document.createElement('audio');

        mediaEl.setAttribute("style", css);
        mediaEl.setAttribute("autoplay", "autoplay");
        mediaEl.id = streamId;
        document.getElementById(elmDomId).appendChild(mediaEl);

        mediaEl.srcObject = stream;
        mediaEl.play();
    };
    this.getAllStreamsFromRoom = function (roomname, callback) {
        var _this = this;
        socket.emit("sfu_getAllStreamsFromRoom", roomname, function (content) {
            var activeStreamAttrs = {};
            for (var i in content) {
                if (content[i].active) {
                    activeStreamAttrs[content[i].streamId] = content[i];
                }
            }
            _this.allStreamAttributes = activeStreamAttrs;
            //Callback
            callback(activeStreamAttrs);
            _this.log("all streams", activeStreamAttrs)
        })
    };
    this.subscribeToStream = function (streamId, callback) {
        var _this = this;
        var instanceTo = _this.allStreamAttributes[streamId] ? _this.allStreamAttributes[streamId]["instanceTo"] : "";
        if (instanceTo == "main")
            socket.emit("sfu_subscribeToStream", streamId, function (err) {
                if (err) {
                    callback(err)
                } else {
                    callback()
                }
            });
        else { //Stream is on a loadbalancer
            if (_this.peers[instanceTo] && _this.peers[instanceTo]._connected) {
                _this.peers[instanceTo].send(JSON.stringify({
                    "key": "reqStream",
                    "content": streamId
                }))
            } else if (_this.peers[instanceTo]) { //We already started a connection so wait for it to connect
                setTimeout(function () {
                    _this.subscribeToStream(streamId, callback);
                }, 200)
            } else {
                //We need to connect to the instance first
                _this.makeNewPeer(instanceTo, function () {
                    //Connected callback
                    console.log("LOADBALANCER CONNECTED!!!");
                    _this.peers[instanceTo].send(JSON.stringify({
                        "key": "reqStream",
                        "content": streamId
                    }))
                }, _this.currentIceServers);
            }
        }
    };
    this.publishStreamToRoom = function (roomname, stream, callback) {
        var _this = this;

        var streamAttributes = {}
        for (var i in stream.streamAttributes) {
            streamAttributes[i] = stream.streamAttributes[i];
        }
        streamAttributes["roomname"] = roomname;
        streamAttributes["streamId"] = stream.id.replace("{", "").replace("}", "");
        socket.emit("sfu_registerStream", streamAttributes, function (err, setStreamAttributes) {
            console.log("setStreamAttributes", setStreamAttributes)
            if (err) {
                callback(err)
                console.error(err)
            } else {
                var instanceTo = setStreamAttributes["instanceTo"] || "";
                if (_this.peers[instanceTo] && _this.peers[instanceTo]._connected) {
                    _this.peers[instanceTo].addStream(stream);
                    callback(null, setStreamAttributes)
                } else if (_this.peers[instanceTo]) { //Connection started so wait for it...
                    setTimeout(function() {
                        _this.publishStreamToRoom(roomname, stream, callback)
                    }, 200)                    
                } else if (!_this.peers[instanceTo]) {
                    //We need to connect to the instance first
                    console.log("CONNECT TO LB!!!");
                    _this.makeNewPeer(instanceTo, function () {
                        //Connected callback
                        console.log("LOADBALANCER CONNECTED!!!");
                        _this.peers[instanceTo].addStream(stream);
                    }, _this.currentIceServers);
                } else {
                    _this.log("Problem while connecting to the given streaming instance! Check logs.", setStreamAttributes)
                    callback("Problem while connecting to the given streaming instance! Check logs.")
                }
            }
        });

    };
    this.recordStream = function (streamId) {
        socket.emit("sfu_recordStream", streamId.replace("{", "").replace("}", ""));
    }
}