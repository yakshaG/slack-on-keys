const { app, BrowserWindow, Menu, Tray, safeStorage, ipcMain, Notification, shell } = require('electron')
const { globalShortcut } = require('electron/main')
const path = require('path')
const Store = require('electron-store');


//Auto launch
var AutoLaunch = require('auto-launch');
var autoLauncher = new AutoLaunch({
    name: "slack-on-keys"
});
// Checking if autoLaunch is enabled, if not then enabling it.
autoLauncher.isEnabled().then(function (isEnabled) {
    if (isEnabled) return;
    autoLauncher.enable(); slackTokenInputField.value
}).catch(function (err) {
    throw err;
});



// variables
let tray = null
let mainWindow = null
const contextMenu = Menu.buildFromTemplate([
    {
        label: 'Settings',
        click: () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createWindow()
                if (process.platform == 'darwin')
                    app.dock.show()
            }
            mainWindow.show()
            mainWindow.webContents.once("dom-ready", function () {
                mainWindow.webContents.send("read-slack-token", readToken())
            })
        }
    },
    {
        label: 'Quit app',
        click: () => app.quit()
    },
])

const store = new Store()




// processes
app.whenReady().then(() => {
    loadDefaultValues()

    mainWindow = createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            mainWindow = createWindow()
        }
    })

    mainWindow.webContents.once("dom-ready", function () {
        mainWindow.webContents.send("read-slack-token", readToken())
    })
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    setGlobalShortCuts(mainWindow)

    tray = new Tray(path.join(__dirname, 'icon-32.png'))
    tray.setToolTip('This is my application.')
    tray.setContextMenu(contextMenu)
})

app.on('window-all-closed', () => {
    minimise()
})

ipcMain.on("store-slack-token", function (event, token) {
    writeToken(token)
})

ipcMain.on("minimise", function () {
    minimise()
})

ipcMain.on("general-message", function (event, message) {
    console.log("Message: " + message)
})

ipcMain.on("refresh-shortcuts", () => {
    setTimeout(() => {
        setGlobalShortCuts()
    }, 500);
})






// functions
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 900,
        height: 820,
        icon: __dirname + 'icon.icns',
        webPreferences: {
            // preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        }
    })

    mainWindow.loadFile('index.html')
    return mainWindow
}


function setGlobalShortCuts(mainWindow) {
    globalShortcut.unregisterAll()

    globalShortcut.register(`ctrl+${store.get("presence.set")[0]["shortcutKey"]}`, () => setPresence("auto"))
    globalShortcut.register(`ctrl+${store.get("presence.clear")[0]["shortcutKey"]}`, () => setPresence("away"))
    globalShortcut.register(`ctrl+${store.get("dnd.clear")[0]["shortcutKey"]}`, () => clearDND())
    globalShortcut.register(`ctrl+${store.get("status.clear")[0]["shortcutKey"]}`, () => alterStatus("clear", 0))

    for (let i = 0; i < store.get("dnd.set").length; i++) {
        if (store.get("dnd.set")[i]["shortcutKey"] != "")
            globalShortcut.register(`ctrl+${store.get("dnd.set")[i]["shortcutKey"]}`, () => setDND(i))
    }
    for (let i = 0; i < store.get("status.set").length; i++) {
        if (store.get("status.set")[i]["shortcutKey"] != "")
            globalShortcut.register(`ctrl+${store.get("status.set")[i]["shortcutKey"]}`, () => alterStatus("set", i))
    }


}

function minimise() {
    if (BrowserWindow.getAllWindows().length != 0)
        mainWindow.close()
    if (process.platform !== 'darwin')
        return
    else
        app.dock.hide()
}




// Slack functions
function setPresence(type) {
    let token = readToken();

    let requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Bearer ${token}`
        },
        redirect: "follow",
    };

    fetch(`https://slack.com/api/users.setPresence?presence=${type}&pretty=1`, requestOptions)
        .then((result) => {
            if (result.ok == true) {
                new Notification({
                    title: type == "auto" ? `You are now set to active` : `You are now set to away`,
                    body: type == "auto" ? `Let's go!` : `Go get some fresh air!`
                }).show();
            }
            else {
                new Notification({
                    title: `Oops! Could not set to ${type}!`,
                    body: "Please check your Slack token"
                }).show();
            }
        })
        .catch((error) => console.log("error", error));
}

function setDND(index) {
    let token = readToken();
    let DNDExpiry = parseInt(store.get("dnd.set")[index]["dndExpiry"])

    if (!DNDExpiry) {
        new Notification({
            title: `Oops! Notifications not paused!`,
            body: "Please check your Slack token or the notification parameters"
        }).show();
        return
    }

    let requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Bearer ${token}`
        },
        redirect: "follow",
    };

    fetch(`https://slack.com/api/dnd.setSnooze?num_minutes=${DNDExpiry}&pretty=1`, requestOptions)
        .then((result) => {
            if (result.ok == true) {
                new Notification({
                    title: `Slack notifications paused for ${DNDExpiry} minute${DNDExpiry == 1 ? `` : `s`}`,
                    body: "Noise cancellation at your service!"
                }).show();
            }
            else {
                new Notification({
                    title: `Oops! Notifications not paused!`,
                    body: "Please check your Slack token or the notification parameters"
                }).show();
            }
        })
        .catch((error) => console.log("error", error));
}

function clearDND() {
    let token = readToken();

    let requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Bearer ${token}`
        },
        redirect: "follow",
    };

    fetch(`https://slack.com/api/dnd.endSnooze?pretty=1`, requestOptions)
        .then((result) => {
            if (result.ok == true) {
                new Notification({
                    title: `Slack notifications resumed`,
                    body: "Ding ding ding!"
                }).show();
            }
            else {
                new Notification({
                    title: `Oops! Notifications not resumed!`,
                    body: "Please check your Slack token"
                }).show();
            }
        })
        .catch((error) => console.log("error", error));
}

function alterStatus(type, index) {
    let token = readToken();
    let statusEmojiText = store.get("status.set")[index]["statusEmojiText"]
    let statusText = store.get("status.set")[index]["statusText"]
    let statusExpiryText = parseInt(store.get("status.set")[index]["statusExpiry"])
    let statusExpiry = statusExpiryText > 0 ? (statusExpiryText * 60) + Date.now() / 1000 : 0;
    let raw = JSON.stringify({
        profile: {
            status_emoji: type == "set" ? statusEmojiText : ``,
            status_text: type == "set" ? statusText : ``,
            status_expiration: statusExpiry,
        }
    })

    let requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: raw,
        redirect: "follow",
    };

    fetch("https://slack.com/api/users.profile.set", requestOptions)
        .then((response) => response.json())
        .then((result) => {
            if (result.ok == true) {
                new Notification({
                    title: `Slack status ${type == "set" ? `set ${statusExpiryText > 0 ? `for the next ${statusExpiryText} minute${statusExpiryText == 1 ? `` : `s`}` : ``}` : `cleared`}`,
                    body: type == "set" ? `Communication is the key, isn't it?` : `Alrighty!`
                }).show();
            }
            else {
                new Notification({
                    title: `Oops! Could not set status!`,
                    body: `Please check your Slack token or the status parameters`
                }).show();
            }
        })
        .catch((error) => console.log("error", error));
}






// helpers
function loadDefaultValues() {
    if (store.has("token"))
        return
    else
        store.store = {
            "token": "",
            "presence": {
                "set": [
                    {
                        "shortcutKey": "1"
                    }
                ],
                "clear": [
                    {
                        "shortcutKey": "2"
                    }
                ]
            },
            "dnd": {
                "set": [
                    {
                        "shortcutKey": "3",
                        "dndExpiry": "30"
                    }
                ],
                "clear": [
                    {
                        "shortcutKey": "4"
                    }
                ]
            },
            "status": {
                "set": [
                    {
                        "shortcutKey": "5",
                        "statusEmojiText": ":pizza:",
                        "statusText": "Lunch",
                        "statusExpiry": "60"
                    }
                ],
                "clear": [
                    {
                        "shortcutKey": "6"
                    }
                ]
            }
        };
}

function writeToken(token) {
    let encryptedToken = safeStorage.encryptString(token).toString('latin1')
    store.set("token", encryptedToken)
}

function readToken() {
    if (store.get("token") == undefined)
        return ``
    else {
        let decryptedToken = safeStorage.decryptString(Buffer.from(store.get("token"), "latin1"))
        return decryptedToken
    }
}

