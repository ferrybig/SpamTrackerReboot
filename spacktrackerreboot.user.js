// ==UserScript==
// @name         SpamtrackerReboot
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        *://chat.meta.stackexchange.com/*
// @match        *://chat.stackexchange.com/*
// @match        *://chat.stackoverflow.com/*
// @run-at          document-end
// @grant        none
// ==/UserScript==

window.Spamtracker = (function(target) {
    'use strict';

    var useSound = true;
    var sound = new Audio('//cdn-chat.sstatic.net/chat/meta2.mp3');

    var callback;
    var lastMessageObserverTarget;
    var lastMessageObserver;
    var notifications = {};

    var restoreCallback = function() {
        callback = function(url) {
            window.open(url);
        };
    };

    /**
    * Usefull four our script to interact with clicking on notifications
    */
    var setCallback = function(newCallback) {
        callback = newCallback;
    };

    var notifyMe = function (id, title, message, callback, url, elm) {
        //console.log("Trying notification!", url);
        var notification = new Notification(title, { body: message, icon: "//i.imgur.com/kS4QNIv.png" });
        notification.onshow = function() {
            setTimeout(function() {
                dismissNotification(id);
            }, 15000);
        };
        notification.onclick = function() {
            callback();
            dismissNotification(id);
        };
        notifications[id] = notification;
    };

    var dismissNotification = function(id) {
        notifications[id].close();
        delete notifications[id];
    };

    function processChatMessage(message) {
        //console.log("Chat message!" + message.children[1].innerHTML);
        var smoke = /\/\/goo.gl\/eLDYqh|spam|offensive|abusive/i;
        var content = message.children[1].innerHTML;
        var i, msg = {}, parts, ch, path, hash, site = '', qId = '';
        if (smoke.test(content) && /\/\/[a-z]*.stackexchange.com|stackoverflow.com|superuser.com|serverfault.com|askubuntu.com|stackapps.com|mathoverflow.net/i.test(content)) {
            //console.log("Match!");
            ch = message.children[1].children;
            for (i=ch.length-1; i>=0; i--) {
                if (ch[i].tagName == 'A') {
                    hash = ch[i].href.split('#');
                    path = ch[i].href.split('/');
                    if (path[3] == 'questions' && hash.length>1) {
                        site = path[2];
                        qId = hash[1];
                    }
                    else if (/^[qa]/.test(path[3])) {
                        site = path[2];
                        qId = path[4];
                    }
                }
            }
            if (site && qId && useSound) {
                sound.play();
            }
            msg.id = site+'-'+qId+'-'+Date.now();
            parts = message.children[1].textContent.split(': ');
            if (parts.length > 1) {
                msg.title = parts[0];
                msg.message = parts[1];
            } else {
                // msg.title = 'Flag Request';
                // msg.message = message.children[1].textContent;
                return; // Not used for now...
            }
            msg.type = 'chat';
            notifyMe(msg.id, msg.title, msg.message, callback, '//' + site + '/q/' + qId, message);
        }
    }
    var registerMessageObserver = function(elm) {
        if(elm === lastMessageObserverTarget) {
            return;
        }

        //console.log("Register message observer!");
        lastMessageObserverTarget = elm;
        if(lastMessageObserver !== undefined) {
            lastMessageObserver.dispose();
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

    var registerMonologObserver = function(elm) {
        //console.log("Register monolog observer!");
        var children = elm.getElementsByClassName('messages');
        if(children.length) {
            registerMessageObserver(children[children.length - 1]);
        } else {
            var observer = new MutationObserver(function(mutations) {
                registerMessageObserver(children[children.length - 1]);
                observer.dispose();
            });
            observer.observe(elm, { childList: true });
        }
    };

    var registerObserver = function() {
        //console.log("Register main observer!");
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



    registerObserver();
    restoreCallback();


    return {
        setCallback: setCallback,
        restoreCallback: restoreCallback,
    };

})(document.getElementById('chat'));