//@ts-check
var wrtc = require('wrtc');

function initEzWebRTC(initiator, config) {
    var _this = this;
    this.isConnected = false;

    var rtcConfig = { //Default Values
        offerOptions: {
            offerToReceiveAudio: true, //- depricated - want audio
            offerToReceiveVideo: true  //- depricated - want video
        },
        stream: null,
        'iceServers': [
            {
                "urls": "stun:stun.l.google.com:19302"
            }
        ],
        sdpSemantics: 'unified-plan'
    }
    if (config) {
        for (var i in config) {
            rtcConfig[i] = config[i];
        }
    }

    var pc = new wrtc.RTCPeerConnection(rtcConfig);

    // @ts-ignore
    pc.onsignalingstatechange = function (event) {
        _this.emitEvent("onsignalingstatechange", event);
    }

    // @ts-ignore
    pc.onicecandidate = function (e) {
        if (!pc || !e || !e.candidate) return;
        _this.emitEvent("signaling", e.candidate)
    };

    var knownStreams = {};
    pc.ontrack = function (event) {
        event.streams.forEach(eventStream => {
            _this.emitEvent('track', event.track, eventStream);
            if (!knownStreams[eventStream.id]) { //emit onStream event
                _this.emitEvent("stream", eventStream);
            }
            knownStreams[eventStream.id] = true;
        });
    }

    // @ts-ignore
    pc.oniceconnectionstatechange = async function (e) {
        //console.log('ICE state: ' + pc.iceConnectionState);
        // @ts-ignore
        if (pc.iceConnectionState == "connected" || pc.iceConnectionState == "completed") {
            _this.isConnected = true;
            _this.emitEvent("connect", true)
            // @ts-ignore
        } else if (pc.iceConnectionState == 'disconnected') {
            _this.isConnected = true;
            _this.emitEvent("disconnect", true)
            // @ts-ignore
        } else if (pc.iceConnectionState == 'failed' && initiator) { //Try to reconnect from initator side
            _this.isConnected = false;
            await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }))
            // @ts-ignore
            _this.emitEvent("signaling", pc.localDescription)
        }
    };

    // @ts-ignore
    pc.onnegotiationneeded = function() {
        negotiate();
    }

    this.signaling = async function (signalData) { //Handle signaling
        if (signalData == "renegotiate" && initiator) { //Got renegotiate request, so do it
            negotiate();
        } else if (signalData && signalData.type == "offer") { //Got an offer -> Create Answer)
            // @ts-ignore
            if (pc.signalingState != "stable") { //If not stable ask for renegotiation
                await Promise.all([
                    pc.setLocalDescription({ type: "rollback" }), //Be polite
                    await pc.setRemoteDescription(new wrtc.RTCSessionDescription(signalData))
                ]);
            } else {
                await pc.setRemoteDescription(new wrtc.RTCSessionDescription(signalData))
            }
            await pc.setLocalDescription(await pc.createAnswer(rtcConfig.offerOptions));
            // @ts-ignore
            _this.emitEvent("signaling", pc.localDescription)
            if (!initiator)
                requestMissingTransceivers()
        } else if (signalData && signalData.type == "answer") { //STEP 5 (Initiator: Setting answer and starting connection)
            pc.setRemoteDescription(new wrtc.RTCSessionDescription(signalData))
        } else if (signalData && signalData.type == "transceive" && initiator) { //Got an request to transrecive
            _this.addTransceiver(signalData.kind, signalData.init)
        } else if (signalData && signalData.candidate) { //is a icecandidate thing
            // @ts-ignore
            pc.addIceCandidate(new wrtc.RTCIceCandidate(signalData));
        } else {
            console.log("Some unused signaling data???", signalData)
        }
    }

    var trackSenders = {};
    this.addStream = function (stream) {
        stream.getTracks().forEach(track => {
            trackSenders[track.id] = pc.addTrack(track, stream); //Add all tracks to pc
        })

        stream.onremovetrack = function (event) {
            _this.emitEvent('trackremoved', event.track, stream);
            let tracks = stream.getTracks();
            if (tracks.length == 0) { //If no tracks left
                _this.emitEvent("streamremoved", stream);
            }
            delete trackSenders[event.track.id]
        };
    }

    this.removeStream = function (stream) {
        stream.getTracks().forEach(track => {
            pc.removeTrack(trackSenders[track.id])
        });
    }

    this.addTrack = function (track, stream) {
        pc.addTrack(track, stream);
    }

    this.removeTrack = function (track) {
        pc.removeTrack(trackSenders[track.id])
    }

    this.addTransceiver = function (kind, init) {
        if (initiator) {
            try {
                pc.addTransceiver(kind, init)
            } catch (err) {
                console.log("addTransceiver Error", err)
                _this.destroy()
            }
        } else {
            _this.emitEvent("signaling", { // request initiator add a transceiver
                type: "transceive",
                kind: kind,
                init: init
            })
        }
    }

    this.destroy = function () {
        pc.close();
        // @ts-ignore
        pc.oniceconnectionstatechange = null
        // @ts-ignore
        pc.onicegatheringstatechange = null
        // @ts-ignore
        pc.onsignalingstatechange = null
        // @ts-ignore
        pc.onicecandidate = null
        pc.ontrack = null
        _this.isConnected = false;
    }

    if (rtcConfig.stream) {
        this.addStream(rtcConfig.stream); //Add stream at start, this will trigger negotiation on initiator
    }

    if (initiator) { //start negotiation if we are initiator
        negotiate();
    }

    async function negotiate() {
        //console.log("negotiate")
        if (initiator) {
            const offer = await pc.createOffer(rtcConfig.offerOptions); //Create offer
            // @ts-ignore
            if (pc.signalingState != "stable") return;
            await pc.setLocalDescription(offer);
            // @ts-ignore
            _this.emitEvent("signaling", pc.localDescription)
        } else {
            _this.emitEvent("signaling", "renegotiate");
        }
    }

    function requestMissingTransceivers() {
        if (pc.getTransceivers) {
            pc.getTransceivers().forEach(transceiver => {
                if (!transceiver.mid && transceiver.sender.track && !transceiver.requested) {
                    transceiver.requested = true // HACK: Safari returns negotiated transceivers with a null mid
                    _this.addTransceiver(transceiver.sender.track.kind)
                }
            })
        }
    }

    this.mappedEvents = {};
    this.on = function (eventname, callback) {
        if (_this.mappedEvents[eventname]) {
            _this.mappedEvents[eventname].push(callback)
        } else {
            _this.mappedEvents[eventname] = [callback];
        }
    };

    this.emitEvent = function (eventname) {
        for (var i in this.mappedEvents[eventname]) {
            _this.mappedEvents[eventname][i](arguments[1], arguments[2], arguments[3])
        }
    };
    return this;
}

module.exports = {
    initEzWebRTC: initEzWebRTC
}