// ==UserScript==
// @name         SpamtrackerReboot
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Rewrite of the spamtracker project, this userscript will notify you using sound and a notification if a new spam post has been posted in any smoke detector supported rooms
// @author       Ferrybig
// @match        *://chat.meta.stackexchange.com/*
// @match        *://chat.stackexchange.com/*
// @match        *://chat.stackoverflow.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

window.Spamtracker = (function(target, siterooms) {
    'use strict';

    var useSound = true;
    var defaultSounds = {
        metastackexchange: '//cdn-chat.sstatic.net/chat/meta2.mp3',
        stackexchange: '//cdn-chat.sstatic.net/chat/se.mp3',
        stackoverflow: '//cdn-chat.sstatic.net/chat/so.mp3',
        serverfault: '//cdn-chat.sstatic.net/chat/sf.mp3',
        superuser: '//cdn-chat.sstatic.net/chat/su.mp3',
        askubuntu: '//cdn-chat.sstatic.net/chat/ubuntu.mp3',
    };
    var userSounds = {};
    var sound = {};
    var enabled = true;
    var defaultSound = 'metastackexchange';
    var perSiteSounds = {};

    var metaData = GM_info.script || GM_info.SpamtrackerReboot;

    var sitename;
    var callback;
    var lastMessageObserverTarget;
    var lastMessageObserver;
    /**
    * List of open web notification
    */
    var notifications = {};

    /**
    * Loads this userscript
    */
    var init = function() {
        var sitename = siterooms ? siterooms.href.split("host=")[1] : "charcoal-hq";
        loadSettings();
        registerObserver();
        restoreCallback();
        preloadSoundList(false);
    };

    var loadSettings = function() {
        userSounds = getConfigOption("sounds", {}, true);
        perSiteSounds = getConfigOption("sounds-per-site", {}, true);
        enabled = getConfigOption("enabled", true, false);
        defaultSound = getConfigOption("defaultsound", "metastackexchange", true);
    };

    var prepareSound = function(url) {
        if(url && !sound[url]) {
            sound[url] = new Audio(url);
        }
    };

    var preloadSoundList = function(loadAll) {
        if(loadAll) {
            userSounds.forEach(prepareSound);
            for (var key in defaultSounds) {
                if (!defaultSounds.hasOwnProperty(key)) continue;
                prepareSound(defaultSounds[key]);
            }
        } else {
            console.log(userSounds, perSiteSounds, enabled, defaultSound);
            for(var i in perSiteSounds) {
                if (!perSiteSounds.hasOwnProperty(i)) continue;
                let soundName = perSiteSounds[i];
                let soundUrl = userSounds[soundName] || defaultSounds[soundName];
                prepareSound(soundUrl);
            }
            let soundUrl = userSounds[defaultSound] || defaultSounds[defaultSound];
            prepareSound(soundUrl);
        }
    };

    /**
    * Restores the callback to the orginal function
    */
    var restoreCallback = function() {
        callback = function(msg) {
            if('fire' in window && 'openReportPopupForMessage' in window.fire) {
                window.focus();
                fire.openReportPopupForMessage(msg.elm);
            } else {
                window.open(msg.url);
            }
        };
    };

    /**
    * Useful for other scripts to interact with clicking on notifications
    */
    var setCallback = function(newCallback) {
        callback = newCallback;
    };

    /**
    * Plays the sound effect
    */
    var playSound = function(msg) {
        if(useSound) {
            var siteSound = perSiteSounds[msg.site];
            var soundUrl = defaultSounds[siteSound] || userSounds[siteSound] || defaultSounds[defaultSound];
            if(!sound[soundUrl]) {
                console.log("Sound " + soundUrl + " was not ready when we needed it, coming from " + siteSound + " on site " + msg.site);
                prepareSound(soundUrl);
            }
            sound[soundUrl].play();
        }
    };

    /**
    * Creates a notification for a post
    */
    var notifyMe = function (msg) {
        playSound(msg);
        var notification = new Notification(msg.title, {
            body: msg.message,
            icon: '//i.stack.imgur.com/WyV1l.png?s=128&g=1'
        });
        notification.onshow = function() {
            msg.timeout = window.setTimeout(function() {
                dismissNotification(msg.id);
            }, 15000);
        };
        notification.onclick = function() {
            callback(msg);
            dismissNotification(msg.id);
        };
        notifications[msg.id] = notification;
    };

    /**
    * Close notification by id
    */
    var dismissNotification = function(id) {
        if(notifications[id]) {
            notifications[id].close();
            delete notifications[id];
        }
    };

    /**
    * Progress a message in chat by element
    */
    var processChatMessage = function(message) {
        //console.log("Chat message!" + message.children[1].innerHTML);
        if(!enabled || !message || !message.children[1]) {
            return false;
        }
        var smoke = /\/\/goo.gl\/eLDYqh/i;
        var sePostRegex = /\/\/[a-z]*.stackexchange.com|stackoverflow.com|superuser.com|serverfault.com|askubuntu.com|stackapps.com|mathoverflow.net/i;
        var content = message.children[1].innerHTML;
        var textContent = message.children[1].textContent;

        if (!smoke.test(content) || !sePostRegex.test(content)) {
            return false;
        }
        //console.log("Match!");
        var ch = message.children[1].children;
        var msg = {};
        msg.site = false;
        msg.qId = false;

        // Loop through all A tags, in search of a link to a stackexchange site, update information in `msg` with the last SE link
        for (var i = ch.length - 1; i >= 0; i--) {
            if (ch[i].tagName !== 'A') {
                continue;
            }
            var hash = ch[i].href.split('#');
            var path = ch[i].href.split('/');
            if (path[3] === 'questions' && hash.length > 1) {
                msg.site = path[2];
                msg.qId = hash[1];
            } else if (/^[qa]/.test(path[3])) {
                msg.site = path[2];
                msg.qId = path[4];
            }
        }
        if (!msg.site || !msg.qId) {
            return false;
        }
        var parts = textContent.indexOf(': ');
        if (parts < 0) {
            return false;
        }
        var prefixStart = textContent.indexOf('] ');
        msg.id = message.id;
        msg.reason = textContent.substring(prefixStart + 2, parts).split(', ');
        msg.title = "[ SmokeDetector ] \n" + msg.reason.join("\n");
        msg.message = textContent.substring(parts + 1);
        msg.url = '//' + msg.site + '/q/' + msg.qId;
        msg.elm = message;
        notifyMe(msg);
        return true;
    };

    /**
    * Register an observer on the .messages element
    */
    var registerMessageObserver = function(elm) {
        if(elm === lastMessageObserverTarget) {
            return;
        }

        lastMessageObserverTarget = elm;
        if(lastMessageObserver !== undefined) {
            lastMessageObserver.disconnect();
        }
        var children = elm.getElementsByClassName('message');
        if(children.length) {
            processChatMessage(children[children.length - 1]);
        }
        lastMessageObserver = new MutationObserver(function(mutations) {
            processChatMessage(children[children.length - 1]);
        });
        lastMessageObserver.observe(elm, { childList: true });
    };

    /**
    * Register an observer on the .monolog.user-container.user-{*}  element
    */
    var registerMonologObserver = function(elm) {
        var children = elm.getElementsByClassName('messages');
        if(children.length) {
            registerMessageObserver(children[children.length - 1]);
        } else {
            var observer = new MutationObserver(function(mutations) {
                registerMessageObserver(children[children.length - 1]);
                observer.disconnect();
            });
            observer.observe(elm, { childList: true });
        }
    };

    /**
    * Register an observer on the #chat element
    */
    var registerObserver = function() {
        Notification.requestPermission();
        var children = target.getElementsByClassName('monologue');
        if(children.length) {
            registerMonologObserver(children[children.length - 1]);
        }
        var observer = new MutationObserver(function(mutations) {
            registerMonologObserver(children[children.length - 1]);
        });
        observer.observe(target, { childList: true });
    };

    var getConfigOption = function(key, defaultValue, global) {
        var data = JSON.parse(window.localStorage.getItem(metaData.name + '-' + (global ? sitename + '-' : '') + key));
        if(!data) {
            setConfigOption(key, defaultValue, global);
            return defaultValue;
        }
        return data;
    };

    var setConfigOption = function(key, value, global) {
        window.localStorage.setItem(metaData.name + '-' + (global ? sitename + '-' : '') + key, JSON.stringify(value));
    };

    init();

    return {
        setCallback: setCallback,
        restoreCallback: restoreCallback,
        processChatMessage: processChatMessage,
        metaData: metaData
    };

})(document.getElementById('chat'), document.getElementById('siterooms'));
