/* global GM_info, Notification, fire */

// ==UserScript==
// @name         SpamtrackerReboot
// @version      0.9
// @description  Rewrite of the spamtracker project, this userscript will notify you using sound and a notification if a new spam post has been posted in any smoke detector supported rooms
// @author       Ferrybig
// @match        *://chat.meta.stackexchange.com/*
// @match        *://chat.stackexchange.com/*
// @match        *://chat.stackoverflow.com/*
// @run-at       document-end
// @require      https://cdn.datatables.net/1.10.13/js/jquery.dataTables.min.js#sha512=1ac1502c5a6774e6e7d3c77dd90d863f745371cd936d8a1620ab1c4a21173ffccfd327e435395df6658779ea87baad3b5ff84bf195110c7bc3187112ee820917
// @resource     DataTablesCSS https://cdn.datatables.net/1.10.13/css/jquery.dataTables.min.css#sha512=c45f1efde68a4130b5d7b68f2441ba1a85d552fda2076772ba67bdc0fb8d05c21e0d81e89ab418cec18d0ca7d304d9a5504998c05d73f778c4c9f20bbeefaad3
// @grant        GM_getResourceText
// ==/UserScript==

window.Spamtracker = (function (target, siterooms) {
    'use strict';

    // Defaults
    const defaultSounds = {
        metastackexchange: '//cdn-chat.sstatic.net/chat/meta2.mp3',
        stackexchange: '//cdn-chat.sstatic.net/chat/se.mp3',
        stackoverflow: '//cdn-chat.sstatic.net/chat/so.mp3',
        serverfault: '//cdn-chat.sstatic.net/chat/sf.mp3',
        superuser: '//cdn-chat.sstatic.net/chat/su.mp3',
        askubuntu: '//cdn-chat.sstatic.net/chat/ubuntu.mp3'
    };
    const css =
            ".spamtracker-popup-bg {" +
            "  position: fixed;" +
            "  width: 100%;" +
            "  height: 100%;" +
            "  top: 0;" +
            "  left: 0;" +
            "  background-color: rgba(0, 0, 0, 0.5);" +
            "  z-index: 100;" +
            "  text-align: center;" +
            "}" +
            ".spamtracker-popup-bg.hidden {" +
            "  display: none;" +
            "}" +
            ".spamtracker-popup-bg:before {" +
            "  content:''; " +
            "  display:inline-block; " +
            "  height:100%; " +
            "  vertical-align:middle;" +
            "}" +
            ".spamtracker-popup {" +
            "  width: 800px;" +
            "  display: inline-block;" +
            "  background: white;" +
            "  padding: 20px;" +
            "  border-radius: 10px;" +
            "  vertical-align: middle;" +
            "  box-shadow: 0 0 20px 2px rgba(0, 0, 0, 0.5);" +
            "}" +
            ".spamtracker-header {" +
            "  border-top-left-radius: 10px;" +
            "  border-top-right-radius: 10px;" +
            "  background-color: gray;" +
            "  margin: -20px -20px 1rem;" +
            "  padding: 10px;" +
            "  font-size: 3em;" +
            "}" +
            ".spamtracker-header-btn {" +
            "  width: 10rem;" +
            "}" +
            ".spamtracker-header-btn-close {" +
            "  width: 4rem;" +
            "  float: right;" +
            "}" +
            ".spamtracker-header-btn-bar {" +
            "}" +
            ".spamtracker-tab {" +
            "  max-height: 75vh;" +
            "  overflow: scroll;" +
            "}" +
            ".spamtracker-table {" +
            "  width: 100%;" +
            "}"
            ;


    // Settings
    let useSound = true;
    let userSounds = {};
    let enabled = true;
    let defaultSound = 'metastackexchange';
    let perSiteSounds = {};
    let maxNotifications = 2;

    // Metadata
    let metaData = GM_info.script || GM_info.SpamtrackerReboot;

    // Caches
    const sound = {};
    const sitename = siterooms ? siterooms.href.split("host=")[1] : undefined;
    let callback;
    let lastMessageObserverTarget;
    let lastMessageObserver;
    let seSites = {sites: [], lastUpdate: 0};
    /**
     * List of open web notification
     */
    const notifications = {};
    const notificationsQueue = [];

    // DOM stuff
    let domSpamtracker;
    let domGuiHolder;
    let domGui;
    let domTabSound;
    let domTabSites;

    /**
     * Loads this userscript
     */
    const init = function () {
        loadSeSites();
        loadSettings();
        registerObserver();
        restoreCallback();
        preloadSoundList(false);
        createDOMNodesForGui();
    };

    const loadSeSites = function () {
        seSites = getConfigOption("sites", seSites, true) || seSites;
        const ONE_MONTH = 28 * 24 * 60 * 60 * 1000; /* ms */


        if (seSites.sites.length === 0 || ((new Date) - seSites.lastUpdate) > ONE_MONTH) {
            const xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = () => {
                if (xhttp.readyState === 4 && xhttp.status === 200) {
                    seSites.sites = sortByKey(JSON.parse(xhttp.responseText).items, 'name');
                    seSites.lastUpdate = new Date;
                    setConfigOption("sites", seSites, true)
                }
            };
            xhttp.open('GET', 'https://api.stackexchange.com/2.2/sites?pagesize=10000&filter=!2--Yion.3M.ViUyt1*T9R', true);
            xhttp.send();
        }
    };

    const loadSettings = function () {
        userSounds = getConfigOption("sounds", userSounds, true);
        perSiteSounds = getConfigOption("sounds-per-site", perSiteSounds, true);
        enabled = getConfigOption("enabled", true, false);
        defaultSound = getConfigOption("defaultsound", "metastackexchange", true);
    };

    const prepareSound = function (url) {
        if (url) {
            if (!sound[url]) {
                sound[url] = new Audio(url);
            }
            return true;
        }
        return false;
    };

    const preloadSoundList = function (loadAll) {
        if (loadAll) {
            for (let key in userSounds) {
                if (!userSounds.hasOwnProperty(key))
                    continue;
                prepareSound(userSounds[key]);
            }
            for (let key in defaultSounds) {
                if (!defaultSounds.hasOwnProperty(key))
                    continue;
                prepareSound(defaultSounds[key]);
            }
        } else {
            for (let i in perSiteSounds) {
                if (!perSiteSounds.hasOwnProperty(i))
                    continue;
                const soundName = perSiteSounds[i];
                const soundUrl = userSounds[soundName] || defaultSounds[soundName];
                prepareSound(soundUrl);
            }
            const soundUrl = userSounds[defaultSound] || defaultSounds[defaultSound];
            prepareSound(soundUrl);
        }
    };

    const makeElement = function (type, classes, text) {
        const elm = document.createElement(type);
        if (classes.constructor === Array) {
            for (var i = 0; i < classes.length; i++) {
                elm.classList.add(classes[i]);
            }
        } else {
            elm.className = classes;
        }
        if (text)
            elm.textContent = text;
        return elm;
    };

    const makeText = function (text) {
        return document.createTextNode(text);
    };

    const makeButton = function (text, classes, click, type) {
        const elm = makeElement(type || 'button', classes, text);
        if (text && typeof text === "function") {
            elm.textContent = text();
            elm.onclick = evt => {
                click(evt);
                elm.textContent = text();
            };
        } else {
            elm.onclick = click;
        }
        return elm;
    };

    const createDOMSelectionListForSite = function (site, friendlyName, iconUrl) {
        preloadSoundList(true);
        const icon = makeElement('img', [], '');
        const soundSelect = makeElement('select', [], '');
        const soundTest = makeElement('a', [], '►');

        const iconCell = makeElement('td', [], '');
        const siteNameCell = makeElement('td', [], friendlyName);
        const soundCell = makeElement('td', [], '');

        const row = makeElement('tr', [], '');

        icon.src = iconUrl;
        icon.height = 16;
        let selectedSound = userSounds;
        const keys = [];
        for (let key in defaultSounds) {
            if (!defaultSounds.hasOwnProperty(key))
                continue;
            if (userSounds[key])
                continue;
            keys.push(key);
        }
        for (let key in userSounds) {
            if (!userSounds.hasOwnProperty(key))
                continue;
            keys.push(key);
        }
        if (keys.indexOf(selectedSound) === -1) {
            if (keys.indexOf(defaultSound) === -1) {
                console.log("Default sound updated, because previous one was missing");
                defaultSound = Object.keys(defaultSounds)[0];
            }
            selectedSound = defaultSound;
        }
        for (let i = 0; i < keys.length; i++) {
            const option = makeElement('option', [], keys[i]);
            option.value = keys[i];
            if (keys[i] === selectedSound) {
                option.selected = true;
            }
            soundSelect.append(option);
        }
        soundSelect.addEventListener('change', () => {
            if (soundSelect.value === defaultSound) {
                delete perSiteSounds[site];
            } else {
                perSiteSounds[site] = soundSelect.value;
            }
            setConfigOption("sounds-per-site", perSiteSounds, true);
        });
        soundTest.href = 'javascript:void(0)';
        soundTest.addEventListener('click', () => playSoundFile(soundSelect.value));

        iconCell.append(icon);
        soundCell.append(soundSelect);
        soundCell.append(soundTest);

        row.append(iconCell);
        row.append(siteNameCell);
        row.append(soundCell);

        return row;
    };

    const createDOMSelectionListForAllSites = function () {
        if (domTabSites)
            return;
        const domTable = makeElement('table', 'spamtracker-table', '');
        const domTableHead = makeElement('thead', [], '');
        const domTableHeadRow = makeElement('tr', [], '');
        const domTableHeadCellIcon = makeElement('th', [], '');
        const domTableHeadCellName = makeElement('th', [], 'Name');
        const domTableHeadCellSound = makeElement('th', [], 'Sound');
        domTableHeadRow.append(domTableHeadCellIcon);
        domTableHeadRow.append(domTableHeadCellName);
        domTableHeadRow.append(domTableHeadCellSound);
        domTableHead.append(domTableHeadRow);
        const domTableBody = makeElement('tbody', [], '');
        for (let i = 0; i < seSites.sites.length; i++) {
            if (seSites.sites[i].site_url.includes('.meta.')) {
                continue;
            }
            domTableBody.append(createDOMSelectionListForSite(seSites.sites[i].site_url.replace('https://', ''), seSites.sites[i].name, seSites.sites[i].favicon_url));
        }
        domTable.append(domTableHead);
        domTable.append(domTableBody);
        domTabSites = makeElement('div', ['spamtracker-tab-sound', 'spamtracker-tab'], '');
        domTabSites.append(domTable);
        domGui.append(domTabSites);

        // The following is the only JQuery code inside this file...
        if ($) {
            $(domTable).DataTable({
                aoColumns: [
                    null,
                    null,
                    {bSearchable: false}
                ]});
        }
    };

    const createDOMNodesForGui = function () {
        // CSS
        addStyleString(GM_getResourceText('DataTablesCSS'));
        addStyleString(css);

        // Footerbar
        const insertRef = document.getElementById('footer-legal');
        const separator = makeText(' | ');
        insertRef.insertBefore(separator, insertRef.firstChild);


        domSpamtracker = makeButton("spamtracker: " + (enabled ? "on" : "off"), [], () => {
            domGuiHolder.classList.remove('hidden');
            createDOMSelectionListForAllSites();
        }, 'a');
        domSpamtracker.href = 'javascript:void(0)';
        insertRef.insertBefore(domSpamtracker, insertRef.firstChild);

        // Main gui
        const domClose = makeButton("Close", "button spamtracker-header-btn-close", function () {
            domGuiHolder.classList.add('hidden');
        });

        const domHeader = makeElement('h2', "spamtracker-header", "Spamtracker");
        domHeader.append(domClose);

        const domEnableDisable = makeButton(
                () => !enabled ? "Enable Spamtracker" : "Disable Spamtracker",
                "button spamtracker-header-btn",
                () => {
            enabled = !enabled;
            setConfigOption("enabled", enabled, false);
            domSpamtracker.textContent = "spamtracker: " + (enabled ? "on" : "off");
        });

        const domBtnBar = makeElement("div", "spamtracker-header-btn-bar");
        domBtnBar.append(domEnableDisable);

        domGui = makeElement('div', 'spamtracker-popup');
        domGui.append(domHeader);
        domGui.append(domBtnBar);

        domGuiHolder = makeElement('div', 'spamtracker-popup-bg hidden');
        domGuiHolder.append(domGui);

        document.body.append(domGuiHolder);
    };

    const addStyleString = function (str) {
        const node = document.createElement('style');
        node.innerHTML = str;
        document.head.appendChild(node);
    };

    /**
     * Restores the callback to the orginal function
     */
    const restoreCallback = function () {
        callback = (msg) => {
            if ('fire' in window && 'openReportPopupForMessage' in window.fire) {
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
    const setCallback = function (newCallback) {
        callback = newCallback;
    };

    /**
     * Plays the sound effect
     */
    const playSound = function ( {site}) {
        if (useSound) {
            const siteSound = perSiteSounds[site];
            playSoundFile(siteSound);
    }
    };

    const playSoundFile = function (soundName) {
        const soundUrl = defaultSounds[soundName] || userSounds[soundName] || defaultSounds[defaultSound];
        if (!sound[soundUrl]) {
            console.log("Sound " + soundUrl + " was not ready when we needed it, coming from " + soundName);
            if (!prepareSound(soundUrl)) {
                return false;
            }
        }
        sound[soundUrl].play();
        return true;
    };

    /**
     * Creates a notification for a post
     */
    const notifyMe = function (msg) {
        if (!enabled) {
            return;
        }
        playSound(msg);
        const notification = new Notification(msg.title, {
            body: msg.message,
            icon: '//i.stack.imgur.com/WyV1l.png?s=128&g=1'
        });
        notification.onshow = () => {
            if (notification.closed)
                notification.close();
            msg.timeout = window.setTimeout(() => dismissNotification(msg.id), 15000);
        };
        notification.onclick = () => {
            callback(msg);
            dismissNotification(msg.id);
        };
        notifications[msg.id] = notification;
        notificationsQueue.push(msg.id);

        if (notificationsQueue.length > maxNotifications) {
            dismissNotification(notificationsQueue.shift());
        }
    };

    /**
     * Close notification by id
     */
    const dismissNotification = function (id) {
        if (notifications[id]) {
            notifications[id].closed = true;
            notifications[id].close();
            delete notifications[id];
        }
    };

    /**
     * Progress a message in chat by element
     */
    const processChatMessage = function (message) {
        //console.log("Chat message!" + message.children[1].innerHTML);
        if (!message || !message.children[1]) {
            return false;
        }
        const smoke = /\/\/goo.gl\/eLDYqh/i;
        const sePostRegex = /\/\/[a-z]*.stackexchange.com|stackoverflow.com|superuser.com|serverfault.com|askubuntu.com|stackapps.com|mathoverflow.net/i;
        const content = message.children[1].innerHTML;
        const textContent = message.children[1].textContent;

        if (!smoke.test(content) || !sePostRegex.test(content)) {
            return false;
        }
        //console.log("Match!");
        const ch = message.children[1].children;
        const msg = {};
        msg.site = false;
        msg.qId = false;

        // Loop through all A tags, in search of a link to a stackexchange site, update information in `msg` with the last SE link
        for (var i = ch.length - 1; i >= 0; i--) {
            if (ch[i].tagName !== 'A') {
                continue;
            }
            const hash = ch[i].href.split('#');
            const path = ch[i].href.split('/');
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
        const parts = textContent.indexOf(': ');
        if (parts < 0) {
            return false;
        }
        const prefixStart = textContent.indexOf('] ');
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
    const registerMessageObserver = function (elm) {
        if (elm === lastMessageObserverTarget) {
            return;
        }

        lastMessageObserverTarget = elm;
        if (lastMessageObserver !== undefined) {
            lastMessageObserver.disconnect();
        }
        const children = elm.getElementsByClassName('message');
        if (children.length) {
            processChatMessage(children[children.length - 1]);
        }
        lastMessageObserver = new MutationObserver(() => processChatMessage(children[children.length - 1]));
        lastMessageObserver.observe(elm, {childList: true});
    };

    /**
     * Register an observer on the .monolog.user-container.user-{*}  element
     */
    const registerMonologObserver = function (elm) {
        const children = elm.getElementsByClassName('messages');
        if (children.length) {
            registerMessageObserver(children[children.length - 1]);
        } else {
            const observer = new MutationObserver(() => {
                registerMessageObserver(children[children.length - 1]);
                observer.disconnect();
            });
            observer.observe(elm, {childList: true});
        }
    };

    /**
     * Register an observer on the #chat element
     */
    const registerObserver = function () {
        Notification.requestPermission();
        const children = target.getElementsByClassName('monologue');
        if (children.length) {
            registerMonologObserver(children[children.length - 1]);
        }
        const observer = new MutationObserver(() => registerMonologObserver(children[children.length - 1]));
        observer.observe(target, {childList: true});
    };

    const sortByKey = function (array, key) {
        return array.sort((a, b) => {
            var x = a[key];
            var y = b[key];
            return ((x < y) ? -1 : ((x > y) ? 1 : 0));
        });
    };

    const getConfigOption = function (key, defaultValue, global) {
        const data = JSON.parse(window.localStorage.getItem(metaData.name + '-' + (!global ? sitename + '-' : '') + key));
        if (data === null) {
            setConfigOption(key, defaultValue, global);
            return defaultValue;
        }
        return data;
    };

    const setConfigOption = function (key, value, global) {
        window.localStorage.setItem(metaData.name + '-' + (!global ? sitename + '-' : '') + key, JSON.stringify(value));
    };

    init();

    const self = {
        setCallback: setCallback,
        restoreCallback: restoreCallback,
        processChatMessage: processChatMessage,
        metaData: metaData
    };
    return self;
})(document.getElementById('chat'), document.getElementById('siterooms'));
