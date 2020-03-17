var ownSocketId = null;
var ownColor = null;
var roomImIn = null;
var gainNode = null;
var currentTab = "#homeScreen";
var userPItems = [];
var all3DObjects = [];
var mySFU;

var room, screen_stream;
var screen_publishing = false;
var allSingleFiles = null;

var localVideoStrm = null;
var localAudioStream = null;
var isLocalVideoPlaying = false;
var roomJoinTime = new Date().getTime();
var userLang = navigator.language || navigator.userLanguage;

var url = document.URL.substr(0, document.URL.lastIndexOf('/'));
var urlSplit = url.split("/");
var subdir = "";
for (var i = 3; i < urlSplit.length; i++) {
    subdir = subdir + '/' + urlSplit[i];
}

var loadSFUConnection = function (roomToConnect) {

    ownColor = getLocalStorage("color");
    if (!ownColor)
        ownColor = getRandomColor();
    setUserColor(ownSocketId, ownColor);

    mySFU.joinRoom(username, roomToConnect["roomName"], function (err) {
        if (err) {
            writeToChat(err);
        } else {
            roomJoinTime = new Date().getTime();

            signaling_socket.emit('join', {
                "roomName": roomToConnect["roomName"],
                "username": username,
                "color": ownColor
            });

            setTimeout(function () { //Delay getting all streams a little
                mySFU.getAllStreamsFromRoom(roomToConnect["roomName"], function (allStreamsFromRoom) {
                    console.log(allStreamsFromRoom);
                    for (var i in allStreamsFromRoom) {
                        if (ownSocketId != allStreamsFromRoom[i].socketId) { //Dont subscribe to own stream
                            (function () {
                                if ($("#" + allStreamsFromRoom[i].streamId).length == 0) {
                                    mySFU.subscribeToStream(allStreamsFromRoom[i]["streamId"], function (err) {
                                        if (err) {
                                            writeToChat("StreamError", "Was not able to add stream from:" + allStreamsFromRoom[i].username);
                                        }
                                    })
                                }
                            })();
                        }
                    }
                })
            }, 100)

            mySFU.on("newStreamPublished", function (content) {
                console.log(content)
                // var roomname = content["roomname"];
                // var attributes = content["attributes"];
                var username = content["username"];
                var streamId = content["streamId"];

                if (streamId != localAudioStream.id.replace("{", "").replace("}", "")) {
                    mySFU.subscribeToStream(streamId, function (err) {
                        if (err) {
                            writeToChat("StreamError", "Was not able to add stream:" + streamId);
                        } else {
                            console.log("StreamInfo", "Connected to stream:" + streamId);
                        }
                    })
                }
            })

            mySFU.on("streamAdded", function (stream) {
                console.log(stream)
                var streamAttr = stream.streamAttributes;
                var streamSocketId = streamAttr.socketId;
                var streamId = stream.id.replace("{", "").replace("}", "")
                if (streamAttr && streamAttr.screenshare) {   //Screenshare
                    console.log("ADD SCREENSHARE!")
                    if (streamSocketId == ownSocketId) {
                        $("#startScreenShareBtn").removeAttr("disabled");
                        writeToChat("Server", "Screenstream Connected!");
                        $("#startScreenShareBtn").css("position", "initial");
                        $("#startScreenShareBtn").text("stop screen share!");
                    }
                    $(".wait4ScreenShareTxt").hide();
                    $("#screenShareStream").show();
                    $("#screenShareStream").empty();

                    function showTheScreen() {
                        if (currentTab == "#screenShare") { //Dont show screenshare on wrong tab
                            $("#screenShareStream").empty();
                            mySFU.showMediaStream("screenShareStream", stream, "width: 100%;");


                            var fullScreenBtn = $('<button style="z-index:10; position:absolute; position: absolute; bottom: 0px; right: 0px;"><i class="fa fa-expand"></i></button>');
                            fullScreenBtn.click(function () {
                                var video = $("#screenShareStream video")[0];
                                if (video.requestFullscreen) {
                                    video.requestFullscreen();
                                } else if (video.mozRequestFullScreen) {
                                    video.mozRequestFullScreen(); // Firefox
                                } else if (video.webkitRequestFullscreen) {
                                    video.webkitRequestFullscreen(); // Chrome and Safari
                                }
                            });
                            $("#screenShareStream").append(fullScreenBtn);
                        } else {
                            setTimeout(showTheScreen, 1000);
                        }
                    }
                    showTheScreen();
                } else if (stream.hasVideo) {  //Video Stream
                    console.log("ADD VIDEO!")
                    if (streamAttr && streamAttr["itemId"]) { //Webcamstream in userPitem
                        if (streamSocketId == ownSocketId) {
                            writeToChat("Server", "Webcamstream connected!");
                            $("#" + streamAttr["itemId"]).find(".saveFrameBtn").show();
                            $("#" + streamAttr["itemId"]).find(".saveFrameBtn").click(function () {
                                var _this = this;
                                $(_this).hide();
                                var url = stream.getVideoFrameURL();
                                writeToChat("Server", "Frame is uploading...");
                                $.ajax({
                                    type: 'POST',
                                    url: document.URL.substr(0, document.URL.lastIndexOf('/')) + '/upload',
                                    data: {
                                        'imagedata': url,
                                        'room': roomImIn["roomName"],
                                        'name': "webcam",
                                        'userId': ownSocketId,
                                        'uploadType': "singleFileUpload"
                                    },
                                    success: function (msg) {
                                        $(_this).show();
                                        writeToChat("Server", "Frame of video saved! (Check the Filetable on the right!)");
                                        if (!$("#showFiles").hasClass("alert-danger")) {
                                            $("#showFiles").click();
                                        }
                                    },
                                    error: function (err) {
                                        $(_this).show();
                                        writeToChat("Error", "Failed to upload frame: " + JSON.stringify(err));
                                    }
                                });
                            });
                        }

                        if ($("#" + streamAttr["itemId"]).length >= 1) {
                            $("#" + streamAttr["itemId"]).find(".innerContent").html('<div id="video' + streamId + '" class="" style="width: 100%; height: 100%; z-index:10;"></div>');
                            mySFU.showMediaStream("video" + streamId, stream, 'height:225px; position: relative; top:0px;');
                        } else {
                            setTimeout(appendStream, 2000); //Wait for item to show up
                        }

                    } else {
                        if (streamSocketId == ownSocketId) {
                            $("#" + ownSocketId).find(".shareOwnVideo").show();
                            $("#" + ownSocketId).find(".shareOwnVideo").css({ "color": "#03A9F4" });
                            $("#" + ownSocketId).find(".shareOwnVideo").attr("title", "Stop webcam");
                            writeToChat("Server", "Webcamstream connected!");
                        }
                        var videoElement = $('<div id="video' + streamId + '" class="direktVideoContainer socketId' + streamSocketId + '" style="height: 225px; width: 100%; z-index:10;"></div>');
                        $("#" + streamSocketId).find(".videoContainer").append(videoElement);
                        mySFU.showMediaStream("video" + streamId, stream, 'width:300px; height:225px; position: absolute; top:0px;');
                        $("#" + streamSocketId).find(".webcamfullscreen").show();
                        $("#" + streamSocketId).find(".popoutVideoBtn").show();
                    }

                } else if (stream.hasAudio) { //Audio Stream
                    console.log("ADD AUDIO!")
                    var username = streamAttr ? streamAttr["username"] : null;
                    $("#mediaC").append('<div id="audio' + streamId + '" username="' + username + '" streamSocketId="' + streamSocketId + '" class="audiocontainer socketId' + streamSocketId + '" style="width: 320px; height: 217px; display:none;"></div>');
                    mySFU.showMediaStream("audio" + streamId, stream);
                    if ($("#" + streamSocketId).length == 0) {
                        sendGetUserInfos(streamSocketId);
                    }

                    $('.socketId' + streamSocketId + ' audio').prop("muted", "true");

                    if (getBrowser() == "chrome-stable") {
                        if(prevOutputDevice && $('#audio' + streamId).find("audio")[0].setSinkId) {
                            $('#audio' + streamId).find("audio")[0].setSinkId(prevOutputDevice); //Set audio output chrome  
                        } else {
                            $('#audio' + streamId).find("audio")[0].setSinkId("default"); //Set audio output device to default in chrome  
                        }
                        
                    }
                }
            });

            setTimeout(function () {
                refreshMuteUnmuteAll();
            }, 500);
            mySFU.on("streamUnpublished", function (streamAttributes) {
                console.log("streamUnpublished", streamAttributes)
                var socketId = streamAttributes.socketId;
                var streamId = streamAttributes.streamId;
                var screenshare = streamAttributes.screenshare;
                if (socketId) {
                    if (screenshare) {
                        $(".wait4ScreenShareTxt").show();
                        if (ownSocketId == roomImIn["moderator"])
                            $("#screenshareQuallyDiv").show();
                        $("#startScreenShareBtn").text("Start Screenshare!");
                        $("#screenShareStream").hide();
                        $("#screenShareStream").empty();
                    } else {
                        var element = $("#" + streamId)[0];
                        $(element).parents(".videoContainer").appendTo($("#" + socketId));
                        $(element).parents(".videoContainer").css({ "position": "relative", "top": "0px", "left": "0px", "cursor": "default" });
                        $("#" + socketId).find(".popoutVideoBtn").attr("popedOut", false);
                        $(element).parents(".direktVideoContainer").remove();
                        $(element).remove();

                        if (!streamAttributes["itemId"]) { //Dont hide if it is a userPitem stream
                            $("#" + socketId).find(".webcamfullscreen").hide();
                            $("#" + socketId).find(".popoutVideoBtn").hide();
                        }
                    }
                }
            })

            mySFU.on("disconnect", function (streamExtraContent) {
                writeToChat("ERROR", 'Network to server disconnected! If you encounter problems, try to refresh the page.');
            });

            writeToChat("Server", "Try to access microfone!");

            function startLocalAudioStream() {
                var constraints = prevAudioInputDevice ? { deviceId: { exact: prevAudioInputDevice } } : true;
                
                navigator.getUserMedia({ audio: constraints, video: false }, (stream) => {
                    stream["attributes"] = { socketId: ownSocketId, username: username };
                    localAudioStream = stream;
                    mySFU.publishStreamToRoom(roomToConnect["roomName"], localAudioStream, function (err) {
                        if (err) {
                            writeToChat("ERROR", "Stream could not be published! Error: " + err);
                        } else {
                            writeToChat("Server", "Local Audiostream Connected!");
                            writeToChat("Server", "You can not communicate unless you get the microphone or press the horn!");
                            $("#" + ownSocketId).find(".UserRightTD").css({ "background": "rgba(3, 169, 244, 0)" });
                            if (typeof (getLocalStorage("introBasicTourShown")) == "undefined") {
                                showTour("introBasicTour", false); //start intro tour
                            }
                            setLocalStorage("introBasicTourShown", true);

                            //Calc the current volume!
                            var audioAontext = window.AudioContext || window.webkitAudioContext;
                            var context = new audioAontext();
                            var microphone = context.createMediaStreamSource(stream);
                            var dest = context.createMediaStreamDestination();

                            gainNode = context.createGain();

                            var analyser = context.createAnalyser();
                            analyser.fftSize = 2048;
                            var bufferLength = analyser.frequencyBinCount;
                            var dataArray = new Uint8Array(bufferLength);
                            analyser.getByteTimeDomainData(dataArray);

                            var audioVolume = 0;
                            var oldAudioVolume = 0;
                            function calcVolume() {
                                requestAnimationFrame(calcVolume);
                                analyser.getByteTimeDomainData(dataArray);
                                var mean = 0;
                                for (var i = 0; i < dataArray.length; i++) {
                                    mean += Math.abs(dataArray[i] - 127);
                                }
                                mean /= dataArray.length;
                                mean = Math.round(mean);
                                if (mean < 2)
                                    audioVolume = 0;
                                else if (mean < 5)
                                    audioVolume = 1;
                                else
                                    audioVolume = 2;

                                if (audioVolume != oldAudioVolume) {
                                    sendAudioVolume(audioVolume);
                                    oldAudioVolume = audioVolume;
                                }
                            }
                            calcVolume();
                            microphone.connect(gainNode);
                            gainNode.connect(analyser); //get sound  
                            analyser.connect(dest);
                            stream = dest.stream;
                            //Calc the current volume END!
                        }
                    });
                }, (err) => {
                    writeToChat("WARNING", "Access to microphone rejected or device not available! This is not a problem if you don't want to talk.");
                })
            }

            setTimeout(startLocalAudioStream, 300);
        }
    })
}

function isRTCConnected() {
    if (signaling_socket != null && signaling_socket.connected)
        return true;
    return false;
}

function sendGetAllRooms() {
    if (isRTCConnected()) {
        signaling_socket.emit('getAllRooms');
    }
}

function setUserName(username, passwort) {
    if (isRTCConnected()) {
        signaling_socket.emit('setUserName', { "username": username, "passwort": passwort, "userLang": userLang });
    }
}

function sendUserStatus(status) {
    if (isRTCConnected()) {
        signaling_socket.emit('setStatus', status);
    }
}

var playingSnake = false;
var cntInterval = null;

function sendChatMsg(msg) {
    if (isRTCConnected()) {
        if (msg != "") {
            writeToChat(username, "" + msg);
            if (msg == "/snake") {
                if (currentTab == "#homeScreen") {
                    playingSnake = !playingSnake;
                    signaling_socket.emit('startStopSnake', playingSnake);
                    writeToChat("Snake", "" + playingSnake);
                    return;
                }
            }

            signaling_socket.emit('message', msg);
        }
    }
}

function shuffleArray(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

function sendGetUserInfos(id) {
    if (isRTCConnected()) {
        signaling_socket.emit('getUserInfos', id);
    }
}

function sendModeratorId(userIdToSet) {
    if (isRTCConnected()) {
        signaling_socket.emit('setModerator', userIdToSet);
    }
}

function sendSetGetMicToUser(userid, status, disableHandUp) {
    if (isRTCConnected()) {
        signaling_socket.emit('setGetMicToUser', {
            "userid": userid,
            "mic": status,
            "disableHandUp": disableHandUp
        });
    }
}

function sendShowHideClock(trueFalse) {
    if (isRTCConnected()) {
        signaling_socket.emit('showHideClock', trueFalse);
    }
}

function sendLoadPraesis() {
    if (isRTCConnected()) {
        signaling_socket.emit('loadPraesis', null);
    }
}

function sendAddPraesi(praesi) {
    if (isRTCConnected()) {
        signaling_socket.emit('addPraesi', praesi);
    }
}

function sendDeletePraesi(name) {
    if (isRTCConnected()) {
        signaling_socket.emit('deletePraesi', name);
    }
}

function sendLoadSlide(name, id) {
    if (isRTCConnected()) {
        signaling_socket.emit('loadSlide', {
            "name": name,
            "slideid": id
        });
    }
}

function sendgSlideKey(keycode) {
    if (isRTCConnected()) {
        signaling_socket.emit('gSlideKey', keycode);
    }
}

function sendGSliderBtnClick(btnId) {
    if (isRTCConnected()) {
        signaling_socket.emit('gSliderBtnClick', btnId);
    }
}

function sendZoom(content) {
    if (isRTCConnected()) {
        signaling_socket.emit('sendZoom', content);
    }
}

function sendGSliderInputVal(inputId, val) {
    if (isRTCConnected()) {
        signaling_socket.emit('gSliderInputVal', {
            "inputId": inputId,
            "val": val
        });
    }
}

function sendImpressSlideKey(keycode) {
    if (isRTCConnected()) {
        signaling_socket.emit('impressSlideKey', keycode);
    }
}

function send3dPos(pos) {
    if (isRTCConnected()) {
        signaling_socket.emit('3dPos', pos);
    }
}

function sendRevealSlideKey(keycode) {
    if (isRTCConnected()) {
        signaling_socket.emit('revealSlideKey', keycode);
    }
}

function sendDrawWhiteoard(content) {
    if (isRTCConnected()) {
        signaling_socket.emit('drawWhiteboard', content);
    }
}

function sendCursorPosition(xy) {
    if (isRTCConnected()) {
        signaling_socket.emit('cursorPosition', xy);
    }
}

function delete3DObj(name) {
    if (isRTCConnected()) {
        signaling_socket.emit('delete3DObj', name);
    }
}

function show3DObj(name) {
    if (isRTCConnected()) {
        $("#show3d").click();
        signaling_socket.emit('show3DObj', name);
    }
}

function sendAddUserPItem(item, posX, posY, itemId, options) {
    if (isRTCConnected()) {
        var sendObj = {
            "item": item,
            "posX": posX,
            "userId": ownSocketId,
            "posY": posY,
            "itemId": itemId,
            "itemUsername": username,
            "color": ownColor
        };
        for (var key in options) {
            sendObj[key] = options[key];
        }

        if (currentPraesiName && allLoadedPraesis[currentPraesiName]) {
            var currentPraesiType = allLoadedPraesis[currentPraesiName]["type"];
            if (currentTab == "#praesiDiv") { //We are on the loaded praesi tab
                sendObj["praesiname"] = currentPraesiName;
                sendObj["praesislide"] = currentPraesiSlide;
            }
        }
        signaling_socket.emit('addUserPItem', sendObj);
    }
}

function sendChangeUserPItemPosition(posX, posY, itemId, userId) {
    if (isRTCConnected()) {
        signaling_socket.emit('changeUserPItemPosition', {
            "posX": posX,
            "posY": posY,
            "itemId": itemId,
            "userId": userId,
            "itemUsername": username
        });
    }
}

function sendFixPItemPosition(posX, posY, itemId, userId) {
    if (isRTCConnected()) {
        signaling_socket.emit('fixPItemPosition', {
            "posX": posX,
            "posY": posY,
            "itemId": itemId,
            "userId": userId,
            "itemUsername": username
        });
    }
}

function sendRemoveUserPItem(itemId, userId) {
    if (isRTCConnected()) {
        signaling_socket.emit('removeUserPItem', {
            "itemId": itemId,
            "userId": userId,
            "itemUsername": username
        });
    }
}

function sendRemoveAllUserPItems() {
    if (isRTCConnected()) {
        if (currentPraesiName && allLoadedPraesis[currentPraesiName]) {
            var currentPraesiType = allLoadedPraesis[currentPraesiName]["type"];
            if (currentTab.indexOf(currentPraesiType) != -1) { //We are on the loaded praesi tab
                signaling_socket.emit('removeAllUserPItems', { "currentPraesiName": currentPraesiName, "currentPraesiSlide": currentPraesiSlide });
                return;
            }
        }
        signaling_socket.emit('removeAllUserPItems', null);
    }
}

function sendShowHideUserPItems(trueFalse) {
    if (isRTCConnected()) {
        signaling_socket.emit('showHideUserPItems', trueFalse);
    }
}

function sendSetUserPItemsText(text, itemId, image) {
    if (isRTCConnected()) {
        signaling_socket.emit('setUserPItemsText', {
            "text": text,
            "itemId": itemId,
            "image": image
        });
    }
}

function sendSetUserColor(color) {
    if (isRTCConnected()) {
        signaling_socket.emit('setUserColor', color);
    }
}

function sendSharNotes(nodeText, noteType) {
    if (isRTCConnected()) {
        signaling_socket.emit('shareNotes', { "text": nodeText, "noteType": noteType });
    }
}

function sendChangeElementSize(itemId, width, height) {
    if (isRTCConnected()) {
        signaling_socket.emit('changeElementSize', {
            "itemId": itemId,
            "width": width,
            "height": height
        });
    }
}

function sendDrawSomething(itemId, userId, thingToDraw) {
    if (isRTCConnected()) {
        signaling_socket.emit('drawSomething', {
            "itemId": itemId,
            "userId": userId,
            "thingToDraw": thingToDraw
        });
    }
}

function sendEndDraw(itemId, drawBuffer) {
    if (isRTCConnected()) {
        signaling_socket.emit('sendEndDraw', { "itemId": itemId, "drawBuffer": drawBuffer });
    }
}

function sendLockUnLockCanvas(itemId, lockUnlock) {
    if (isRTCConnected()) {
        signaling_socket.emit('lockUnLockCanvas', {
            "itemId": itemId,
            "lockUnlock": lockUnlock
        });
    }
}

function sendSigleFileToUpload(name, fileToUpload) {
    if (isRTCConnected()) {
        signaling_socket.emit('sigleFileToUpload', {
            "filename": name,
            "buffer": fileToUpload
        });
    }
}

function sendRemoveSingleFile(fileName) {
    if (isRTCConnected()) {
        signaling_socket.emit('removeSingleFileEX', fileName);
    }
}

function sendGetSingleFileTable() {
    if (isRTCConnected()) {
        signaling_socket.emit('getSingleFileTable', null);
    }
}

function sendYoutubeCommand(content) {
    if (isRTCConnected()) {
        signaling_socket.emit('youtubeCommand', content);
    }
}

function sendPutRemoteHandDown(id) {
    if (isRTCConnected()) {
        signaling_socket.emit('putRemoteHandDown', id);
    }
}

function sendChangeTab(tabH) {
    if (isRTCConnected()) {
        signaling_socket.emit('changeTab', tabH);
    }
}


function sendAudioVolume(vol) {
    if (isRTCConnected()) {
        signaling_socket.emit('audioVolume', vol);
    }
}

function sendCreateNewRoom(roomName, roomPassword) {
    if (isRTCConnected()) {
        signaling_socket.emit("createRoom", { "roomName": roomName, "roomPassword": roomPassword });
    }
}

function sendGetTimeStamp() {
    if (isRTCConnected()) {
        signaling_socket.emit("getTimeStamp", null);
    }
}

function sendMakeTransparent(itemId, transparent) {
    if (isRTCConnected()) {
        signaling_socket.emit("makeTransparent", { "itemId": itemId, "transparent": transparent });
    }
}

function sendSecondHandUp(senderId, resiverUserId, trueFalse) {
    if (isRTCConnected()) {
        signaling_socket.emit("secondHandUp", { "senderId": senderId, "resiverUserId": resiverUserId, "trueFalse": trueFalse });
    }
}

function sendDeleteNewRoom(roomName, roomId) {
    if (isRTCConnected()) {
        signaling_socket.emit("deleteRoom", {
            "roomName": roomName,
            "roomId": roomId
        });
    }
}

var signaling_socket = null;

function initSocketIO() {
    console.log("Connecting to signaling server");

    if (subdir != "") {
        signaling_socket = io("", { "path": subdir + "/socket.io" });
    } else {
        signaling_socket = io();
    }

    mySFU = new ezSFU(signaling_socket);
    mySFU.init();

    signaling_socket.on('connect', function () {
        console.log("Socket connected!");

        signaling_socket.on('disconnect', function () {
            console.log("DISCONNECT")
            alert("Connection to server was lost...")
            location.reload();
            return false;
        });
        ownSocketId = signaling_socket.io.engine.id;

        //For the chat and other functions
        signaling_socket.on('message', function (msg) {
            writeToChat(msg["username"], msg["msg"], false, msg["intent"]);
        });

        //if a username is set, check if we can connect to a room directly
        if (getLocalStorage("myUserName") && getLocalStorage("myUserName").toString().length > 0) {
            $("#loginBtn").click();
        }

        signaling_socket.on('addPeer', function (content) {
            console.log('Signaling server said to add peer:', content);
            var remotSocketId = content.socketId;
            var username = content.username;
            var color = content.color;

            addUserToPanel(remotSocketId, username);
            sendGetUserInfos(remotSocketId);

            setUserColor(remotSocketId, color);
            if ((new Date().getTime() - roomJoinTime) > 5000) { //dont play pling when you join
                var audio = new Audio('./sounds/pling.mp3');
                audio.play();
            }

            if (roomImIn["moderator"] == remotSocketId) {
                setModerator(roomImIn["moderator"]);
            }

            if (roomImIn["moderator"] == ownSocketId) {
                setModerator(roomImIn["moderator"]);
            }
        });

        signaling_socket.on('removePeer', function (remoteSocketId) {
            removeUserFromPage(remoteSocketId);
        });

        signaling_socket.on('noRightsToDeleteRoom', function () {
            alert("No rights to delete this room");
        });


        signaling_socket.on('getAllRooms', function (allRooms) {
            renderAllRooms(allRooms);
        });

        signaling_socket.on('getUserInfos', function (content) {
            var socketId = content["socketId"] || content["id"];
            var name = content["username"];
            var color = content["color"];
            var stadien = content["stadien"];
            imgExists("./profilePics/" + name, function (ret) {
                if (ret) {
                    $("#" + socketId).find(".userIcon").attr("src", "./profilePics/" + name);
                }
            });
            changeUserInfos(socketId, name, color);
            for (var s in stadien) {
                setStatus(socketId, stadien[s]);
            }
            if (content["mic"] == "mic") {
                setGetMicToUser({ "userid": socketId, "mic": "mic" });
            }
        });

        signaling_socket.on('profilePicChange', function (content) {
            var id = content["userId"];
            var name = content["username"];
            imgExists("./profilePics/" + name, function (ret) {
                if (ret) {
                    $("#" + id).find(".userIcon").attr("src", "./profilePics/" + name);
                }
            });
        });

        signaling_socket.on('sendZoom', function (content) {
            var xpro = content["xpro"];
            var ypro = content["ypro"];
            var scale = content["scale"];
            var transform = ("scale(" + scale + ") translateX(" + xpro + "%) translateY(" + ypro + "%)");
            $("#praesiGround").css("transform", transform);
        });

        signaling_socket.on('setStatus', function (content) {
            var id = content["id"];
            var status = content["status"];
            setStatus(id, status);
        });

        signaling_socket.on('3dPos', function (pos) {
            camera3D.position.set(pos[0], pos[1], pos[2]);
            controls3D.target.set(pos[3], pos[4], pos[5])
        });

        signaling_socket.on('setModerator', function (id) {
            roomImIn["moderator"] = id;
            setModerator(id);
        });

        signaling_socket.on('secondHandUp', function (content) {
            addSecondHandUp(content);
        });


        signaling_socket.on('updateSnakeGame', function (players) {
            if (window_focus) {
                window.requestAnimationFrame(function () {
                    for (var playerId in players) {
                        var player = players[playerId];
                        if ($("#homeScreen").find(".s" + playerId).length > 0) {
                            $("#homeScreen").find(".s" + playerId).css({ "top": player["y"] + "px", "left": player["x"] + "px" });
                            for (var i = 0; i < player["t"].length; i++) {
                                if ($("#homeScreen").find(".s" + playerId + "" + i).length > 0) {
                                    $("#homeScreen").find(".s" + playerId + "" + i).css({ "top": player["t"][i]["y"] + "px", "left": player["t"][i]["x"] + "px" });
                                } else {
                                    $("#homeScreen").append('<div class="snake s' + playerId + 't s' + playerId + '' + i + '" style="z-index: 10000; position:absolute; top:' + player["t"][i]["y"] + 'px; left:' + player["t"][i]["x"] + 'px; width:10px; height:10px; background:' + getUserColor(playerId) + '"></div>');
                                }
                            }
                        } else {
                            $("#homeScreen").append('<div class="snake s' + playerId + '" style="z-index: 10000; position:absolute; top:' + player["y"] + 'px; left:' + player["x"] + 'px; width:10px; height:10px; background:' + getUserColor(playerId) + '"></div>');
                        }
                    }
                });
            }
        });

        signaling_socket.on('endSnakeGame', function (trueFalse) {
            $("#homeScreen").find(".snake").remove();
            $("#homeScreen").find('.eatable').remove();
            playingSnake = false;
        });

        signaling_socket.on('removeSnakePlayer', function (theSocketId) {
            if (theSocketId == ownSocketId && playingSnake) {
                playingSnake = false;
                writeToChat("Snake", "YOU DIED!");
            }
            $("#homeScreen").find('.s' + theSocketId).remove();
            $("#homeScreen").find('.s' + theSocketId + 't').remove();
        });

        signaling_socket.on("showSnakeStats", function (players) {
            var playerArray = [];
            for (var playerId in players) {
                var player = players[playerId];
                player["playerId"] = playerId;
                playerArray.push(player);

            }
            playerArray.sort(function (a, b) {
                return a["p"] < b["p"];
            });
            if (playerArray.length > 0) {
                writeToChat("Snake", "--- Points ---");
                for (var i = 0; i < playerArray.length; i++) {
                    var player = playerArray[i];
                    var name = getUserNameFromId(player["playerId"]);
                    if (player["p"] > 0) {
                        writeToChat("Snake", name + ": " + player["p"]);
                    }
                }
            }
        });

        signaling_socket.on('updateEatable', function (eatable) {
            $("#homeScreen").find('.eatable').remove();
            $("#homeScreen").append('<div class="eatable" style="z-index: 9000; position:absolute; top:' + eatable["y"] + 'px; left:' + eatable["x"] + 'px; width:10px; height:10px; background:red"></div>');
        });

        signaling_socket.on('setGetMicToUser', function (data) {
            setGetMicToUser(data);
        });

        signaling_socket.on('setNewProfilePic', function (data) {
            var userid = data["userid"];
            var pic = data["pic"];
            setNewProfilePic(userid, pic);
        });

        signaling_socket.on('loadPraesis', function (praesis) {
            loadPraesis(praesis);
        });

        signaling_socket.on('loadSlide', function (content) {
            var name = content["name"];
            var slideid = content["slideid"];
            currentPraesiSlide = slideid;
            loadSlide(name, slideid);
        });

        signaling_socket.on('praesiConvertion', function (content) {
            console.log("YEAHH", content);
            var type = content["type"];
            var msg = content["msg"];
            var textHTML = "";
            if (type == "error") {
                $("#praesiUpInfo").html('<div style="color:red;">Conversion failed!!! Error: ' + msg + '</div>');
            } else {
                if (msg == "beginConversion") {
                    $("#praesiUpInfo").html('Started conversion... <img class="loaderIcon" src="./img/logogross.png">');
                    writeToChat("Server", "Started conversion...");
                } else if (msg == "successConversion") {
                    $("#praesiUpInfo").html('<div style="color:green;">Conversion done!</div>');
                    writeToChat("Server", "Conversion done!");
                }
            }
        });

        signaling_socket.on('putRemoteHandDown', function (id) {
            if (id == ownSocketId) {
                $(".toolbarWrapper").find(".fa-hand-o-up").click();
            }
        });

        signaling_socket.on('3dObjUploadMsg', function (content) {
            var type = content["type"];
            var msg = content["msg"];
            $(".infoDiv").empty();
            $(".errorDiv").empty();
            if (type == "error") {
                $(".errorDiv").text(msg);
            } else {
                $(".infoDiv").text(msg);
            }
        });

        signaling_socket.on('load3DObjs', function (content) {
            all3DObjects = content;
            render3ObjsTable();
        });

        signaling_socket.on('show3DObj', function (url) {
            $("#3DIframe").attr("src", url);
        });

        var cursorInit = false;
        signaling_socket.on('cursorPosition', function (xy) {
            if (xy.x != "none" && xy.y != "none") {
                if (!cursorInit) {
                    $(currentTab).append('<i style="position:absolute; z-index: 10001; top:0px; left:0px; font-size: 1.9em; color: ' + $(".user-" + roomImIn["moderator"] + " .colorPickerDiv").css("background-color") + ';" class="praesiCursor fa fa-mouse-pointer" aria-hidden="true"></i>')
                }
                cursorInit = true;
                var mainPraesi = $(currentTab);
                var mpWidth = mainPraesi.width();
                var mpHeight = mainPraesi.height();
                var nxp = (mpWidth / 100) * xy.x
                var nyp = (mpHeight / 100) * xy.y
                $(currentTab).find(".praesiCursor").css({
                    "left": (nxp) + "px",
                    "top": (nyp) + "px",
                });
            } else {
                cursorInit = false;
                $(".praesiCursor").remove();
            }
        });

        signaling_socket.on('sError', function (errorcode) {
            if (errorcode == "wrongZipContent") {
                $("#praesiUpInfo").html('<span style="color:red;">Zip Inhalt nicht in korrektem Format!</span>');
            } else if (errorcode == "zipFileCorrupt") {
                $("#praesiUpInfo").html('<span style="color:red;">Zip Datei beschädigt! (konnte nicht gelesen werden)</span>');
            } else if (errorcode == "couldNotCreatePraesiFolder") {
                $("#praesiUpInfo").html('<span style="color:red;">Serverfehler! Pfad konnte nicht erstellt werden!</span>');
            }
        });

        signaling_socket.on('gSliderBtnClick', function (btnId) {
            $(gPraesi.contents()).find("#" + btnId).removeAttr("disabled");
            $(gPraesi.contents()).find("#" + btnId).click();
            $(gPraesi.contents()).find("#" + btnId).attr("disabled", "disabled");
        });

        signaling_socket.on('gSliderInputVal', function (content) {
            $(gPraesi.contents()).find("#" + content.inputId).val(content.val);
            $(gPraesi.contents()).find("#" + content.inputId).trigger("change");
        });

        signaling_socket.on('addUserPItem', function (content) {
            userPItems.push(content);
            addUserPItem(content);
        });

        signaling_socket.on('updateUserPItem', function (content) {
            for (var i = 0; i < userPItems.length; i++) {
                if (userPItems[i]["itemId"] == content.itemId) {
                    userPItems[i] = content;
                }
            }
        });

        signaling_socket.on('changeUserPItemPosition', function (content) {
            changeUserPItemPosition(content);
        });

        signaling_socket.on('removeUserPItem', function (content) {
            $("#" + content.itemId).remove();
            for (var i = 0; i < userPItems.length; i++) {
                if (userPItems[i]["itemId"] == content.itemId) {
                    userPItems.splice(i, 1);
                }
            }
            if (pitemWebcamStreams[content.itemId]) {
                mySFU.unpublishStream(pitemWebcamStreams[content.itemId])
                delete pitemWebcamStreams[content.itemId];
            }
        });

        signaling_socket.on('showHideClock', function (trueFalse) {
            if (trueFalse) {
                $("#clockWrapper").show();
            } else {
                $("#clockWrapper").hide();
            }
        });

        signaling_socket.on('changeUserPItemPosition', function (content) {
            changeUserPItemPosition(content);
        });

        signaling_socket.on('removeAllUserPItems', function (content) {
            removeAllUserPitems();
            if (content) {
                var currentPraesiName = content["currentPraesiName"];
                var currentPraesiSlide = content["currentPraesiSlide"];
                var i = userPItems.length;
                while (i--) {
                    if (userPItems[i]["praesislide"] == currentPraesiSlide && userPItems[i]["praesiname"] == currentPraesiName) {
                        userPItems.splice(i, 1);
                    }
                }
            } else {
                for (var i = 0; i < userPItems.length; i++) {
                    if (!userPItems[i]["praesislide"] && !userPItems[i]["praesiname"]) {
                        userPItems.splice(i, 1);
                    }
                }
            }
        });

        signaling_socket.on('showHideUserPItems', function (showHide) {
            if (showHide == "show") {
                $("#userTootlsBtn").addClass("alert-danger");
                $(".userTools").show();
            } else
                $(".userTools").hide();
        });

        signaling_socket.on('drawSomething', function (content) {
            drawSomething(content);
        });

        signaling_socket.on('drawWhiteboard', function (content) {
            whiteboard.handleEventsAndData(content, true);
        });

        var currentTimeTimer = false;
        signaling_socket.on('getTimeStamp', function (time) {
            if (currentTimeTimer != false) {
                clearInterval(currentTimeTimer);
            }
            var crntTime = time;
            currentTimeTimer = setInterval(function () {
                crntTime += 1000;
                var date = new Date(crntTime);
                var min = date.getMinutes();
                if (min < 10)
                    min = "0" + min;
                var hour = date.getHours();
                if (hour < 10)
                    hour = "0" + hour;
                var timeString = hour + ":" + min;
                $("#serverTime").text(timeString);
            }, 1000);

        });

        signaling_socket.on('setUserPItemsText', function (content) {
            var text = cleanString(content.text);
            if (content.image) {
                var image = $('<img style="width: 100%; max-height: 100%;" src="' + document.URL.substr(0, document.URL.lastIndexOf('/')) + '' + text + '">');
                $("#" + content.itemId).find(".innerContent").html(image);
            } else {
                $("#" + content.itemId).find("textarea").val(text);
            }
        });

        signaling_socket.on('setUserColor', function (userData) {
            setUserColor(userData["userId"], userData["color"]);
        });

        signaling_socket.on('changeElementSize', function (content) {
            $("#" + content.itemId).css({
                "width": content["width"],
                "height": content["height"]
            });
            $("#" + content.itemId).find(".innerContent").css({
                "width": content["width"],
                "height": (content["height"] - 27) + "px"
            });
            $("#" + content.itemId).find("video").css({
                "width": content["width"],
                "height": (content["height"] - 27) + "px"
            });
        });

        signaling_socket.on('lockUnLockCanvas', function (content) {
            $("#" + content.itemId).find("canvas").attr("drawable", content["lockUnlock"]);
            if (content["lockUnlock"] == "true") {
                $("#" + content.itemId).find("canvas").css("cursor", "crosshair");
                $("#" + content.itemId).find(".colorToPickContainer").show();
            } else {
                $("#" + content.itemId).find(".colorToPickContainer").hide();
                $("#" + content.itemId).find("canvas").css("cursor", "auto");
            }
        });

        signaling_socket.on('makeTransparent', function (content) {
            var itemId = content.itemId;
            var transparent = content.transparent;
            if (transparent) {
                $("#" + content.itemId).addClass("transparent");
                $("#" + content.itemId).find("canvas").addClass("transparent");
                $("#" + content.itemId).find(".innerContent").addClass("transparent");
            } else {
                $("#" + content.itemId).removeClass("transparent");
                $("#" + content.itemId).find("canvas").removeClass("transparent");
                $("#" + content.itemId).find(".innerContent").removeClass("transparent");
            }
        });

        signaling_socket.on('youtubeCommand', function (content) {
            if (content.key == "loadVideo") {
                loadYoutubeVideo(content.data, roomImIn["moderator"] == ownSocketId);
            } else if (content.key == "status" && roomImIn["moderator"] != ownSocketId) {

                var status = content.data;
                if (status == 1) {
                    playYoutube(content.time);
                } else if (status == 2) {
                    pauseYoutube();
                }
            }
        });

        signaling_socket.on('changeTab', function (content) {
            var tab = content["tab"];
            currentTab = tab;
            userPItems = content["userPItems"] || [];
            $(".praesiMainContent").hide();
            $(tab).show();

            refreshUserItems();

            if (playingSnake) {
                playingSnake = false;
                writeToChat("Snake", "" + playingSnake);
            }
            if (tab == "#homeScreen") {
                $("#startSnake").show();
            } else {
                $("#startSnake").hide();
            }

            if ($("#praesiCursorBtn").hasClass("alert-danger")) {
                $("#praesiCursorBtn").click();
                $("#praesiCursorBtn").click(); //Refresh the cursor
            }
        });

        signaling_socket.on('audioVolume', function (content) {
            var volI = $("#" + content.userId).find(".userVolume");
            if (content.vol == 0) {
                volI.removeClass("fa-volume-up");
                volI.removeClass("fa-volume-down");
                volI.addClass("fa-volume-off");
                volI.css({
                    "color": "rgb(142, 142, 142)",
                    "margin-right": "10px"
                });
            } else if (content.vol == 1) {
                volI.removeClass("fa-volume-up");
                volI.removeClass("fa-volume-off");
                volI.addClass("fa-volume-down");
                volI.css({
                    "color": "rgb(90, 90, 90)",
                    "margin-right": "6px"
                });
            } else {
                volI.removeClass("fa-volume-off");
                volI.removeClass("fa-volume-down");
                volI.addClass("fa-volume-up");
                volI.css({
                    "color": "black",
                    "margin-right": "2px"
                });
            }
        });

        signaling_socket.on('sigleFilesTable', function (fileTable) {
            allSingleFiles = fileTable;
            $("#fileTable>tbody").empty();
            $("#singleFileUploadSpinner").hide();
            $(".allSingleFilesSelect").empty();
            for (var i in fileTable) {
                (function () {
                    var filename = fileTable[i]["filename"];
                    var username = fileTable[i]["username"];
                    var date = new Date(fileTable[i]["date"]);
                    var formatDate = date.getDate() + "." + (date.getMonth() + 1) + "." + date.getUTCFullYear();
                    var tr = $('<tr filename="' + filename + '" class="fileTr">' +
                        '<td><a class="singleFileName" target="#" href="./singlefiles/' + filename + '">' + filename + '</a></td>' +
                        '<td>' + username + '</td>' +
                        '<td>' + formatDate + '</td>' +
                        '<td style="text-align: right; padding-right: 10px;"><i title="show this content directly" style="cursor:pointer; padding-right: 10px;" class="showItemOnTable fa fa-eye"></i> <i style="cursor:pointer;" class="removeSingleFile fa fa-trash"></i></td>' +
                        '</tr>');
                    tr.find(".removeSingleFile").click(function () {
                        sendRemoveSingleFile($(this).parents("tr").attr("filename"));
                    });
                    if (isImageFileName(filename)) {
                        $(".allSingleFilesSelect").append('<option value="./singlefiles/' + filename + '">' + filename + '</option>');
                    }

                    if (isImageFileName(filename)) {
                        tr.find(".showItemOnTable").click(function () { //Make element
                            if (currentTab == "#whiteboardScreen") {
                                whiteboard.addImgToCanvasByUrl(document.URL.substr(0, document.URL.lastIndexOf('/')) + "/singlefiles/" + filename);
                            } else {
                                var dropId = ownSocketId + (new Date().getTime());
                                sendAddUserPItem("image", 0, 0, dropId, { "text": '/singlefiles/' + filename });
                            }
                        });
                    } else if (isJsonFileName(filename)) {
                        tr.find(".showItemOnTable").click(function () { //Make element
                            var _this = this;

                            if (currentTab == "#whiteboardScreen") {
                                $(_this).hide();
                                $.getJSON(document.URL.substr(0, document.URL.lastIndexOf('/')) + "/singlefiles/" + filename, function () {
                                    //wait for done!
                                }).done(function (data) {
                                    whiteboard.loadJsonData(data);
                                    writeToChat("Success", "Content loaded to Whiteboard!");
                                    $(_this).show();
                                }).fail(function () {
                                    writeToChat("Error", "Failed to load the file. Maybe its gone?");
                                    $(_this).show();
                                });
                            } else {
                                writeToChat("Error", "You load this file to the Whiteboard only!");
                            }
                        });
                    } else {
                        tr.find(".showItemOnTable").remove();
                    }

                    $("#fileTable>tbody").append(tr);
                })();
            }
            Ps.update(document.getElementById('fileTableWrapper'));
        })
    })
}


