var alexa = require("alexa-app");
var search = require('youtube-search');
var fs = require('fs');
var request = require('request');

var app = new alexa.app("youtube");

var searchOpts = {
    maxResults: 1,
    type: 'video',
    key: process.env.YOUTUBE_API_KEY
};

var lastSearch;

app.pre = function(req, response, type) {
    if (req.applicationId !== process.env.ALEXA_APPLICATION_ID) {
        response.fail("Invalid application");
    }
};

app.intent("GetVideoIntent", {
        "slots": {
            "VideoQuery": "VIDEOS",
        },
        "utterances": [
            "search for {-|VideoQuery}",
            "find {-|VideoQuery}",
            "play {-|VideoQuery}",
            "start playing {-|VideoQuery}",
            "put on {-|VideoQuery}"
        ]
    },
    function(req, response) {
        var query = req.slot("VideoQuery");

        console.log('Searching ... ' + query);

        return new Promise((resolve, reject) => {
            search(query, searchOpts, function(err, results) {
                if (err) {
                    reject(err.message);
                } else if (results.length !== 1) {
                    resolve({
                        message: 'I could not complete your request at this moment.',
                        url: null,
                        metadata: null
                    });
                } else {
                    var metadata = results[0];
                    if (metadata.id === undefined) {
                        resolve({
                            message: query + ' did not return any results on YouTube.',
                            url: null,
                            metadata: null
                        });
                    } else {
                        console.log('Found ... ' + metadata.title);
                        var id = metadata.id;
                        var externalDownload = 'https://dmhacker-youtube.herokuapp.com/alexa/' + id;
                        request(externalDownload, function(err, res, body) {
                            console.log('Processed.');
                            if (err) {
                                reject(err.message);
                            } else {
                                recursive_check(id, 1000, function(err) {
                                    if (err) {
                                        reject(err.message);
                                    }
                                    else {
                                        lastSearch = JSON.parse(body).link;
                                        console.log('Stored @ '+lastSearch);
                                        resolve({
                                            message: 'I found a relevant video called ' + metadata.title + '.',
                                            url: lastSearch,
                                            metadata: metadata
                                        });
                                    }
                                });
                            }
                        });
                    }
                }
            });
        }).then(function (content) {
            var message = content.message;
            var streamUrl = content.url;
            var metadata = content.metadata;
            response.say(message);
            if (streamUrl) {
                response.audioPlayerPlayStream('REPLACE_ALL', {
                    'url': streamUrl,
                    'token': metadata.id,
                    'offsetInMilliseconds': 0
                });
                response.card({
                    'type': 'Simple',
                    'title': 'Search for "' + query + '"',
                    'content': 'Alexa found "' + metadata.title + '" at ' + metadata.link + '.'
                });
            }
            response.send();
        }).catch(function(reason) {
            response.fail(reason);
        });
    }
);

function recursive_check(id, delay, callback) {
    var linkCheck = 'https://dmhacker-youtube.herokuapp.com/alexa-check/' + id;
    request(linkCheck, function (err, res, body) {
        if (err) {
            callback(err);
        }
        else {
            var metadata = JSON.parse(body).metadata;
            if (!metadata) {
                callback(err);
            }
            else {
                if (metadata.downloaded) {
                    callback(null);
                }
                else {
                    setTimeout(function () {
                        recursive_check(id, delay, callback);
                    }, delay);
                }
            }
        }
    });
}

app.audioPlayer("PlaybackStarted", function(request, response) {
    console.log('Playback started.');
});

app.audioPlayer("PlaybackFailed", function(request, response) {
    console.log('Playback failed.');
    console.log(request.data.request.error);
});

app.intent("AMAZON.PauseIntent", {}, function(req, response) {
    response.audioPlayerStop();
});

app.intent("AMAZON.ResumeIntent", {}, function(req, response) {
    if (lastSearch === undefined) {
        response.say('You were not playing any video previously.');
    } else {
        response.audioPlayerPlayStream('ENQUEUE', {
            'url': lastSearch,
            'streamFormat': 'AUDIO_MPEG',
            'token': constants.token,
            'expectedPreviousToken': constants.expectedPreviousToken
        });
    }
});

app.intent("AMAZON.StopIntent", {}, function(req, response) {
    lastSearch = undefined;
    response.audioPlayerStop();
    response.audioPlayerClearQueue();
});

exports.handler = app.lambda();
